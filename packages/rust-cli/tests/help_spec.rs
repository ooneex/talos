//! Integration tests for `rust_cli::commands::help`.

use clap::Parser;
use rust_cli::commands::help::HelpArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: HelpArgs,
}

#[test]
fn help_parses_with_no_arguments() {
    assert!(TestCli::try_parse_from(["talosrs"]).is_ok());
}

#[test]
fn help_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn help_run_does_not_panic() {
    rust_cli::commands::help::run(&HelpArgs {});
}
