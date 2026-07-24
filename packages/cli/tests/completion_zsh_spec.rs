use clap::Parser;
use cli::commands::completion_zsh::CompletionZshArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: CompletionZshArgs,
}

#[test]
fn completion_zsh_parses_with_no_arguments() {
    assert!(TestCli::try_parse_from(["talos"]).is_ok());
}

#[test]
fn completion_zsh_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}
