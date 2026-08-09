use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;

use clap::Parser;
use cli::commands::build::{BuildArgs, execute};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: BuildArgs,
}

fn args(root: &Path) -> BuildArgs {
    BuildArgs {
        packages: None,
        modules: None,
        logs: false,
        no_cache: true,
        cwd: Some(root.display().to_string()),
    }
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

/// A module with no `package.json`, only a `Cargo.toml` — falls back to the
/// crate's language defaults (`cargo build`) instead of `bun run build`. The
/// manifest is intentionally invalid so `cargo build` fails immediately
/// rather than doing real work.
fn write_broken_rust_module(root: &Path, name: &str) {
    let dir = root.join("modules").join(name);
    fs::create_dir_all(&dir).expect("module dir");
    fs::write(dir.join("Cargo.toml"), "not valid toml {{{\n").expect("Cargo.toml");
}

/// A module whose build script is an executable shell file, so it can print
/// many lines (and blank ones) without fighting `run_build`'s whitespace-only
/// argv splitting.
fn write_scripted_module(root: &Path, name: &str, script_body: &str) {
    let dir = root.join("modules").join(name);
    fs::create_dir_all(&dir).expect("module dir");
    fs::write(
        dir.join("package.json"),
        format!("{{\"name\":\"{name}\",\"scripts\":{{\"build\":\"./build.sh\"}}}}"),
    )
    .expect("package.json");
    let script_path = dir.join("build.sh");
    fs::write(&script_path, script_body).expect("build.sh");
    let mut perms = fs::metadata(&script_path).expect("metadata").permissions();
    perms.set_mode(0o755);
    fs::set_permissions(&script_path, perms).expect("chmod");
}

#[test]
fn build_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
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

    assert_eq!(cli.args.packages.as_deref(), Some("core"));
    assert_eq!(cli.args.modules.as_deref(), Some("user"));
    assert!(cli.args.logs);
    assert!(cli.args.no_cache);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn build_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.packages.is_none());
    assert!(cli.args.modules.is_none());
    assert!(!cli.args.logs);
    assert!(!cli.args.no_cache);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn build_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn execute_builds_a_passing_target() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"build\":\"exit 0\"}");

    assert!(execute(&args(tmp.path())));
}

#[test]
fn execute_builds_several_passing_targets() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"build\":\"exit 0\"}");
    write_module(tmp.path(), "beta", "{\"build\":\"exit 0\"}");

    assert!(execute(&args(tmp.path())));
}

#[test]
fn execute_reports_an_unknown_named_package() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"build\":\"exit 0\"}");

    let mut a = args(tmp.path());
    a.packages = Some("ghost".to_string());

    assert!(!execute(&a));
}

#[test]
fn execute_reports_an_unknown_named_module() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"build\":\"exit 0\"}");

    let mut a = args(tmp.path());
    a.modules = Some("ghost".to_string());

    assert!(!execute(&a));
}

#[test]
fn execute_fails_when_the_selection_is_empty() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"build\":\"exit 0\"}");

    let mut a = args(tmp.path());
    // A selector present but blank resolves to no wanted targets at all,
    // distinct from "no selector" (which means "everything").
    a.packages = Some(String::new());

    assert!(!execute(&a));
}

#[test]
fn execute_warns_and_succeeds_when_no_target_declares_a_build_script() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"lint\":\"exit 0\"}");

    assert!(execute(&args(tmp.path())));
}

#[test]
fn execute_reports_a_single_failure_without_logs_and_stops_before_later_targets() {
    let tmp = tempfile::tempdir().expect("tempdir");
    // Sorted alphabetically ahead of "zeta" with no dependency between them,
    // "alpha" fails first — the scheduler is fail-fast, so "zeta" must never
    // run at all.
    write_module(tmp.path(), "alpha", "{\"build\":\"false\"}");
    write_module(tmp.path(), "zeta", "{\"build\":\"touch ran.marker\"}");

    let mut a = args(tmp.path());
    a.logs = false;

    assert!(!execute(&a));
    assert!(!tmp.path().join("modules/zeta/ran.marker").exists());
}

#[test]
fn execute_reports_a_failure_with_logs_and_prints_the_tail_of_the_output() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let mut body = String::from("#!/bin/sh\n");
    for n in 1..=50 {
        body.push_str(&format!("echo line-{n}\n"));
        if n % 10 == 0 {
            body.push_str("echo\n");
        }
    }
    body.push_str("exit 1\n");
    write_scripted_module(tmp.path(), "alpha", &body);

    let mut a = args(tmp.path());
    a.logs = true;

    assert!(!execute(&a));
}

#[test]
fn execute_uses_the_language_default_build_script_for_a_target_without_package_json() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_broken_rust_module(tmp.path(), "crate-a");

    // No package.json means `direct_scripts` is true and the target's own
    // `cargo build` runs as-is instead of going through `bun run build`; the
    // manifest is deliberately invalid so cargo fails immediately.
    assert!(!execute(&args(tmp.path())));
}

#[test]
fn execute_hashes_a_transitive_workspace_dependency_into_the_fingerprint() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "core", "{\"build\":\"exit 0\"}");
    // "app" depends on "core" by package name, so build_hash walks its
    // transitive deps and folds core's fingerprint into app's hash.
    let app_dir = tmp.path().join("modules/app");
    fs::create_dir_all(&app_dir).expect("app dir");
    fs::write(
        app_dir.join("package.json"),
        "{\"name\":\"app\",\"scripts\":{\"build\":\"exit 0\"},\"dependencies\":{\"core\":\"*\"}}",
    )
    .expect("package.json");

    assert!(execute(&args(tmp.path())));
}

#[test]
fn run_exits_the_process_with_a_nonzero_status_when_a_build_fails() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"build\":\"false\"}");

    let output = Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(["build", "--no-cache"])
        .current_dir(tmp.path())
        .output()
        .expect("talos should run");

    assert!(!output.status.success());
    assert_eq!(output.status.code(), Some(1));
}

#[test]
fn run_exits_the_process_successfully_when_the_build_passes() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"build\":\"exit 0\"}");

    let output = Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(["build", "--no-cache"])
        .current_dir(tmp.path())
        .output()
        .expect("talos should run");

    assert!(output.status.success());
}

#[test]
fn execute_reuses_a_cached_build_on_a_second_run() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"build\":\"exit 0\"}");

    let mut a = args(tmp.path());
    a.no_cache = false;

    assert!(execute(&a));
    assert!(tmp.path().join("var/cache/build").is_dir());

    // Second run should hit the cache entry written by the first.
    assert!(execute(&a));
}
