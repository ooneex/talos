use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use cli::utils::{MonorepoTarget, TargetType, TaskStatus, build_group};

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
        direct_scripts: false,
        workspace_deps: workspace_deps.iter().map(|s| s.to_string()).collect(),
    }
}

fn target_in(dir: &Path, name: &str, scripts: &[&str]) -> MonorepoTarget {
    let mut t = target(name, scripts, &[]);
    t.dir = dir.to_path_buf();
    t
}

fn included(targets: &[MonorepoTarget]) -> HashSet<String> {
    targets.iter().map(|t| t.key.clone()).collect()
}

#[test]
fn build_group_runs_package_json_script_once_per_target() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("tests")).unwrap();
    std::fs::write(dir.path().join("tests/core.spec.ts"), "").unwrap();
    let targets = vec![target_in(dir.path(), "core", &["test"])];

    let tasks = build_group(&targets, &included(&targets), "test");

    assert_eq!(tasks.len(), 1, "one task per target, not one per file");
    let task = &tasks[0];
    assert_eq!(task.argv, vec!["bun", "run", "test"]);
    assert_eq!(task.command, "test");
    assert_eq!(task.key, "packages/core#test");
    assert_eq!(task.status, TaskStatus::Pending);
}

#[test]
fn build_group_invokes_language_defaults_without_bun_run() {
    let mut target = target("crate", &["build"], &[]);
    target.direct_scripts = true;
    target
        .scripts
        .insert("build".to_string(), "cargo build".to_string());
    let targets = vec![target];

    let tasks = build_group(&targets, &included(&targets), "build");

    assert_eq!(tasks[0].argv, vec!["cargo", "build"]);
}

#[test]
fn build_group_skips_test_when_tests_dir_is_empty() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("tests")).unwrap();
    let targets = vec![target_in(dir.path(), "core", &["test"])];

    let tasks = build_group(&targets, &included(&targets), "test");

    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].status, TaskStatus::Skipped);
}

#[test]
fn build_group_skips_test_when_tests_dir_is_missing() {
    let dir = tempfile::tempdir().unwrap();
    let targets = vec![target_in(dir.path(), "core", &["test"])];

    let tasks = build_group(&targets, &included(&targets), "test");

    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].status, TaskStatus::Skipped);
}

#[test]
fn build_group_runs_test_when_tests_dir_has_nested_files() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("tests/services")).unwrap();
    std::fs::write(dir.path().join("tests/services/user.spec.ts"), "").unwrap();
    let targets = vec![target_in(dir.path(), "core", &["test"])];

    let tasks = build_group(&targets, &included(&targets), "test");

    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].status, TaskStatus::Pending);
}

#[test]
fn build_group_drops_targets_without_the_script() {
    let targets = vec![target("core", &[], &[]), target("app", &["lint"], &[])];

    let tasks = build_group(&targets, &included(&targets), "lint");

    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].key, "packages/app#lint");
}

#[test]
fn build_group_drops_deps_on_targets_without_the_script() {
    let targets = vec![
        target("core", &[], &[]),
        target("app", &["build"], &["packages/core"]),
    ];

    let tasks = build_group(&targets, &included(&targets), "build");

    assert_eq!(tasks.len(), 1);
    assert!(
        tasks[0].deps.is_empty(),
        "deps must not reference a target that produced no task"
    );
}

#[test]
fn build_group_uses_bun_run_for_all_commands() {
    let targets = vec![target("core", &["fmt", "lint", "test", "build"], &[])];

    for command in ["fmt", "lint", "test", "build"] {
        let tasks = build_group(&targets, &included(&targets), command);
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

    let ordered = build_group(&targets, &included(&targets), "build");
    let app_build = ordered
        .iter()
        .find(|t| t.key == "packages/app#build")
        .unwrap();
    assert_eq!(app_build.deps, vec!["packages/core#build".to_string()]);

    let unordered = build_group(&targets, &included(&targets), "test");
    let app_test = unordered
        .iter()
        .find(|t| t.key == "packages/app#test")
        .unwrap();
    assert!(
        app_test.deps.is_empty(),
        "order-independent commands should not wire cross-package deps"
    );
}
