use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::process::Command;
use std::sync::mpsc::channel;
use std::time::Instant;

use super::workspace_task::{Task, TaskStatus};
use crate::utils::{
    CacheEntryMeta, CacheIndex, FileHashCache, FingerprintMemo, Loader, WORKSPACE_CACHE_VERSION,
    WorkspaceTarget, compute_task_hash, read_cache_entry, write_cache_entry,
};

enum TaskOutcome {
    Cached {
        hash: String,
        duration_ms: u64,
    },
    Ran {
        hash: Option<String>,
        output: String,
        exit_code: Option<i32>,
        success: bool,
        duration_ms: u64,
    },
}

/// Everything a scheduling pass needs beyond the tasks it mutates. Bundling
/// these together — rather than threading each one through as its own
/// parameter — is what keeps `run_group` and `run_biome_batch_pass` from
/// repeating the same eleven-parameter signature.
#[derive(Clone, Copy)]
pub(crate) struct SchedulerContext<'a> {
    /// All workspace targets, keyed by `WorkspaceTarget::key` and built once
    /// per run, so target lookups (cache hits, dependency resolution) are
    /// O(1) instead of re-scanning the full target list per task.
    pub by_key: &'a HashMap<&'a str, &'a WorkspaceTarget>,
    pub root_dir: &'a Path,
    pub root_hash: &'a str,
    pub cache_dir: &'a Path,
    pub fingerprint_memo: &'a FingerprintMemo,
    pub use_git: bool,
    pub no_cache: bool,
    pub file_hash_cache: &'a FileHashCache,
    pub cache_index: &'a CacheIndex,
    /// The bar this run reports its progress through, and which of its rows
    /// belongs to this group of tasks — `workspace:run` gives every command
    /// its own row, so one `Loader` can show several at once.
    pub loader: &'a Loader,
    pub loader_group: usize,
    /// How many tasks the pass runs at once. `None` fans out to one task per
    /// core; a command whose tasks spawn workers of their own — `test`, where
    /// every suite is already a `bun test --parallel` — passes a smaller
    /// number so the machine is not oversubscribed.
    pub concurrency: Option<usize>,
}

/// Runs one task to completion: checks the cache when eligible, otherwise
/// spawns the task's command and captures its combined output, exit code and
/// duration. This is the body that used to live inline in the `scope.spawn`
/// closure inside `run_group`.
fn execute_task(
    argv: Vec<String>,
    cwd: std::path::PathBuf,
    cacheable: bool,
    command: String,
    target_key: Option<String>,
    ctx: SchedulerContext,
) -> TaskOutcome {
    let cache = if cacheable && !ctx.no_cache {
        try_cache_hit(
            target_key.as_deref(),
            &command,
            ctx.by_key,
            ctx.root_hash,
            ctx.cache_dir,
            ctx.fingerprint_memo,
            ctx.use_git,
            ctx.file_hash_cache,
            ctx.cache_index,
        )
    } else {
        None
    };

    match cache {
        Some(TaskHashResult {
            hash,
            hit: Some(hit),
        }) => TaskOutcome::Cached {
            hash,
            duration_ms: hit.duration_ms,
        },
        other => {
            let hash = other.map(|r| r.hash);
            let started = Instant::now();
            let result = Command::new(&argv[0])
                .args(&argv[1..])
                .current_dir(&cwd)
                .output();
            let duration_ms = started.elapsed().as_millis() as u64;
            match result {
                Ok(output) => TaskOutcome::Ran {
                    hash,
                    output: format!(
                        "{}{}",
                        String::from_utf8_lossy(&output.stdout),
                        String::from_utf8_lossy(&output.stderr)
                    ),
                    exit_code: output.status.code(),
                    success: output.status.success(),
                    duration_ms,
                },
                Err(error) => TaskOutcome::Ran {
                    hash,
                    output: error.to_string(),
                    exit_code: Some(1),
                    success: false,
                    duration_ms,
                },
            }
        }
    }
}

/// Applies a finished task's outcome to its `Task`, writing a cache entry
/// when the task succeeded and was cacheable.
fn apply_outcome(task: &mut Task, outcome: TaskOutcome, ctx: SchedulerContext, failed: &mut bool) {
    match outcome {
        TaskOutcome::Cached { hash, duration_ms } => {
            task.hash = Some(hash);
            task.duration_ms = duration_ms;
            task.status = TaskStatus::Cached;
        }
        TaskOutcome::Ran {
            hash,
            output,
            exit_code,
            success,
            duration_ms,
        } => {
            task.hash = hash;
            task.output = output;
            task.exit_code = exit_code;
            task.duration_ms = duration_ms;
            if success {
                task.status = TaskStatus::Success;
                cache_successful_task(task, ctx);
            } else {
                task.status = TaskStatus::Failed;
                *failed = true;
            }
        }
    }
}

/// Writes a cache entry for a task that just succeeded, when it is cacheable
/// and its target can still be resolved.
fn cache_successful_task(task: &Task, ctx: SchedulerContext) {
    if !task.cacheable {
        return;
    }
    let Some(hash) = &task.hash else {
        return;
    };
    let Some(target_key) = &task.target_key else {
        return;
    };
    let Some(target) = ctx.by_key.get(target_key.as_str()) else {
        return;
    };

    write_cache_entry(
        ctx.cache_dir,
        ctx.cache_index,
        &CacheEntryMeta {
            version: WORKSPACE_CACHE_VERSION,
            target: target.key.clone(),
            command: task.command.clone(),
            hash: hash.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            duration_ms: task.duration_ms,
        },
    );
}

/// One task per core — what a pass runs when `--concurrency` says nothing.
pub(crate) fn default_concurrency() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
        .max(1)
}

pub(crate) fn run_group(tasks: &mut [Task], ctx: SchedulerContext) -> bool {
    for task in tasks.iter() {
        if task.status == TaskStatus::Skipped {
            // A skipped task never runs, so it is counted rather than named
            // as running.
            ctx.loader.advance(ctx.loader_group);
        }
    }

    // Phase 1 batching: collapse same-tool, order-independent commands (currently
    // pure biome scripts like `fmt`) into a single process over every dirty
    // target instead of spawning `bun run` per target. Cache hits are filtered
    // first, so only the misses hit the batched tool invocation.
    let mut failed = run_biome_batch_pass(tasks, ctx);

    let mut done: HashSet<String> = tasks
        .iter()
        .filter(|t| t.status != TaskStatus::Pending)
        .map(|t| t.key.clone())
        .collect();
    let limit = ctx.concurrency.unwrap_or_else(default_concurrency).max(1);
    let mut launched = vec![false; tasks.len()];

    std::thread::scope(|scope| {
        let (tx, rx) = channel::<(usize, TaskOutcome)>();
        let mut inflight = 0usize;

        loop {
            while !failed && inflight < limit {
                let next = (0..tasks.len()).find(|&i| {
                    !launched[i]
                        && tasks[i].status == TaskStatus::Pending
                        && tasks[i].deps.iter().all(|d| done.contains(d))
                });
                let Some(index) = next else { break };

                launched[index] = true;
                inflight += 1;
                ctx.loader
                    .entered(ctx.loader_group, tasks[index].label.clone());

                let argv = tasks[index].argv.clone();
                let cwd = tasks[index].cwd.clone();
                let cacheable = tasks[index].cacheable;
                let command = tasks[index].command.clone();
                let target_key = tasks[index].target_key.clone();
                let tx = tx.clone();

                scope.spawn(move || {
                    let outcome = execute_task(argv, cwd, cacheable, command, target_key, ctx);
                    let _ = tx.send((index, outcome));
                });
            }

            if inflight == 0 {
                break;
            }

            let Ok((index, outcome)) = rx.recv() else {
                failed = true;
                break;
            };
            inflight -= 1;

            {
                let task = &mut tasks[index];
                apply_outcome(task, outcome, ctx, &mut failed);
            }

            done.insert(tasks[index].key.clone());
            ctx.loader.left(ctx.loader_group, &tasks[index].label);
        }
    });

    failed
}

/// Groups the still-pending tasks by their biome argument signature and, for any
/// group with more than one target, runs a single batched biome process over all
/// dirty targets. Returns `true` if any batched target failed.
#[path = "workspace_scheduler/biome_batch.rs"]
mod biome_batch;
use biome_batch::run_biome_batch_pass;

struct TaskHashResult {
    hash: String,
    hit: Option<CacheHit>,
}

struct CacheHit {
    duration_ms: u64,
}

#[allow(clippy::too_many_arguments)]
fn try_cache_hit(
    target_key: Option<&str>,
    command: &str,
    by_key: &HashMap<&str, &WorkspaceTarget>,
    root_hash: &str,
    cache_dir: &Path,
    fingerprint_memo: &FingerprintMemo,
    use_git: bool,
    file_hash_cache: &FileHashCache,
    cache_index: &CacheIndex,
) -> Option<TaskHashResult> {
    let target_key = target_key?;
    let target = *by_key.get(target_key)?;

    let hash = compute_task_hash(
        target,
        command,
        by_key,
        root_hash,
        fingerprint_memo,
        use_git,
        file_hash_cache,
    );

    let hit = read_cache_entry(cache_dir, cache_index, &hash).map(|meta| CacheHit {
        duration_ms: meta.duration_ms,
    });

    Some(TaskHashResult { hash, hit })
}

#[path = "workspace_scheduler/report.rs"]
mod report;
pub use report::{failure_excerpt, finish_lines, print_task_report};

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;

    fn make_task(key: &str, target_key: &str) -> Task {
        Task {
            key: key.to_string(),
            label: key.to_string(),
            target_key: Some(target_key.to_string()),
            command: "fmt".to_string(),
            cwd: PathBuf::from("/repo"),
            argv: vec!["bun".to_string(), "run".to_string(), "fmt".to_string()],
            cacheable: false,
            deps: Vec::new(),
            status: TaskStatus::Pending,
            output: String::new(),
            exit_code: None,
            duration_ms: 0,
            hash: None,
        }
    }

    fn make_target(root: &Path, key: &str, name: &str) -> WorkspaceTarget {
        let mut scripts = HashMap::new();
        scripts.insert("fmt".to_string(), "biome check --write".to_string());
        WorkspaceTarget {
            key: key.to_string(),
            name: name.to_string(),
            target_type: crate::utils::TargetType::Module,
            dir: root.join(key),
            scripts,
            direct_scripts: false,
            workspace_deps: Vec::new(),
        }
    }

    fn write_executable(path: &Path, content: &str) {
        fs::create_dir_all(path.parent().expect("parent")).expect("create parent");
        fs::write(path, content).expect("write script");
        let mut permissions = fs::metadata(path).expect("metadata").permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).expect("permissions");
    }

    /// Sets up the two-module `app`/`web` fixture shared by the biome batch tests
    /// below, writes the given fake `biome` script, and runs the batch pass.
    /// Returns the mutated tasks alongside the pass's failure flag.
    fn run_biome_batch_fixture(root: &Path, cache: &Path, biome_script: &str) -> (Vec<Task>, bool) {
        write_executable(&root.join("node_modules/.bin/biome"), biome_script);
        fs::create_dir_all(root.join("modules/app")).expect("module dir");
        fs::create_dir_all(root.join("modules/web")).expect("module dir");

        let mut tasks = vec![
            make_task("app#fmt", "modules/app"),
            make_task("web#fmt", "modules/web"),
        ];
        let targets = vec![
            make_target(root, "modules/app", "app"),
            make_target(root, "modules/web", "web"),
        ];
        let by_key: HashMap<&str, &WorkspaceTarget> =
            targets.iter().map(|t| (t.key.as_str(), t)).collect();
        let loader = Loader::start(vec![crate::utils::LoaderGroup::new("fmt", tasks.len())]);

        let failed = run_biome_batch_pass(
            &mut tasks,
            SchedulerContext {
                by_key: &by_key,
                root_dir: root,
                root_hash: "root-hash",
                cache_dir: cache,
                fingerprint_memo: &FingerprintMemo::new(),
                use_git: false,
                no_cache: true,
                file_hash_cache: &FileHashCache::new(),
                cache_index: &CacheIndex::new(),
                loader: &loader,
                loader_group: 0,
                concurrency: None,
            },
        );

        (tasks, failed)
    }

    #[test]
    fn biome_batch_pass_marks_all_targets_successful_on_one_clean_run() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        let (tasks, failed) = run_biome_batch_fixture(
            root.path(),
            cache.path(),
            &format!(
                "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"{}\"\nexit 0\n",
                root.path().join("biome.log").display()
            ),
        );

        assert!(!failed);
        assert!(tasks.iter().all(|task| task.status == TaskStatus::Success));
        let log = fs::read_to_string(root.path().join("biome.log")).expect("log");
        assert!(log.contains("check --write modules/app modules/web"));
    }

    #[test]
    fn biome_batch_pass_attributes_global_failures_to_every_target() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        let (tasks, failed) = run_biome_batch_fixture(
            root.path(),
            cache.path(),
            "#!/bin/sh\necho 'global failure' >&2\nexit 1\n",
        );

        assert!(failed);
        assert!(tasks.iter().all(|task| task.status == TaskStatus::Failed));
        assert!(
            tasks
                .iter()
                .all(|task| task.output.contains("global failure"))
        );
    }

    /// A `SchedulerContext` wired to the given fixtures, with `no_cache` set so
    /// tests that do not care about caching do not have to think about it.
    #[allow(clippy::too_many_arguments)]
    fn make_ctx<'a>(
        root: &'a Path,
        cache: &'a Path,
        by_key: &'a HashMap<&'a str, &'a WorkspaceTarget>,
        cache_index: &'a CacheIndex,
        memo: &'a FingerprintMemo,
        file_hash_cache: &'a FileHashCache,
        loader: &'a Loader,
        no_cache: bool,
    ) -> SchedulerContext<'a> {
        SchedulerContext {
            by_key,
            root_dir: root,
            root_hash: "root-hash",
            cache_dir: cache,
            fingerprint_memo: memo,
            use_git: false,
            no_cache,
            file_hash_cache,
            cache_index,
            loader,
            loader_group: 0,
            concurrency: None,
        }
    }

    // -----------------------------------------------------------------------
    // try_cache_hit
    // -----------------------------------------------------------------------

    #[test]
    fn try_cache_hit_returns_none_without_a_target_key() {
        let by_key: HashMap<&str, &WorkspaceTarget> = HashMap::new();
        let cache = tempfile::tempdir().expect("tempdir");

        let result = try_cache_hit(
            None,
            "fmt",
            &by_key,
            "root-hash",
            cache.path(),
            &FingerprintMemo::new(),
            false,
            &FileHashCache::new(),
            &CacheIndex::new(),
        );

        assert!(result.is_none());
    }

    #[test]
    fn try_cache_hit_returns_none_for_an_unknown_target() {
        let by_key: HashMap<&str, &WorkspaceTarget> = HashMap::new();
        let cache = tempfile::tempdir().expect("tempdir");

        let result = try_cache_hit(
            Some("modules/missing"),
            "fmt",
            &by_key,
            "root-hash",
            cache.path(),
            &FingerprintMemo::new(),
            false,
            &FileHashCache::new(),
            &CacheIndex::new(),
        );

        assert!(result.is_none());
    }

    #[test]
    fn try_cache_hit_reports_a_miss_then_a_hit_once_the_entry_is_written() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(root.path().join("modules/app")).expect("module dir");
        fs::write(root.path().join("modules/app/file.txt"), "hello").expect("write file");

        let target = make_target(root.path(), "modules/app", "app");
        let by_key: HashMap<&str, &WorkspaceTarget> =
            HashMap::from([(target.key.as_str(), &target)]);
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let cache_index = CacheIndex::new();

        let miss = try_cache_hit(
            Some("modules/app"),
            "fmt",
            &by_key,
            "root-hash",
            cache.path(),
            &memo,
            false,
            &file_hash_cache,
            &cache_index,
        )
        .expect("a resolvable target always returns its hash");
        assert!(miss.hit.is_none());

        write_cache_entry(
            cache.path(),
            &cache_index,
            &CacheEntryMeta {
                version: WORKSPACE_CACHE_VERSION,
                target: target.key.clone(),
                command: "fmt".to_string(),
                hash: miss.hash.clone(),
                created_at: chrono::Utc::now().to_rfc3339(),
                duration_ms: 42,
            },
        );

        let hit = try_cache_hit(
            Some("modules/app"),
            "fmt",
            &by_key,
            "root-hash",
            cache.path(),
            &memo,
            false,
            &file_hash_cache,
            &cache_index,
        )
        .expect("a resolvable target always returns its hash");
        assert_eq!(hit.hit.map(|h| h.duration_ms), Some(42));
    }

    // -----------------------------------------------------------------------
    // execute_task
    // -----------------------------------------------------------------------

    #[test]
    fn execute_task_returns_a_cached_outcome_when_the_cache_hits() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(root.path().join("modules/app")).expect("module dir");
        fs::write(root.path().join("modules/app/file.txt"), "hello").expect("write file");

        let target = make_target(root.path(), "modules/app", "app");
        let by_key: HashMap<&str, &WorkspaceTarget> =
            HashMap::from([(target.key.as_str(), &target)]);
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let cache_index = CacheIndex::new();

        let hash = compute_task_hash(
            &target,
            "fmt",
            &by_key,
            "root-hash",
            &memo,
            false,
            &file_hash_cache,
        );
        write_cache_entry(
            cache.path(),
            &cache_index,
            &CacheEntryMeta {
                version: WORKSPACE_CACHE_VERSION,
                target: target.key.clone(),
                command: "fmt".to_string(),
                hash: hash.clone(),
                created_at: chrono::Utc::now().to_rfc3339(),
                duration_ms: 77,
            },
        );

        let loader = Loader::hidden();
        let ctx = make_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            false,
        );

        let outcome = execute_task(
            vec!["sh".to_string(), "-c".to_string(), "exit 0".to_string()],
            root.path().join("modules/app"),
            true,
            "fmt".to_string(),
            Some("modules/app".to_string()),
            ctx,
        );

        match outcome {
            TaskOutcome::Cached {
                hash: got_hash,
                duration_ms,
            } => {
                assert_eq!(got_hash, hash);
                assert_eq!(duration_ms, 77);
            }
            TaskOutcome::Ran { .. } => panic!("expected a cache hit"),
        }
    }

    #[test]
    fn execute_task_reports_failure_when_the_command_cannot_be_spawned() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        let by_key: HashMap<&str, &WorkspaceTarget> = HashMap::new();
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = make_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );

        let outcome = execute_task(
            vec!["/nonexistent/talos-test-binary-xyz".to_string()],
            root.path().to_path_buf(),
            false,
            "fmt".to_string(),
            None,
            ctx,
        );

        match outcome {
            TaskOutcome::Ran {
                success,
                exit_code,
                output,
                ..
            } => {
                assert!(!success);
                assert_eq!(exit_code, Some(1));
                assert!(!output.is_empty());
            }
            TaskOutcome::Cached { .. } => panic!("expected the spawn failure to be reported"),
        }
    }

    // -----------------------------------------------------------------------
    // apply_outcome
    // -----------------------------------------------------------------------

    #[test]
    fn apply_outcome_applies_a_cached_result() {
        let mut task = make_task("app#fmt", "modules/app");
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        let by_key: HashMap<&str, &WorkspaceTarget> = HashMap::new();
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = make_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );
        let mut failed = false;

        apply_outcome(
            &mut task,
            TaskOutcome::Cached {
                hash: "abc".to_string(),
                duration_ms: 5,
            },
            ctx,
            &mut failed,
        );

        assert_eq!(task.status, TaskStatus::Cached);
        assert_eq!(task.hash, Some("abc".to_string()));
        assert_eq!(task.duration_ms, 5);
        assert!(!failed);
    }

    #[test]
    fn apply_outcome_marks_the_run_failed_on_a_failing_task() {
        let mut task = make_task("app#fmt", "modules/app");
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        let by_key: HashMap<&str, &WorkspaceTarget> = HashMap::new();
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = make_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );
        let mut failed = false;

        apply_outcome(
            &mut task,
            TaskOutcome::Ran {
                hash: None,
                output: "boom".to_string(),
                exit_code: Some(1),
                success: false,
                duration_ms: 9,
            },
            ctx,
            &mut failed,
        );

        assert_eq!(task.status, TaskStatus::Failed);
        assert!(failed);
    }

    // -----------------------------------------------------------------------
    // cache_successful_task
    // -----------------------------------------------------------------------

    #[test]
    fn cache_successful_task_skips_a_task_that_is_not_cacheable() {
        let mut task = make_task("app#fmt", "modules/app");
        task.cacheable = false;
        task.hash = Some("abc".to_string());
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        let by_key: HashMap<&str, &WorkspaceTarget> = HashMap::new();
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = make_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );

        cache_successful_task(&task, ctx);

        assert!(cache_index.is_empty());
    }

    #[test]
    fn cache_successful_task_skips_a_task_without_a_hash() {
        let mut task = make_task("app#fmt", "modules/app");
        task.cacheable = true;
        task.hash = None;
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        let by_key: HashMap<&str, &WorkspaceTarget> = HashMap::new();
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = make_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );

        cache_successful_task(&task, ctx);

        assert!(cache_index.is_empty());
    }

    #[test]
    fn cache_successful_task_skips_a_task_without_a_target_key() {
        let mut task = make_task("app#fmt", "modules/app");
        task.cacheable = true;
        task.hash = Some("abc".to_string());
        task.target_key = None;
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        let by_key: HashMap<&str, &WorkspaceTarget> = HashMap::new();
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = make_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );

        cache_successful_task(&task, ctx);

        assert!(cache_index.is_empty());
    }

    #[test]
    fn cache_successful_task_skips_when_the_target_cannot_be_resolved() {
        let mut task = make_task("app#fmt", "modules/app");
        task.cacheable = true;
        task.hash = Some("abc".to_string());
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        let by_key: HashMap<&str, &WorkspaceTarget> = HashMap::new();
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = make_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );

        cache_successful_task(&task, ctx);

        assert!(cache_index.is_empty());
    }

    #[test]
    fn cache_successful_task_writes_a_cache_entry_when_everything_resolves() {
        let mut task = make_task("app#fmt", "modules/app");
        task.cacheable = true;
        task.hash = Some("abc123".to_string());
        task.duration_ms = 55;
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        let target = make_target(root.path(), "modules/app", "app");
        let by_key: HashMap<&str, &WorkspaceTarget> =
            HashMap::from([(target.key.as_str(), &target)]);
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = make_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );

        cache_successful_task(&task, ctx);

        let entry = read_cache_entry(cache.path(), &cache_index, "abc123").expect("entry written");
        assert_eq!(entry.duration_ms, 55);
        assert_eq!(entry.target, "modules/app");
    }

    // -----------------------------------------------------------------------
    // run_group
    // -----------------------------------------------------------------------

    #[test]
    fn run_group_counts_skipped_tasks_without_running_them() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");

        let mut skipped = make_task("skip#fmt", "modules/skip");
        skipped.status = TaskStatus::Skipped;
        let mut runnable = make_task("app#fmt", "modules/app");
        runnable.cwd = root.path().to_path_buf();
        runnable.argv = vec!["sh".to_string(), "-c".to_string(), "exit 0".to_string()];
        let mut tasks = vec![skipped, runnable];

        let by_key: HashMap<&str, &WorkspaceTarget> = HashMap::new();
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = make_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );

        let failed = run_group(&mut tasks, ctx);

        assert!(!failed);
        assert_eq!(tasks[0].status, TaskStatus::Skipped);
        assert_eq!(tasks[1].status, TaskStatus::Success);
    }

    #[test]
    fn run_group_runs_dependents_after_their_dependency_and_flags_failures() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");

        let mut first = make_task("app#build", "modules/app");
        first.cwd = root.path().to_path_buf();
        first.argv = vec!["sh".to_string(), "-c".to_string(), "exit 0".to_string()];

        let mut second = make_task("app#test", "modules/app");
        second.cwd = root.path().to_path_buf();
        second.argv = vec!["sh".to_string(), "-c".to_string(), "exit 1".to_string()];
        second.deps = vec!["app#build".to_string()];

        let mut tasks = vec![first, second];

        let by_key: HashMap<&str, &WorkspaceTarget> = HashMap::new();
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = make_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );

        let failed = run_group(&mut tasks, ctx);

        assert!(failed);
        assert_eq!(tasks[0].status, TaskStatus::Success);
        assert_eq!(tasks[1].status, TaskStatus::Failed);
    }
}
