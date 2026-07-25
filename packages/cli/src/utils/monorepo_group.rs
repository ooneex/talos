use std::collections::HashSet;
use std::path::Path;

use super::monorepo_task::{Task, TaskStatus};
use crate::utils::MonorepoTarget;

pub(crate) const INSTALL_COMMAND: &str = "install";
pub(crate) const ORDER_INDEPENDENT_COMMANDS: &[&str] = &["fmt", "lint", "test"];

pub(crate) fn build_group(
    targets: &[MonorepoTarget],
    included_keys: &HashSet<String>,
    command: &str,
) -> Vec<Task> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::TargetType;
    use std::collections::HashMap;
    use std::path::PathBuf;

    fn target(name: &str, scripts: &[&str], workspace_deps: &[&str]) -> MonorepoTarget {
        MonorepoTarget {
            key: format!("packages/{name}"),
            name: name.to_string(),
            target_type: TargetType::Package,
            dir: PathBuf::from(format!("/repo/packages/{name}")),
            scripts: scripts
                .iter()
                .map(|s| (s.to_string(), format!("run-{s}")))
                .collect::<HashMap<_, _>>(),
            workspace_deps: workspace_deps.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn build_group_runs_package_json_script_once_per_target() {
        let targets = vec![target("core", &["test"], &[])];
        let included: HashSet<String> = targets.iter().map(|t| t.key.clone()).collect();

        let tasks = build_group(&targets, &included, "test");

        assert_eq!(tasks.len(), 1, "one task per target, not one per file");
        let task = &tasks[0];
        assert_eq!(task.argv, vec!["bun", "run", "test"]);
        assert_eq!(task.command, "test");
        assert_eq!(task.key, "packages/core#test");
        assert_eq!(task.status, TaskStatus::Pending);
    }

    #[test]
    fn build_group_skips_targets_without_the_script() {
        let targets = vec![target("core", &[], &[])];
        let included: HashSet<String> = targets.iter().map(|t| t.key.clone()).collect();

        let tasks = build_group(&targets, &included, "lint");

        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].status, TaskStatus::Skipped);
        assert_eq!(tasks[0].argv, vec!["bun", "run", "lint"]);
    }

    #[test]
    fn build_group_uses_bun_run_for_all_commands() {
        let targets = vec![target("core", &["fmt", "lint", "test", "build"], &[])];
        let included: HashSet<String> = targets.iter().map(|t| t.key.clone()).collect();

        for command in ["fmt", "lint", "test", "build"] {
            let tasks = build_group(&targets, &included, command);
            assert_eq!(tasks.len(), 1);
            assert_eq!(
                tasks[0].argv,
                vec!["bun".to_string(), "run".to_string(), command.to_string()],
                "command `{command}` should run the package.json script"
            );
        }
    }

    #[test]
    fn build_group_wires_deps_only_for_ordered_commands() {
        let targets = vec![
            target("core", &["build", "test"], &[]),
            target("app", &["build", "test"], &["packages/core"]),
        ];
        let included: HashSet<String> = targets.iter().map(|t| t.key.clone()).collect();

        let ordered = build_group(&targets, &included, "build");
        let app_build = ordered
            .iter()
            .find(|t| t.key == "packages/app#build")
            .unwrap();
        assert_eq!(app_build.deps, vec!["packages/core#build".to_string()]);

        let unordered = build_group(&targets, &included, "test");
        let app_test = unordered
            .iter()
            .find(|t| t.key == "packages/app#test")
            .unwrap();
        assert!(
            app_test.deps.is_empty(),
            "order-independent commands should not wire cross-package deps"
        );
    }
}
