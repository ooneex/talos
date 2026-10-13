use std::collections::HashSet;
use std::path::Path;

use super::workspace_task::{Task, TaskStatus};
use crate::utils::WorkspaceTarget;

pub const INSTALL_COMMAND: &str = "install";
pub const TEST_COMMAND: &str = "test";
pub const E2E_COMMAND: &str = "e2e";
pub const ORDER_INDEPENDENT_COMMANDS: &[&str] = &["fmt", "lint", "test"];

/// Whether `dir/<suite>` holds no file at any depth (or does not exist).
pub fn suite_dir_is_empty(dir: &Path, suite: &str) -> bool {
    fn has_file(dir: &Path) -> bool {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return false;
        };
        for entry in entries.filter_map(Result::ok) {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_file() {
                return true;
            }
            if file_type.is_dir() && has_file(&entry.path()) {
                return true;
            }
        }
        false
    }

    !has_file(&dir.join(suite))
}

/// A `test` script with nothing under `tests/`, or an `e2e` script with
/// nothing under `e2e/`, is skipped rather than run. Without its own suite,
/// a runner like `playwright test` falls back to scanning the whole target,
/// picks up the `bun:test` specs under `tests/` and leaves a `test-results/`
/// folder behind.
fn has_no_suite(target: &WorkspaceTarget, command: &str) -> bool {
    match command {
        TEST_COMMAND => suite_dir_is_empty(&target.dir, "tests"),
        E2E_COMMAND => suite_dir_is_empty(&target.dir, "e2e"),
        _ => false,
    }
}

/// `bun run <command>` only works for a script `package.json` actually
/// declares; a language default has no such entry, so it is invoked directly.
fn script_argv(target: &WorkspaceTarget, command: &str) -> Vec<String> {
    if !target.direct_scripts {
        return vec!["bun".to_string(), "run".to_string(), command.to_string()];
    }
    target
        .scripts
        .get(command)
        .map(|script| script.split_whitespace().map(str::to_string).collect())
        .unwrap_or_default()
}

pub fn build_group(
    targets: &[WorkspaceTarget],
    included_keys: &HashSet<String>,
    command: &str,
) -> Vec<Task> {
    let ordered = !ORDER_INDEPENDENT_COMMANDS.contains(&command);
    // Targets whose package.json has no such script are dropped from the group
    // entirely, so deps may only point at targets that produce a task.
    let runnable: HashSet<&str> = targets
        .iter()
        .filter(|t| t.scripts.contains_key(command) && included_keys.contains(&t.key))
        .map(|t| t.key.as_str())
        .collect();
    targets
        .iter()
        .filter(|target| target.scripts.contains_key(command))
        .map(|target| {
            let skipped = has_no_suite(target, command);
            Task {
                key: format!("{}#{command}", target.key),
                label: format!("{}:{command}", target.name),
                target_key: Some(target.key.clone()),
                command: command.to_string(),
                cwd: target.dir.clone(),
                argv: script_argv(target, command),
                cacheable: true,
                deps: if ordered {
                    target
                        .workspace_deps
                        .iter()
                        .filter(|k| runnable.contains(k.as_str()))
                        .map(|k| format!("{k}#{command}"))
                        .collect()
                } else {
                    Vec::new()
                },
                status: if skipped {
                    TaskStatus::Skipped
                } else {
                    TaskStatus::Pending
                },
                output: String::new(),
                exit_code: None,
                duration_ms: 0,
                hash: None,
            }
        })
        .collect()
}

pub fn build_install_group(root_dir: &Path) -> Vec<Task> {
    vec![Task {
        key: format!("root#{INSTALL_COMMAND}"),
        label: INSTALL_COMMAND.to_string(),
        target_key: None,
        command: INSTALL_COMMAND.to_string(),
        cwd: root_dir.to_path_buf(),
        argv: vec!["bun".to_string(), "install".to_string()],
        cacheable: false,
        deps: Vec::new(),
        status: TaskStatus::Pending,
        output: String::new(),
        exit_code: None,
        duration_ms: 0,
        hash: None,
    }]
}
