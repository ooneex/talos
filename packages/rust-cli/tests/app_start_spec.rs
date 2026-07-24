//! Integration tests for `rust_cli::commands::app_start` argument parsing.

use clap::Parser;
use rust_cli::commands::app_start::AppStartArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: AppStartArgs,
}

#[test]
fn app_start_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs",
        "--modules",
        "user",
        "--packages",
        "core",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.modules.as_deref(), Some("user"));
    assert_eq!(cli.args.packages.as_deref(), Some("core"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn app_start_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.modules.is_none());
    assert!(cli.args.packages.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn app_start_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
