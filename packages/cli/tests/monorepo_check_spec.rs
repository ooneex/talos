use clap::Parser;
use cli::commands::monorepo_check::{CHECK_COMMANDS, MonorepoCheckArgs};

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
