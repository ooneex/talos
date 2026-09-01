// Batching biome invocations across targets that share the same fixable
// arguments, so `workspace:run` calls biome once per argument set instead
// of once per target — split out of the parent module to keep it under
// the file-size budget.

use std::collections::{HashMap, HashSet};
use std::process::Command;
use std::time::Instant;

use super::SchedulerContext;
use crate::utils::workspace_batch::{
    parse_biome_script, section_has_error, split_biome_output_by_target,
};
use crate::utils::workspace_task::{Task, TaskStatus};
use crate::utils::{
    CacheEntryMeta, WORKSPACE_CACHE_VERSION, compute_task_hash, read_cache_entry,
    resolve_biome_command, write_cache_entry,
};

pub(super) fn run_biome_batch_pass(tasks: &mut [Task], ctx: SchedulerContext) -> bool {
    let mut groups: HashMap<Vec<String>, Vec<usize>> = HashMap::new();
    for (index, task) in tasks.iter().enumerate() {
        if task.status != TaskStatus::Pending {
            continue;
        }
        let Some(target_key) = task.target_key.as_deref() else {
            continue;
        };
        let Some(target) = ctx.by_key.get(target_key) else {
            continue;
        };
        let Some(script) = target.scripts.get(&task.command) else {
            continue;
        };
        let Some(args) = parse_biome_script(script) else {
            continue;
        };
        groups.entry(args).or_default().push(index);
    }

    let mut any_failed = false;
    for (biome_args, indices) in groups {
        // A single-target group has the same cost as the normal per-target path,
        // so leave it for the scheduler loop.
        if indices.len() < 2 {
            continue;
        }
        any_failed |= run_one_biome_batch(tasks, &indices, &biome_args, ctx);
    }
    any_failed
}

fn run_one_biome_batch(
    tasks: &mut [Task],
    indices: &[usize],
    biome_args: &[String],
    ctx: SchedulerContext,
) -> bool {
    // Filter cache hits up front; only the misses are handed to biome.
    let mut any_failed = false;
    let mut miss_indices: Vec<usize> = Vec::new();
    let mut miss_hashes: HashMap<usize, String> = HashMap::new();
    for &index in indices {
        let hash = if tasks[index].cacheable && !ctx.no_cache {
            tasks[index].target_key.as_ref().and_then(|key| {
                ctx.by_key.get(key.as_str()).map(|target| {
                    compute_task_hash(
                        target,
                        &tasks[index].command,
                        ctx.by_key,
                        ctx.root_hash,
                        ctx.fingerprint_memo,
                        ctx.use_git,
                        ctx.file_hash_cache,
                    )
                })
            })
        } else {
            None
        };

        if let Some(hash) = &hash
            && let Some(meta) = read_cache_entry(ctx.cache_dir, ctx.cache_index, hash)
        {
            tasks[index].hash = Some(hash.clone());
            tasks[index].duration_ms = meta.duration_ms;
            tasks[index].output = meta.output;
            tasks[index].exit_code = meta.exit_code;
            tasks[index].status = if meta.success {
                TaskStatus::Cached
            } else {
                any_failed = true;
                TaskStatus::CachedFailure
            };
            // A cache hit is not work in flight, so it is counted rather
            // than named as running.
            ctx.loader.advance(ctx.loader_group);
            continue;
        }

        if let Some(hash) = hash {
            miss_hashes.insert(index, hash);
        }
        miss_indices.push(index);
    }

    if miss_indices.is_empty() {
        return any_failed;
    }

    for &index in &miss_indices {
        ctx.loader
            .entered(ctx.loader_group, tasks[index].label.clone());
    }

    let keys: Vec<String> = miss_indices
        .iter()
        .filter_map(|&index| tasks[index].target_key.clone())
        .collect();

    let mut argv = resolve_biome_command(ctx.root_dir);
    argv.extend(biome_args.iter().cloned());
    argv.extend(keys.iter().cloned());

    let started = Instant::now();
    let result = Command::new(&argv[0])
        .args(&argv[1..])
        .current_dir(ctx.root_dir)
        .output();
    let duration_ms = started.elapsed().as_millis() as u64;

    let (output, success, exit_code, completed) = match result {
        Ok(output) => (
            format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            ),
            output.status.success(),
            output.status.code(),
            true,
        ),
        Err(error) => (error.to_string(), false, Some(1), false),
    };

    let per_target = if success {
        HashMap::new()
    } else {
        split_biome_output_by_target(&output, &keys)
    };
    // Only targets whose section carries an error-severity diagnostic own the
    // failure; fixable warnings printed for a passing target must not fail it.
    let error_keys: HashSet<String> = keys
        .iter()
        .filter(|key| {
            per_target
                .get(*key)
                .is_some_and(|section| section_has_error(section))
        })
        .cloned()
        .collect();
    // When biome fails but no diagnostic maps to a specific target (e.g. a global
    // configuration error), fail every batched target so nothing slips through.
    let attribute_all = !success && error_keys.is_empty();

    for &index in &miss_indices {
        let key = tasks[index].target_key.clone().unwrap_or_default();
        let target_failed = !success && (attribute_all || error_keys.contains(&key));
        tasks[index].duration_ms = duration_ms;

        if target_failed {
            tasks[index].status = TaskStatus::Failed;
            tasks[index].exit_code = exit_code;
            tasks[index].output = per_target
                .get(&key)
                .cloned()
                .unwrap_or_else(|| output.clone());
            any_failed = true;
        } else {
            tasks[index].status = TaskStatus::Success;
        }
        if completed && let Some(hash) = miss_hashes.remove(&index) {
            tasks[index].hash = Some(hash.clone());
            cache_batched_task(&tasks[index], &key, hash, duration_ms, ctx);
        }
        ctx.loader.left(ctx.loader_group, &tasks[index].label);
    }

    any_failed
}

/// Writes a cache entry for one target of a completed batched biome run.
fn cache_batched_task(
    task: &Task,
    key: &str,
    hash: String,
    duration_ms: u64,
    ctx: SchedulerContext,
) {
    let Some(target) = ctx.by_key.get(key) else {
        return;
    };
    let success = task.status == TaskStatus::Success;
    write_cache_entry(
        ctx.cache_dir,
        ctx.cache_index,
        &CacheEntryMeta {
            version: WORKSPACE_CACHE_VERSION,
            target: target.key.clone(),
            command: task.command.clone(),
            hash,
            created_at: chrono::Utc::now().to_rfc3339(),
            duration_ms,
            success,
            exit_code: task.exit_code,
            output: if success {
                String::new()
            } else {
                task.output.clone()
            },
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::{
        CacheIndex, FileHashCache, FingerprintMemo, Loader, TargetType, WorkspaceTarget,
    };
    use std::collections::HashMap;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::{Path, PathBuf};

    fn make_task(key: &str, target_key: &str, command: &str) -> Task {
        Task {
            key: key.to_string(),
            label: key.to_string(),
            target_key: Some(target_key.to_string()),
            command: command.to_string(),
            cwd: PathBuf::from("/repo"),
            argv: vec!["bun".to_string(), "run".to_string(), command.to_string()],
            cacheable: false,
            deps: Vec::new(),
            status: TaskStatus::Pending,
            output: String::new(),
            exit_code: None,
            duration_ms: 0,
            hash: None,
        }
    }

    fn make_target(
        root: &Path,
        key: &str,
        name: &str,
        command: &str,
        script: &str,
    ) -> WorkspaceTarget {
        let mut scripts = HashMap::new();
        scripts.insert(command.to_string(), script.to_string());
        WorkspaceTarget {
            key: key.to_string(),
            name: name.to_string(),
            target_type: TargetType::Module,
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

    #[allow(clippy::too_many_arguments)]
    fn base_ctx<'a>(
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

    // -------------------------------------------------------------------
    // run_biome_batch_pass grouping guards
    // -------------------------------------------------------------------

    #[test]
    fn run_biome_batch_pass_ignores_tasks_that_are_not_pending_and_leaves_lone_targets_alone() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        write_executable(
            &root.path().join("node_modules/.bin/biome"),
            "#!/bin/sh\nexit 0\n",
        );
        fs::create_dir_all(root.path().join("modules/app")).expect("dir");
        fs::create_dir_all(root.path().join("modules/web")).expect("dir");

        let mut app = make_task("app#fmt", "modules/app", "fmt");
        app.status = TaskStatus::Success;
        let web = make_task("web#fmt", "modules/web", "fmt");
        let mut tasks = vec![app, web];

        let targets = vec![
            make_target(
                root.path(),
                "modules/app",
                "app",
                "fmt",
                "biome check --write",
            ),
            make_target(
                root.path(),
                "modules/web",
                "web",
                "fmt",
                "biome check --write",
            ),
        ];
        let by_key: HashMap<&str, &WorkspaceTarget> =
            targets.iter().map(|t| (t.key.as_str(), t)).collect();
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = base_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );

        let failed = run_biome_batch_pass(&mut tasks, ctx);

        assert!(!failed);
        assert_eq!(tasks[0].status, TaskStatus::Success);
        // Only one pending target remains once the already-finished one is
        // excluded, so the group is too small to batch and is left for the
        // scheduler loop instead.
        assert_eq!(tasks[1].status, TaskStatus::Pending);
    }

    #[test]
    fn run_biome_batch_pass_ignores_tasks_without_a_target_key() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        let mut task = make_task("solo#fmt", "modules/solo", "fmt");
        task.target_key = None;
        let mut tasks = vec![task];
        let by_key: HashMap<&str, &WorkspaceTarget> = HashMap::new();
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = base_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );

        let failed = run_biome_batch_pass(&mut tasks, ctx);

        assert!(!failed);
        assert_eq!(tasks[0].status, TaskStatus::Pending);
    }

    #[test]
    fn run_biome_batch_pass_ignores_tasks_whose_target_cannot_be_resolved() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        let mut tasks = vec![make_task("app#fmt", "modules/app", "fmt")];
        let by_key: HashMap<&str, &WorkspaceTarget> = HashMap::new();
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = base_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );

        let failed = run_biome_batch_pass(&mut tasks, ctx);

        assert!(!failed);
        assert_eq!(tasks[0].status, TaskStatus::Pending);
    }

    #[test]
    fn run_biome_batch_pass_ignores_tasks_whose_target_has_no_matching_script() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        let mut tasks = vec![make_task("app#fmt", "modules/app", "fmt")];
        let target = make_target(root.path(), "modules/app", "app", "test", "bun test");
        let by_key: HashMap<&str, &WorkspaceTarget> =
            HashMap::from([(target.key.as_str(), &target)]);
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = base_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );

        let failed = run_biome_batch_pass(&mut tasks, ctx);

        assert!(!failed);
        assert_eq!(tasks[0].status, TaskStatus::Pending);
    }

    #[test]
    fn run_biome_batch_pass_ignores_non_biome_scripts() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        let mut tasks = vec![make_task("app#fmt", "modules/app", "fmt")];
        let target = make_target(
            root.path(),
            "modules/app",
            "app",
            "fmt",
            "bun run something-else",
        );
        let by_key: HashMap<&str, &WorkspaceTarget> =
            HashMap::from([(target.key.as_str(), &target)]);
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = base_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );

        let failed = run_biome_batch_pass(&mut tasks, ctx);

        assert!(!failed);
        assert_eq!(tasks[0].status, TaskStatus::Pending);
    }

    // -------------------------------------------------------------------
    // run_one_biome_batch caching behaviour
    // -------------------------------------------------------------------

    #[test]
    fn run_one_biome_batch_uses_cache_hits_and_caches_new_misses() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        write_executable(
            &root.path().join("node_modules/.bin/biome"),
            &format!(
                "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"{}\"\nexit 0\n",
                root.path().join("biome.log").display()
            ),
        );
        fs::create_dir_all(root.path().join("modules/app")).expect("dir");
        fs::create_dir_all(root.path().join("modules/web")).expect("dir");
        fs::write(root.path().join("modules/app/a.txt"), "a").expect("write");
        fs::write(root.path().join("modules/web/b.txt"), "b").expect("write");

        let targets = vec![
            make_target(
                root.path(),
                "modules/app",
                "app",
                "fmt",
                "biome check --write",
            ),
            make_target(
                root.path(),
                "modules/web",
                "web",
                "fmt",
                "biome check --write",
            ),
        ];
        let by_key: HashMap<&str, &WorkspaceTarget> =
            targets.iter().map(|t| (t.key.as_str(), t)).collect();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();

        let app_hash = compute_task_hash(
            by_key["modules/app"],
            "fmt",
            &by_key,
            "root-hash",
            &memo,
            false,
            &file_hash_cache,
        );
        let cache_index = CacheIndex::new();
        write_cache_entry(
            cache.path(),
            &cache_index,
            &CacheEntryMeta {
                version: WORKSPACE_CACHE_VERSION,
                target: "modules/app".to_string(),
                command: "fmt".to_string(),
                hash: app_hash,
                created_at: chrono::Utc::now().to_rfc3339(),
                duration_ms: 33,
                success: true,
                exit_code: None,
                output: String::new(),
            },
        );

        let mut app_task = make_task("app#fmt", "modules/app", "fmt");
        app_task.cacheable = true;
        let mut web_task = make_task("web#fmt", "modules/web", "fmt");
        web_task.cacheable = true;
        let mut tasks = vec![app_task, web_task];

        let loader = Loader::hidden();
        let ctx = base_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            false,
        );

        let failed = run_biome_batch_pass(&mut tasks, ctx);

        assert!(!failed);
        assert_eq!(tasks[0].status, TaskStatus::Cached);
        assert_eq!(tasks[0].duration_ms, 33);
        assert_eq!(tasks[1].status, TaskStatus::Success);
        assert!(tasks[1].hash.is_some());

        // The "app" cache hit short-circuits before spawning biome, so only
        // "web" is passed to the batched invocation.
        let log = fs::read_to_string(root.path().join("biome.log")).expect("log");
        assert!(log.contains("modules/web"));
        assert!(!log.contains("modules/app"));

        let web_hash = tasks[1].hash.clone().expect("web task was hashed");
        let entry =
            read_cache_entry(cache.path(), &cache_index, &web_hash).expect("cache entry written");
        assert_eq!(entry.target, "modules/web");
    }

    #[test]
    fn run_one_biome_batch_returns_early_when_every_target_is_a_cache_hit() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        // Deliberately no biome binary — if the batch spawned a process
        // despite every target being a cache hit, this test would fail loudly.
        fs::create_dir_all(root.path().join("modules/app")).expect("dir");
        fs::create_dir_all(root.path().join("modules/web")).expect("dir");

        let targets = vec![
            make_target(
                root.path(),
                "modules/app",
                "app",
                "fmt",
                "biome check --write",
            ),
            make_target(
                root.path(),
                "modules/web",
                "web",
                "fmt",
                "biome check --write",
            ),
        ];
        let by_key: HashMap<&str, &WorkspaceTarget> =
            targets.iter().map(|t| (t.key.as_str(), t)).collect();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let cache_index = CacheIndex::new();

        for key in ["modules/app", "modules/web"] {
            let success = key == "modules/app";
            let hash = compute_task_hash(
                by_key[key],
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
                    target: key.to_string(),
                    command: "fmt".to_string(),
                    hash,
                    created_at: chrono::Utc::now().to_rfc3339(),
                    duration_ms: 10,
                    success,
                    exit_code: (!success).then_some(7),
                    output: if success {
                        String::new()
                    } else {
                        "cached biome failure".to_string()
                    },
                },
            );
        }

        let mut app_task = make_task("app#fmt", "modules/app", "fmt");
        app_task.cacheable = true;
        let mut web_task = make_task("web#fmt", "modules/web", "fmt");
        web_task.cacheable = true;
        let mut tasks = vec![app_task, web_task];

        let loader = Loader::hidden();
        let ctx = base_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            false,
        );

        let failed = run_biome_batch_pass(&mut tasks, ctx);

        assert!(failed);
        assert_eq!(tasks[0].status, TaskStatus::Cached);
        assert_eq!(tasks[1].status, TaskStatus::CachedFailure);
        assert_eq!(tasks[1].exit_code, Some(7));
        assert_eq!(tasks[1].output, "cached biome failure");
        assert!(!root.path().join("biome.log").exists());
    }

    #[test]
    fn run_one_biome_batch_reports_a_spawn_failure_as_output() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        let biome_path = root.path().join("node_modules/.bin/biome");
        fs::create_dir_all(biome_path.parent().expect("parent")).expect("create parent");
        fs::write(&biome_path, "#!/bin/sh\nexit 0\n").expect("write biome");
        // Deliberately not executable, so spawning it fails.
        let mut permissions = fs::metadata(&biome_path).expect("metadata").permissions();
        permissions.set_mode(0o644);
        fs::set_permissions(&biome_path, permissions).expect("permissions");

        fs::create_dir_all(root.path().join("modules/app")).expect("dir");
        fs::create_dir_all(root.path().join("modules/web")).expect("dir");

        let mut tasks = vec![
            make_task("app#fmt", "modules/app", "fmt"),
            make_task("web#fmt", "modules/web", "fmt"),
        ];
        let targets = vec![
            make_target(
                root.path(),
                "modules/app",
                "app",
                "fmt",
                "biome check --write",
            ),
            make_target(
                root.path(),
                "modules/web",
                "web",
                "fmt",
                "biome check --write",
            ),
        ];
        let by_key: HashMap<&str, &WorkspaceTarget> =
            targets.iter().map(|t| (t.key.as_str(), t)).collect();
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = base_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );

        let failed = run_biome_batch_pass(&mut tasks, ctx);

        assert!(failed);
        assert!(tasks.iter().all(|t| t.status == TaskStatus::Failed));
        assert!(tasks.iter().all(|t| !t.output.is_empty()));
    }

    // -------------------------------------------------------------------
    // cache_batched_task
    // -------------------------------------------------------------------

    #[test]
    fn cache_batched_task_skips_when_the_target_cannot_be_resolved() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        let task = make_task("app#fmt", "modules/app", "fmt");
        let by_key: HashMap<&str, &WorkspaceTarget> = HashMap::new();
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = base_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );

        cache_batched_task(&task, "modules/app", "hash".to_string(), 10, ctx);

        assert!(cache_index.is_empty());
    }

    #[test]
    fn cache_batched_task_writes_an_entry_when_the_target_resolves() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        let mut task = make_task("app#fmt", "modules/app", "fmt");
        task.status = TaskStatus::Success;
        let target = make_target(
            root.path(),
            "modules/app",
            "app",
            "fmt",
            "biome check --write",
        );
        let by_key: HashMap<&str, &WorkspaceTarget> =
            HashMap::from([(target.key.as_str(), &target)]);
        let cache_index = CacheIndex::new();
        let memo = FingerprintMemo::new();
        let file_hash_cache = FileHashCache::new();
        let loader = Loader::hidden();
        let ctx = base_ctx(
            root.path(),
            cache.path(),
            &by_key,
            &cache_index,
            &memo,
            &file_hash_cache,
            &loader,
            true,
        );

        cache_batched_task(&task, "modules/app", "hash-1".to_string(), 40, ctx);

        let entry = read_cache_entry(cache.path(), &cache_index, "hash-1").expect("entry written");
        assert_eq!(entry.duration_ms, 40);
        assert_eq!(entry.target, "modules/app");
        assert!(entry.success);
    }
}
