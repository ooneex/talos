//! Integration tests for `rust_cli::commands::upgrade` argument parsing.

use clap::Parser;
use rust_cli::commands::upgrade::UpgradeArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: UpgradeArgs,
}

#[test]
fn upgrade_parses_all_flags() {
    let cli = TestCli::try_parse_from(["talosrs", "--cwd", "./here"])
        .expect("valid arguments should parse");

    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn upgrade_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.cwd.is_none());
}

#[test]
fn upgrade_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
