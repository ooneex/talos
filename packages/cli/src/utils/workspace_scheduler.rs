use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::process::Command;
use std::sync::mpsc::channel;
use std::time::Instant;

use super::workspace_task::{Task, TaskStatus};
use crate::utils::{
    CacheEntryMeta, CacheIndex, FileHashCache, FingerprintMemo, Footer, WORKSPACE_CACHE_VERSION,
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
    pub footer: &'a Footer,
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

pub(crate) fn run_group(tasks: &mut [Task], ctx: SchedulerContext) -> bool {
    for task in tasks.iter() {
        if task.status == TaskStatus::Skipped {
            report_finish(task, ctx.footer);
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
    let limit = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
        .max(1);
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
                ctx.footer.task_started(&tasks[index].label);

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
            report_finish(&tasks[index], ctx.footer);
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
use report::report_finish;
pub use report::{failure_excerpt, finish_lines};

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
        let footer = Footer::start(tasks.len());

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
                footer: &footer,
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
}
