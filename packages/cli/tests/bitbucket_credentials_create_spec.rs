use clap::Parser;
use rust_cli::commands::bitbucket_credentials_create::BitbucketCredentialsCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: BitbucketCredentialsCreateArgs,
}

#[test]
fn bitbucket_credentials_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs",
        "--username",
        "alice",
        "--token",
        "secret",
        "--silent",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.username.as_deref(), Some("alice"));
    assert_eq!(cli.args.token.as_deref(), Some("secret"));
    assert!(cli.args.silent);
}

#[test]
fn bitbucket_credentials_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.username.is_none());
    assert!(cli.args.token.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn bitbucket_credentials_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
