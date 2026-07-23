//! Integration tests for `rust_cli::commands::app_init`, moved out of
//! `src/commands/app_init.rs`.

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;

use clap::Parser;
use rust_cli::commands::app_init::{
    AppInitArgs, AppType, install_commitlint_hook, scaffold_destination,
};
use tempfile::tempdir;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: AppInitArgs,
}

#[test]
fn app_init_args_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs",
        "--name",
        "MyApp",
        "--destination",
        "./my-app",
        "--silent",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyApp"));
    assert_eq!(cli.args.destination.as_deref(), Some("./my-app"));
    assert!(cli.args.silent);
}

#[test]
fn app_init_args_defaults_are_none_and_not_silent() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.destination.is_none());
    assert!(!cli.args.silent);
}

/// Builds a fake skeleton directory with the same shape as the real
/// `ooneex/skeleton` repo (as far as `scaffold_destination` cares about).
fn build_fake_skeleton(root: &Path) {
    fs::create_dir_all(root.join(".git")).unwrap();
    fs::write(root.join("bun.lock"), "{}").unwrap();
    fs::write(root.join(".env.example.yml"), "KEY: value\n").unwrap();
    fs::write(root.join("README.md"), "# skeleton\n\nSome description.\n").unwrap();
    fs::write(root.join(".dockerignore"), "node_modules\n").unwrap();

    for module in ["app", "shared", "billing"] {
        fs::create_dir_all(root.join("modules").join(module)).unwrap();
        fs::write(root.join("modules").join(module).join("marker.txt"), module).unwrap();
    }
}

#[test]
fn scaffold_destination_rewrites_env_and_readme() {
    let skeleton = tempdir().unwrap();
    build_fake_skeleton(skeleton.path());
    let destination = tempdir().unwrap();
    let destination_path = destination.path().join("app");

    scaffold_destination(skeleton.path(), &destination_path, "my-app", None).unwrap();

    assert!(!destination_path.join(".git").exists());
    assert!(!destination_path.join("bun.lock").exists());
    assert!(!destination_path.join(".env.example.yml").exists());
    assert_eq!(
        fs::read_to_string(destination_path.join(".env.yml")).unwrap(),
        "KEY: value\n"
    );
    assert_eq!(
        fs::read_to_string(destination_path.join("README.md")).unwrap(),
        "# my-app\n\nSome description."
    );
}

#[test]
fn scaffold_destination_without_app_type_keeps_all_modules() {
    let skeleton = tempdir().unwrap();
    build_fake_skeleton(skeleton.path());
    let destination = tempdir().unwrap();
    let destination_path = destination.path().join("app");

    scaffold_destination(skeleton.path(), &destination_path, "my-app", None).unwrap();

    for module in ["app", "shared", "billing"] {
        assert!(destination_path.join("modules").join(module).is_dir());
    }
    assert!(destination_path.join(".dockerignore").exists());
}

#[test]
fn scaffold_destination_with_api_app_type_keeps_only_app_and_shared_modules() {
    let skeleton = tempdir().unwrap();
    build_fake_skeleton(skeleton.path());
    let destination = tempdir().unwrap();
    let destination_path = destination.path().join("app");

    scaffold_destination(
        skeleton.path(),
        &destination_path,
        "my-app",
        Some(AppType::Api),
    )
    .unwrap();

    assert!(destination_path.join("modules").join("app").is_dir());
    assert!(destination_path.join("modules").join("shared").is_dir());
    assert!(!destination_path.join("modules").join("billing").exists());
}

#[test]
fn scaffold_destination_with_cli_app_type_empties_modules_and_removes_dockerignore() {
    let skeleton = tempdir().unwrap();
    build_fake_skeleton(skeleton.path());
    let destination = tempdir().unwrap();
    let destination_path = destination.path().join("app");

    scaffold_destination(
        skeleton.path(),
        &destination_path,
        "my-app",
        Some(AppType::Cli),
    )
    .unwrap();

    let modules_dir = destination_path.join("modules");
    assert!(modules_dir.is_dir());
    assert_eq!(fs::read_dir(&modules_dir).unwrap().count(), 0);
    assert!(!destination_path.join(".dockerignore").exists());
}

#[test]
fn install_commitlint_hook_writes_an_executable_hook() {
    let repo = tempdir().unwrap();
    assert!(
        Command::new("git")
            .args(["init", "--quiet"])
            .current_dir(repo.path())
            .status()
            .unwrap()
            .success()
    );

    install_commitlint_hook(repo.path()).expect("hook install should succeed in a git repo");

    let hook_path = repo.path().join(".git").join("hooks").join("commit-msg");
    let content = fs::read_to_string(&hook_path).unwrap();
    assert!(content.contains("talos commitlint:check"));

    let mode = fs::metadata(&hook_path).unwrap().permissions().mode();
    assert_eq!(mode & 0o111, 0o111, "hook file should be executable");
}

#[test]
fn install_commitlint_hook_fails_outside_a_git_repository() {
    let not_a_repo = tempdir().unwrap();
    assert!(install_commitlint_hook(not_a_repo.path()).is_err());
}
