//! Integration tests for `rust_cli::commands::commitlint_check` argument parsing.

use clap::Parser;
use rust_cli::commands::commitlint_check::CommitlintCheckArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: CommitlintCheckArgs,
}

#[test]
fn commitlint_check_parses_all_flags() {
    let cli = TestCli::try_parse_from(["talosrs", "--file", "./msg.txt", "--cwd", "./here"])
        .expect("valid arguments should parse");

    assert_eq!(cli.args.file.as_deref(), Some("./msg.txt"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn commitlint_check_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.file.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn commitlint_check_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
