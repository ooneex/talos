//! Runs the workspace task runner over a scratch monorepo.
//!
//! `monorepo:run` — and the `build` / `fmt` / `lint` / `test` aliases on top of
//! it — discovers the members, orders them by dependency, runs their scripts and
//! caches the result. The fixture's scripts are `echo` and `exit`, so a whole
//! run finishes in milliseconds and the outcome is whatever the fixture asked
//! for.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

use cli::utils::{
    TargetType, discover_targets, resolve_biome_command, sort_targets_by_dependencies,
};

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("a parent")).expect("create parent");
    fs::write(path, content).expect("write file");
}

/// A workspace member with the given scripts and dependencies.
fn member(root: &Path, group: &str, name: &str, scripts: &str, dependencies: &str) {
    let dir = root.join(group).join(name);
    write(
        &dir.join("package.json"),
        &format!(
            "{{\n  \"name\": \"@scratch/{name}\",\n  \"version\": \"1.0.0\",\n  \"scripts\": {{{scripts}}},\n  \"dependencies\": {{{dependencies}}}\n}}\n"
        ),
    );
    write(
        &dir.join("src/index.ts"),
        &format!("export const {name} = 1;\n"),
    );
    // `test` is skipped for a member whose tests/ directory is empty.
    write(
        &dir.join("tests/index.spec.ts"),
        &format!("// the {name} suite\n"),
    );
}

/// A workspace of three members: a base one, one that depends on it, and one
/// whose test script fails.
fn workspace() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().to_path_buf();

    write(
        &root.join("package.json"),
        "{\n  \"name\": \"scratch\",\n  \"private\": true,\n  \"workspaces\": [\"packages/*\", \"modules/*\"]\n}\n",
    );

    member(
        &root,
        "packages",
        "core",
        "\n    \"build\": \"echo built core\",\n    \"test\": \"echo tested core\"\n  ",
        "",
    );
    member(
        &root,
        "packages",
        "app",
        "\n    \"build\": \"echo built app\",\n    \"test\": \"echo tested app\"\n  ",
        "\n    \"@scratch/core\": \"1.0.0\"\n  ",
    );
    member(
        &root,
        "modules",
        "flaky",
        "\n    \"build\": \"echo built flaky\",\n    \"test\": \"echo the suite is red && exit 1\"\n  ",
        "",
    );

    (dir, root)
}

fn talos(root: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .arg(format!("--cwd={}", root.display()))
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .output()
        .expect("the talos binary should run")
}

fn text(output: &Output) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

#[test]
fn discovery_finds_every_member_of_both_groups_and_tags_it_with_its_kind() {
    let (_dir, root) = workspace();

    let targets = discover_targets(&root);

    let names: Vec<&str> = targets.iter().map(|t| t.name.as_str()).collect();
    assert!(names.contains(&"core"), "{names:?}");
    assert!(names.contains(&"app"), "{names:?}");
    assert!(names.contains(&"flaky"), "{names:?}");

    let kind = |name: &str| {
        targets
            .iter()
            .find(|t| t.name == name)
            .map(|t| t.target_type)
            .expect("target")
    };
    assert_eq!(kind("core"), TargetType::Package);
    assert_eq!(kind("flaky"), TargetType::Module);
}

#[test]
fn a_member_is_ordered_after_the_member_it_depends_on() {
    let (_dir, root) = workspace();

    let ordered = sort_targets_by_dependencies(&discover_targets(&root));

    let position = |name: &str| {
        ordered
            .iter()
            .position(|t| t.name == name)
            .unwrap_or_else(|| panic!("{name} is missing"))
    };
    assert!(
        position("core") < position("app"),
        "app depends on core: {:?}",
        ordered.iter().map(|t| &t.name).collect::<Vec<_>>()
    );
}

#[test]
fn the_biome_command_falls_back_to_the_package_runner_without_a_local_binary() {
    let (_dir, root) = workspace();

    let command = resolve_biome_command(&root);

    assert!(!command.is_empty());
    assert!(
        command.last().is_some_and(|part| part.contains("biome")),
        "{command:?}"
    );
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

#[test]
fn running_a_script_every_member_declares_succeeds_and_names_them_all() {
    let (_dir, root) = workspace();

    let output = talos(
        &root,
        &["monorepo:run", "--commands=build", "--logs", "--no-cache"],
    );

    let report = text(&output);
    assert!(output.status.success(), "{report}");
    assert!(report.contains("core:build"), "{report}");
    assert!(report.contains("app:build"), "{report}");
    assert!(report.contains("flaky:build"), "{report}");
}

#[test]
fn a_failing_script_ends_the_run_non_zero_and_prints_what_it_printed() {
    let (_dir, root) = workspace();

    let output = talos(
        &root,
        &["monorepo:run", "--commands=test", "--logs", "--no-cache"],
    );

    assert!(!output.status.success());
    assert!(
        text(&output).contains("the suite is red"),
        "{}",
        text(&output)
    );
}

#[test]
fn restricting_the_run_to_one_member_leaves_the_failing_one_out() {
    let (_dir, root) = workspace();

    let output = talos(
        &root,
        &[
            "monorepo:run",
            "--commands=test",
            "--packages=core",
            "--logs",
            "--no-cache",
        ],
    );

    let report = text(&output);
    assert!(output.status.success(), "{report}");
    assert!(report.contains("core:test"), "{report}");
    assert!(!report.contains("app:test"), "{report}");
}

#[test]
fn asking_for_a_member_that_is_not_there_is_an_error() {
    let (_dir, root) = workspace();

    let output = talos(
        &root,
        &[
            "monorepo:run",
            "--commands=build",
            "--packages=nowhere",
            "--no-cache",
        ],
    );

    assert!(!output.status.success());
    assert!(text(&output).contains("nowhere"), "{}", text(&output));
}

#[test]
fn the_commands_option_is_required() {
    let (_dir, root) = workspace();

    let output = talos(&root, &["monorepo:run"]);

    assert!(!output.status.success());
    assert!(text(&output).contains("--commands"), "{}", text(&output));
}

#[test]
fn several_commands_run_in_the_order_they_were_given() {
    let (_dir, root) = workspace();

    let output = talos(
        &root,
        &[
            "monorepo:run",
            "--commands=build,test",
            "--packages=core,app",
            "--logs",
            "--no-cache",
        ],
    );

    let report = text(&output);
    assert!(output.status.success(), "{report}");
    assert!(
        report.find("core:build") < report.find("core:test"),
        "{report}"
    );
}

// ---------------------------------------------------------------------------
// The cache
// ---------------------------------------------------------------------------

#[test]
fn the_second_run_of_an_unchanged_member_is_served_from_the_cache() {
    let (_dir, root) = workspace();

    talos(
        &root,
        &["monorepo:run", "--commands=build", "--packages=core"],
    );
    let warm = text(&talos(
        &root,
        &["monorepo:run", "--commands=build", "--packages=core"],
    ));

    assert!(warm.contains("1 cached"), "{warm}");
}

#[test]
fn editing_a_source_file_retires_the_cached_result() {
    let (_dir, root) = workspace();
    talos(
        &root,
        &["monorepo:run", "--commands=build", "--packages=core"],
    );
    assert!(
        text(&talos(
            &root,
            &["monorepo:run", "--commands=build", "--packages=core"]
        ))
        .contains("1 cached")
    );

    write(
        &root.join("packages/core/src/index.ts"),
        "export const core = 2;\n",
    );

    let after = text(&talos(
        &root,
        &["monorepo:run", "--commands=build", "--packages=core"],
    ));
    assert!(after.contains("0 cached"), "{after}");
}

#[test]
fn no_cache_runs_the_script_again_even_when_nothing_moved() {
    let (_dir, root) = workspace();
    talos(
        &root,
        &["monorepo:run", "--commands=build", "--packages=core"],
    );

    let again = text(&talos(
        &root,
        &[
            "monorepo:run",
            "--commands=build",
            "--packages=core",
            "--no-cache",
            "--logs",
        ],
    ));

    assert!(again.contains("0 cached"), "{again}");
    assert!(again.contains("core:build"), "{again}");
}

// ---------------------------------------------------------------------------
// The aliases
// ---------------------------------------------------------------------------

#[test]
fn build_test_and_run_are_the_same_runner_under_another_name() {
    let (_dir, root) = workspace();

    let build = talos(&root, &["build", "--packages=core", "--logs", "--no-cache"]);
    assert!(build.status.success(), "{}", text(&build));
    assert!(text(&build).contains("core:build"), "{}", text(&build));

    let test = talos(&root, &["test", "--packages=core", "--logs", "--no-cache"]);
    assert!(test.status.success(), "{}", text(&test));
    assert!(text(&test).contains("core:test"), "{}", text(&test));

    let named = talos(
        &root,
        &[
            "run",
            "--commands=build",
            "--packages=core",
            "--logs",
            "--no-cache",
        ],
    );
    assert!(named.status.success(), "{}", text(&named));
}

#[test]
fn a_member_without_the_script_being_asked_for_is_simply_not_run() {
    let (_dir, root) = workspace();
    member(
        &root,
        "packages",
        "docs",
        "\n    \"build\": \"echo built docs\"\n  ",
        "",
    );

    let output = talos(
        &root,
        &[
            "monorepo:run",
            "--commands=test",
            "--packages=docs",
            "--no-cache",
        ],
    );

    assert!(
        output.status.success(),
        "a member with no test script is not a failure: {}",
        text(&output)
    );
}

#[test]
fn a_workspace_with_no_member_at_all_is_an_error_rather_than_a_silent_success() {
    let dir = tempfile::tempdir().expect("create temp dir");
    write(
        &dir.path().join("package.json"),
        "{ \"name\": \"empty\" }\n",
    );

    let output = talos(
        dir.path(),
        &["monorepo:run", "--commands=build", "--no-cache"],
    );

    assert!(!output.status.success());
    assert!(
        text(&output).contains("No packages or modules found"),
        "{}",
        text(&output)
    );
}
