//! Builds `monorepo:run`'s `test` task group: one task per test file rather
//! than per target, so every spec runs concurrently instead of a single
//! `bun run test`/`cargo test` invocation serializing them. Rust targets run
//! `cargo test --test <name>` per `tests/<name>_spec.rs`; every other target
//! runs `bun test ./tests/<name>.spec.ts` per matching file.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use regex::Regex;

use super::monorepo_task::{Task, TaskStatus};
use crate::utils::{MonorepoTarget, is_rust_module};

pub(crate) const TEST_COMMAND: &str = "test";

/// Test files a target's `tests/` folder holds, as paths relative to the
/// target's directory. Rust targets only look at the folder's direct `.rs`
/// children (Cargo only treats those as integration-test binaries); other
/// targets are scanned recursively for `*.test.*`/`*.spec.*` files, mirroring
/// what `bun test` would pick up.
pub(crate) fn collect_test_files(target: &MonorepoTarget) -> Vec<PathBuf> {
    let tests_dir = target.dir.join("tests");
    let mut files = Vec::new();

    if is_rust_module(&target.dir) {
        let Ok(entries) = std::fs::read_dir(&tests_dir) else {
            return files;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file()
                && path.extension().and_then(|e| e.to_str()) == Some("rs")
                && let Ok(rel) = path.strip_prefix(&target.dir)
            {
                files.push(rel.to_path_buf());
            }
        }
    } else {
        let is_test_file = Regex::new(r"[._](?:test|spec)\.[cm]?[jt]sx?$").unwrap();
        let mut stack = vec![tests_dir];
        while let Some(dir) = stack.pop() {
            let Ok(entries) = std::fs::read_dir(&dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                if path.is_file() && is_test_file.is_match(&name_str) {
                    if let Ok(rel) = path.strip_prefix(&target.dir) {
                        files.push(rel.to_path_buf());
                    }
                } else if path.is_dir() && name_str != "node_modules" {
                    stack.push(path);
                }
            }
        }
    }

    files.sort();
    files
}

// One task per test *file* rather than per target, so every spec runs
// concurrently instead of a single `bun run test`/`cargo test` invocation
// serializing them. Rust targets run `cargo test --test <name>` per
// `tests/<name>_spec.rs`; every other target runs `bun test ./tests/<name>.spec.ts`
// per matching file. Targets without the `test` script, or without any
// matching files, are marked skipped up front. `test` is always ordered
// (it isn't in `ORDER_INDEPENDENT_COMMANDS`), so a target's file tasks
// depend on *all* of its workspace dependencies' file tasks.
pub(crate) fn build_test_group(
    targets: &[MonorepoTarget],
    included_keys: &HashSet<String>,
) -> Vec<Task> {
    let mut tasks: Vec<Task> = Vec::new();
    let mut keys_by_target: HashMap<String, Vec<String>> = HashMap::new();

    for target in targets {
        let dep_keys: Vec<String> = target
            .workspace_deps
            .iter()
            .filter(|k| included_keys.contains(*k))
            .flat_map(|k| keys_by_target.get(k).cloned().unwrap_or_default())
            .collect();

        let has_script = target.scripts.contains_key(TEST_COMMAND);
        let test_files = if has_script {
            collect_test_files(target)
        } else {
            Vec::new()
        };

        if test_files.is_empty() {
            let key = format!("{}#{TEST_COMMAND}", target.key);
            tasks.push(Task {
                key: key.clone(),
                label: format!("{}:{TEST_COMMAND}", target.name),
                target_key: Some(target.key.clone()),
                command: TEST_COMMAND.to_string(),
                cwd: target.dir.clone(),
                argv: Vec::new(),
                cacheable: false,
                deps: dep_keys,
                status: TaskStatus::Skipped,
                output: String::new(),
                exit_code: None,
                duration_ms: 0,
                hash: None,
            });
            keys_by_target.insert(target.key.clone(), vec![key]);
            continue;
        }

        let is_rust = is_rust_module(&target.dir);
        let mut own_keys = Vec::new();
        for file in &test_files {
            let stem = file
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or_default()
                .to_string();
            let argv = if is_rust {
                vec![
                    "cargo".to_string(),
                    "test".to_string(),
                    "--test".to_string(),
                    stem.clone(),
                ]
            } else {
                let rel = file.to_string_lossy().replace('\\', "/");
                vec!["bun".to_string(), "test".to_string(), format!("./{rel}")]
            };
            // The command discriminator feeds the cache-content hash, so it
            // must carry the file identity too, otherwise every file task
            // for a target would collide on the same cache entry.
            let key = format!("{}#{TEST_COMMAND}#{stem}", target.key);
            tasks.push(Task {
                key: key.clone(),
                label: format!("{}:{TEST_COMMAND}:{stem}", target.name),
                target_key: Some(target.key.clone()),
                command: format!("{TEST_COMMAND}:{stem}"),
                cwd: target.dir.clone(),
                argv,
                cacheable: true,
                deps: dep_keys.clone(),
                status: TaskStatus::Pending,
                output: String::new(),
                exit_code: None,
                duration_ms: 0,
                hash: None,
            });
            own_keys.push(key);
        }
        keys_by_target.insert(target.key.clone(), own_keys);
    }

    tasks
}
