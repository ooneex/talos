use std::fs;
use std::path::Path;

use clap::Parser;
use cli::commands::test::{TestArgs, execute};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: TestArgs,
}

#[test]
fn test_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--packages",
        "core",
        "--modules",
        "user",
        "--logs",
        "--no-cache",
        "--concurrency",
        "3",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.packages.as_deref(), Some("core"));
    assert_eq!(cli.args.modules.as_deref(), Some("user"));
    assert!(cli.args.logs);
    assert!(cli.args.no_cache);
    assert_eq!(cli.args.concurrency, Some(3));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn test_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.packages.is_none());
    assert!(cli.args.modules.is_none());
    assert!(!cli.args.logs);
    assert!(!cli.args.no_cache);
    assert!(cli.args.concurrency.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn test_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
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

/// A module whose `tests/` directory actually holds a file, so `test:build_group`
/// does not mark its task `Skipped` and the scheduler really runs the script.
fn write_module_with_tests(root: &Path, name: &str, scripts: &str) {
    write_module(root, name, scripts);
    let tests_dir = root.join("modules").join(name).join("tests");
    fs::create_dir_all(&tests_dir).expect("tests dir");
    fs::write(tests_dir.join("smoke.spec.js"), "// smoke test").expect("tests fixture");
}

fn args(cwd: &Path) -> TestArgs {
    TestArgs {
        packages: None,
        modules: None,
        logs: false,
        no_cache: true,
        concurrency: None,
        cwd: Some(cwd.display().to_string()),
    }
}

#[test]
fn execute_honours_a_concurrency_of_one() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module_with_tests(tmp.path(), "alpha", "{\"test\":\"true\"}");
    write_module_with_tests(tmp.path(), "beta", "{\"test\":\"true\"}");

    assert!(execute(&TestArgs {
        concurrency: Some(1),
        ..args(tmp.path())
    }));
}

#[test]
fn execute_errors_when_no_packages_or_modules_are_found() {
    let tmp = tempfile::tempdir().expect("tempdir");

    assert!(!execute(&args(tmp.path())));
}

#[test]
fn execute_errors_for_an_unknown_named_package() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module_with_tests(tmp.path(), "alpha", "{\"test\":\"true\"}");

    assert!(!execute(&TestArgs {
        packages: Some("does-not-exist".to_string()),
        ..args(tmp.path())
    }));
}

#[test]
fn execute_errors_for_an_unknown_named_module() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module_with_tests(tmp.path(), "alpha", "{\"test\":\"true\"}");

    assert!(!execute(&TestArgs {
        modules: Some("does-not-exist".to_string()),
        ..args(tmp.path())
    }));
}

#[test]
fn execute_skips_when_no_target_declares_a_test_script() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module(tmp.path(), "alpha", "{\"build\":\"true\"}");

    assert!(execute(&args(tmp.path())));
}

#[test]
fn execute_runs_a_single_target_with_a_test_script() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module_with_tests(tmp.path(), "alpha", "{\"test\":\"true\"}");

    assert!(execute(&TestArgs {
        no_cache: false,
        ..args(tmp.path())
    }));
}

#[test]
fn execute_runs_multiple_targets_with_test_scripts() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module_with_tests(tmp.path(), "alpha", "{\"test\":\"true\"}");
    write_module_with_tests(tmp.path(), "beta", "{\"test\":\"true\"}");

    assert!(execute(&args(tmp.path())));
}

#[test]
fn execute_with_no_cache_true_still_succeeds() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module_with_tests(tmp.path(), "alpha", "{\"test\":\"true\"}");

    assert!(execute(&TestArgs {
        no_cache: true,
        ..args(tmp.path())
    }));
}

#[test]
fn execute_reports_failure_when_the_test_script_fails() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module_with_tests(tmp.path(), "alpha", "{\"test\":\"exit 1\"}");

    assert!(!execute(&args(tmp.path())));
}

#[test]
fn execute_filters_to_the_named_module_only() {
    let tmp = tempfile::tempdir().expect("tempdir");
    write_module_with_tests(tmp.path(), "alpha", "{\"test\":\"true\"}");
    write_module_with_tests(tmp.path(), "beta", "{\"test\":\"exit 1\"}");

    assert!(execute(&TestArgs {
        modules: Some("alpha".to_string()),
        ..args(tmp.path())
    }));
}
