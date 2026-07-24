//! Integration tests for `rust_cli::commands::github_secret_push` argument parsing.

use clap::Parser;
use rust_cli::commands::github_secret_push::GithubSecretPushArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: GithubSecretPushArgs,
}

#[test]
fn github_secret_push_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs", "--name", "API_KEY", "--value", "shh", "--silent", "--cwd", "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("API_KEY"));
    assert_eq!(cli.args.value.as_deref(), Some("shh"));
    assert!(cli.args.silent);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn github_secret_push_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.value.is_none());
    assert!(!cli.args.silent);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn github_secret_push_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
