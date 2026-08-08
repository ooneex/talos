use clap::Parser;
use cli::commands::workspace_check::{
    WorkspaceCheckArgs, build_args, coverage_args, install_args, lint_args,
};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: WorkspaceCheckArgs,
}

#[test]
fn workspace_check_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--packages",
        "core",
        "--modules",
        "user",
        "--logs",
        "--no-cache",
        "--threshold",
        "85",
        "--concurrency",
        "4",
        "--strict",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.packages.as_deref(), Some("core"));
    assert_eq!(cli.args.modules.as_deref(), Some("user"));
    assert!(cli.args.logs);
    assert!(cli.args.no_cache);
    assert_eq!(cli.args.threshold, Some(85.0));
    assert_eq!(cli.args.concurrency, Some(4));
    assert!(cli.args.strict);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn workspace_check_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.packages.is_none());
    assert!(cli.args.modules.is_none());
    assert!(!cli.args.logs);
    assert!(!cli.args.no_cache);
    assert!(cli.args.threshold.is_none());
    assert!(cli.args.concurrency.is_none());
    assert!(!cli.args.strict);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn workspace_check_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn workspace_check_builds_the_install_arguments() {
    let args = WorkspaceCheckArgs {
        packages: Some("core".to_string()),
        modules: Some("user".to_string()),
        logs: true,
        no_cache: true,
        threshold: Some(85.0),
        concurrency: Some(4),
        strict: true,
        cwd: Some("./here".to_string()),
    };

    let install = install_args(&args);

    assert!(!install.force);
    assert!(install.audit_level.is_none());
    assert!(!install.skip_audit);
    assert!(install.no_cache);
    assert_eq!(install.cwd.as_deref(), Some("./here"));
}

#[test]
fn workspace_check_builds_the_build_arguments() {
    let args = WorkspaceCheckArgs {
        packages: Some("core".to_string()),
        modules: Some("user".to_string()),
        logs: true,
        no_cache: true,
        threshold: Some(85.0),
        concurrency: Some(4),
        strict: true,
        cwd: Some("./here".to_string()),
    };

    let build = build_args(&args);

    assert_eq!(build.packages.as_deref(), Some("core"));
    assert_eq!(build.modules.as_deref(), Some("user"));
    assert!(build.logs);
    assert!(build.no_cache);
    assert_eq!(build.cwd.as_deref(), Some("./here"));
}

#[test]
fn workspace_check_builds_the_lint_arguments() {
    let args = WorkspaceCheckArgs {
        packages: Some("core".to_string()),
        modules: Some("user".to_string()),
        logs: true,
        no_cache: true,
        threshold: Some(85.0),
        concurrency: Some(4),
        strict: true,
        cwd: Some("./here".to_string()),
    };

    let lint = lint_args(&args);

    assert_eq!(lint.packages.as_deref(), Some("core"));
    assert_eq!(lint.modules.as_deref(), Some("user"));
    assert!(lint.logs);
    assert!(lint.no_cache);
    assert_eq!(lint.cwd.as_deref(), Some("./here"));
}

#[test]
fn workspace_check_builds_the_coverage_arguments() {
    let args = WorkspaceCheckArgs {
        packages: Some("core".to_string()),
        modules: Some("user".to_string()),
        logs: true,
        no_cache: true,
        threshold: Some(85.0),
        concurrency: Some(4),
        strict: true,
        cwd: Some("./here".to_string()),
    };

    let coverage = coverage_args(&args);

    assert!(!coverage.issues);
    assert_eq!(coverage.packages.as_deref(), Some("core"));
    assert_eq!(coverage.modules.as_deref(), Some("user"));
    assert!(coverage.logs);
    assert!(coverage.no_cache);
    assert_eq!(coverage.threshold, Some(85.0));
    assert_eq!(coverage.concurrency, Some(4));
    assert!(coverage.strict);
    assert_eq!(coverage.cwd.as_deref(), Some("./here"));
}
