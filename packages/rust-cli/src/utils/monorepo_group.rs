//! Builds `monorepo:run`'s per-command task groups: dispatches `test`/`fmt`/
//! `lint` to their dedicated per-file builders (which use the target's
//! `package.json` script only as a gate and run an optimized, sharded
//! equivalent — not the script body), and falls back to one `bun run
//! <command>` task per target that *does* execute the declared script
//! verbatim for any other command (e.g. `build`), plus the single root-level
//! `install` task.

use std::collections::HashSet;
use std::path::Path;

use super::monorepo_fmt_group::{FMT_COMMAND, build_fmt_group};
use super::monorepo_lint_group::{LINT_COMMAND, build_lint_group};
use super::monorepo_task::{Task, TaskStatus};
use super::monorepo_test_group::{TEST_COMMAND, build_test_group};
use crate::utils::MonorepoTarget;

pub(crate) const INSTALL_COMMAND: &str = "install";
pub(crate) const ORDER_INDEPENDENT_COMMANDS: &[&str] = &["fmt", "lint", "test"];

// One task per target for a command. Targets whose package.json lacks the
// script are marked skipped up front. Order-independent commands carry no
// dependency edges, so every target in that group can run concurrently.
pub(crate) fn build_group(
    targets: &[MonorepoTarget],
    included_keys: &HashSet<String>,
    command: &str,
) -> Vec<Task> {
    if command == TEST_COMMAND {
        return build_test_group(targets, included_keys);
    }
    if command == FMT_COMMAND {
        return build_fmt_group(targets);
    }
    if command == LINT_COMMAND {
        return build_lint_group(targets);
    }

    let ordered = !ORDER_INDEPENDENT_COMMANDS.contains(&command);
    targets
        .iter()
        .map(|target| {
            let skipped = !target.scripts.contains_key(command);
            Task {
                key: format!("{}#{command}", target.key),
                label: format!("{}:{command}", target.name),
                target_key: Some(target.key.clone()),
                command: command.to_string(),
                cwd: target.dir.clone(),
                argv: vec!["bun".to_string(), "run".to_string(), command.to_string()],
                cacheable: true,
                deps: if ordered {
                    target
                        .workspace_deps
                        .iter()
                        .filter(|k| included_keys.contains(*k))
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

// A single root-level `bun install`. It is not tied to a target and is never
// cached, since bun already skips work when the lockfile is unchanged.
pub(crate) fn build_install_group(root_dir: &Path) -> Vec<Task> {
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
