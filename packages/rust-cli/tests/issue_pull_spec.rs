//! Integration tests for `rust_cli::commands::issue_pull` argument parsing.

use clap::Parser;
use rust_cli::commands::issue_pull::IssuePullArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: IssuePullArgs,
}

#[test]
fn issue_pull_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs", "--id", "ABC-123", "--module", "user", "--cwd", "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.id.as_deref(), Some("ABC-123"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn issue_pull_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.id.is_none());
    assert!(cli.args.module.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn issue_pull_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
