use std::fs;
use std::path::Path;

use clap::Parser;
use cli::commands::monorepo_run::{MonorepoRunArgs, execute};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: MonorepoRunArgs,
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

#[test]
fn monorepo_run_parses_all_flags() {
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
fn monorepo_run_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.commands.is_none());
    assert!(cli.args.packages.is_none());
    assert!(cli.args.modules.is_none());
    assert!(!cli.args.logs);
    assert!(!cli.args.no_cache);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn monorepo_run_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn execute_skips_commands_missing_from_every_package_json() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"build\":\"exit 0\"}");

    assert!(execute(&MonorepoRunArgs {
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

    assert!(execute(&MonorepoRunArgs {
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

    assert!(execute(&MonorepoRunArgs {
        commands: Some("build".to_string()),
        no_cache: true,
        cwd: Some(tmp.path().display().to_string()),
        ..Default::default()
    }));
}
