use clap::Parser;
use rust_cli::commands::completion_bash::CompletionBashArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: CompletionBashArgs,
}

#[test]
fn completion_bash_parses_with_no_arguments() {
    assert!(TestCli::try_parse_from(["talosrs"]).is_ok());
}

#[test]
fn completion_bash_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
