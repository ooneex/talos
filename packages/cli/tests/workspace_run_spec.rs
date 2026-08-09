use std::fs;
use std::path::Path;

use clap::Parser;
use cli::commands::workspace_run::{WorkspaceRunArgs, execute};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: WorkspaceRunArgs,
}

fn write_module(root: &Path, name: &str, scripts: &str) {
    let dir = root.join("modules").join(name);
    fs::create_dir_all(&dir).expect("module dir");
    fs::write(
        dir.join("package.json"),
        format!("{{\"name\":\"{name}\",\"scripts\":{scripts}}}"),
    )
    .expect("package.json");
}

fn write_package(root: &Path, name: &str, scripts: &str) {
    let dir = root.join("packages").join(name);
    fs::create_dir_all(&dir).expect("package dir");
    fs::write(
        dir.join("package.json"),
        format!("{{\"name\":\"{name}\",\"scripts\":{scripts}}}"),
    )
    .expect("package.json");
}

#[test]
fn workspace_run_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--commands",
        "lint",
        "--packages",
        "core",
        "--modules",
        "user",
        "--logs",
        "--no-cache",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.commands.as_deref(), Some("lint"));
    assert_eq!(cli.args.packages.as_deref(), Some("core"));
    assert_eq!(cli.args.modules.as_deref(), Some("user"));
    assert!(cli.args.logs);
    assert!(cli.args.no_cache);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn workspace_run_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.commands.is_none());
    assert!(cli.args.packages.is_none());
    assert!(cli.args.modules.is_none());
    assert!(!cli.args.logs);
    assert!(!cli.args.no_cache);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn workspace_run_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn execute_skips_commands_missing_from_every_package_json() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"build\":\"exit 0\"}");

    assert!(execute(&WorkspaceRunArgs {
        commands: Some("nope,build".to_string()),
        no_cache: true,
        cwd: Some(tmp.path().display().to_string()),
        ..Default::default()
    }));
}

#[test]
fn execute_succeeds_when_no_command_matches_any_script() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"build\":\"exit 0\"}");

    assert!(execute(&WorkspaceRunArgs {
        commands: Some("nope".to_string()),
        no_cache: true,
        cwd: Some(tmp.path().display().to_string()),
        ..Default::default()
    }));
}

#[test]
fn execute_runs_only_the_targets_that_declare_the_script() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"build\":\"exit 0\"}");
    write_module(tmp.path(), "beta", "{\"lint\":\"exit 0\"}");

    assert!(execute(&WorkspaceRunArgs {
        commands: Some("build".to_string()),
        no_cache: true,
        cwd: Some(tmp.path().display().to_string()),
        ..Default::default()
    }));
}

#[test]
fn execute_errors_when_commands_option_is_missing() {
    let tmp = tempfile::tempdir().expect("tempdir");

    assert!(!execute(&WorkspaceRunArgs {
        no_cache: true,
        cwd: Some(tmp.path().display().to_string()),
        ..Default::default()
    }));
}

#[test]
fn execute_stops_when_a_standalone_command_fails() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"build\":\"exit 1\"}");

    assert!(!execute(&WorkspaceRunArgs {
        commands: Some("build,fmt".to_string()),
        no_cache: true,
        cwd: Some(tmp.path().display().to_string()),
        ..Default::default()
    }));
}

#[test]
fn execute_dispatches_fmt_to_its_standalone_command() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"fmt\":\"exit 0\"}");

    assert!(execute(&WorkspaceRunArgs {
        commands: Some("fmt".to_string()),
        no_cache: true,
        cwd: Some(tmp.path().display().to_string()),
        ..Default::default()
    }));
}

#[test]
fn execute_dispatches_lint_to_its_standalone_command() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"lint\":\"exit 0\"}");

    assert!(execute(&WorkspaceRunArgs {
        commands: Some("lint".to_string()),
        no_cache: true,
        cwd: Some(tmp.path().display().to_string()),
        ..Default::default()
    }));
}

#[test]
fn execute_dispatches_test_to_its_standalone_command() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"test\":\"exit 0\"}");

    assert!(execute(&WorkspaceRunArgs {
        commands: Some("test".to_string()),
        no_cache: true,
        cwd: Some(tmp.path().display().to_string()),
        ..Default::default()
    }));
}

#[test]
fn execute_errors_when_workspace_has_no_targets_at_all() {
    let tmp = tempfile::tempdir().expect("tempdir");

    assert!(!execute(&WorkspaceRunArgs {
        commands: Some("gen".to_string()),
        no_cache: true,
        cwd: Some(tmp.path().display().to_string()),
        ..Default::default()
    }));
}

#[test]
fn execute_errors_when_named_package_does_not_exist() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"gen\":\"exit 0\"}");

    assert!(!execute(&WorkspaceRunArgs {
        commands: Some("gen".to_string()),
        packages: Some("ghost".to_string()),
        no_cache: true,
        cwd: Some(tmp.path().display().to_string()),
        ..Default::default()
    }));
}

#[test]
fn execute_selects_named_package_and_module() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_package(tmp.path(), "core", "{\"gen\":\"exit 0\"}");
    write_module(tmp.path(), "user", "{\"gen\":\"exit 0\"}");

    assert!(execute(&WorkspaceRunArgs {
        commands: Some("gen".to_string()),
        packages: Some("core".to_string()),
        modules: Some("user".to_string()),
        no_cache: true,
        cwd: Some(tmp.path().display().to_string()),
        ..Default::default()
    }));
}

#[test]
fn execute_runs_the_install_command_through_its_own_group() {
    let tmp = tempfile::tempdir().expect("tempdir");
    fs::write(
        tmp.path().join("package.json"),
        "{\"name\":\"root\",\"private\":true}",
    )
    .expect("root package.json");
    write_module(tmp.path(), "alpha", "{\"build\":\"exit 0\"}");

    assert!(execute(&WorkspaceRunArgs {
        commands: Some("install".to_string()),
        no_cache: true,
        cwd: Some(tmp.path().display().to_string()),
        ..Default::default()
    }));
}

#[test]
fn execute_breaks_after_the_first_group_fails() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(
        tmp.path(),
        "alpha",
        "{\"gen\":\"exit 1\",\"check\":\"exit 0\"}",
    );

    assert!(!execute(&WorkspaceRunArgs {
        commands: Some("gen,check".to_string()),
        no_cache: true,
        cwd: Some(tmp.path().display().to_string()),
        ..Default::default()
    }));
}

#[test]
fn execute_runs_every_group_when_none_fail() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(
        tmp.path(),
        "alpha",
        "{\"gen\":\"exit 0\",\"check\":\"exit 0\"}",
    );
    write_module(
        tmp.path(),
        "beta",
        "{\"gen\":\"exit 0\",\"check\":\"exit 0\"}",
    );

    assert!(execute(&WorkspaceRunArgs {
        commands: Some("gen,check".to_string()),
        no_cache: true,
        cwd: Some(tmp.path().display().to_string()),
        ..Default::default()
    }));
}

#[test]
fn execute_saves_the_file_hash_cache_when_caching_is_on() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"gen\":\"exit 0\"}");

    assert!(execute(&WorkspaceRunArgs {
        commands: Some("gen".to_string()),
        no_cache: false,
        cwd: Some(tmp.path().display().to_string()),
        ..Default::default()
    }));

    let cache_file = tmp.path().join("var/cache/workspace/filehashes.json");
    assert!(
        cache_file.exists(),
        "expected the file hash cache to be persisted"
    );
}
