use std::collections::HashSet;
use std::path::Path;

use super::monorepo_task::{Task, TaskStatus};
use crate::utils::MonorepoTarget;

pub const INSTALL_COMMAND: &str = "install";
pub const TEST_COMMAND: &str = "test";
pub const ORDER_INDEPENDENT_COMMANDS: &[&str] = &["fmt", "lint", "test"];

fn tests_dir_is_empty(dir: &Path) -> bool {
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

    !has_file(&dir.join("tests"))
}

/// `bun run <command>` only works for a script `package.json` actually
/// declares; a language default has no such entry, so it is invoked directly.
fn script_argv(target: &MonorepoTarget, command: &str) -> Vec<String> {
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
    targets: &[MonorepoTarget],
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
            let skipped = command == TEST_COMMAND && tests_dir_is_empty(&target.dir);
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
