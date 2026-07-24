//! Integration tests for `rust_cli::commands::jira_credentials_create` argument parsing.

use clap::Parser;
use rust_cli::commands::jira_credentials_create::JiraCredentialsCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: JiraCredentialsCreateArgs,
}

#[test]
fn jira_credentials_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs",
        "--base-url",
        "https://jira.example.com",
        "--email",
        "alice@example.com",
        "--token",
        "secret",
        "--silent",
    ])
    .expect("valid arguments should parse");

    assert_eq!(
        cli.args.base_url.as_deref(),
        Some("https://jira.example.com")
    );
    assert_eq!(cli.args.email.as_deref(), Some("alice@example.com"));
    assert_eq!(cli.args.token.as_deref(), Some("secret"));
    assert!(cli.args.silent);
}

#[test]
fn jira_credentials_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.base_url.is_none());
    assert!(cli.args.email.is_none());
    assert!(cli.args.token.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn jira_credentials_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
