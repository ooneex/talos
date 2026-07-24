//! Integration tests for `rust_cli::commands::npm_credentials_create` argument parsing.

use clap::Parser;
use rust_cli::commands::npm_credentials_create::NpmCredentialsCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: NpmCredentialsCreateArgs,
}

#[test]
fn npm_credentials_create_parses_all_flags() {
    let cli = TestCli::try_parse_from(["talosrs", "--token", "secret", "--silent"])
        .expect("valid arguments should parse");

    assert_eq!(cli.args.token.as_deref(), Some("secret"));
    assert!(cli.args.silent);
}

#[test]
fn npm_credentials_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.token.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn npm_credentials_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
