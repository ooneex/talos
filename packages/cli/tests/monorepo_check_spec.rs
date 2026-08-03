use clap::Parser;
use cli::commands::monorepo_check::{
    CHECK_COMMANDS, MonorepoCheckArgs, coverage_args, script_args,
};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: MonorepoCheckArgs,
}

#[test]
fn monorepo_check_parses_all_flags() {
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
fn monorepo_check_defaults_are_empty() {
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

/// The scripted half of the gate. `test` is absent on purpose: the suites are
/// run by `coverage:check` afterwards, so scripting them here would run them
/// twice.
#[test]
fn monorepo_check_runs_the_scripted_gate_in_order() {
    assert_eq!(CHECK_COMMANDS, "install,build,fmt,lint");
}

#[test]
fn monorepo_check_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn monorepo_check_builds_the_scripted_gate_arguments() {
    let args = MonorepoCheckArgs {
        packages: Some("core".to_string()),
        modules: Some("user".to_string()),
        logs: true,
        no_cache: true,
        threshold: Some(85.0),
        concurrency: Some(4),
        strict: true,
        cwd: Some("./here".to_string()),
    };

    let scripted = script_args(&args);

    assert_eq!(scripted.commands.as_deref(), Some(CHECK_COMMANDS));
    assert_eq!(scripted.packages.as_deref(), Some("core"));
    assert_eq!(scripted.modules.as_deref(), Some("user"));
    assert!(scripted.logs);
    assert!(scripted.no_cache);
    assert_eq!(scripted.cwd.as_deref(), Some("./here"));
}

#[test]
fn monorepo_check_builds_the_coverage_arguments() {
    let args = MonorepoCheckArgs {
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
