//! Integration tests for `rust_cli::commands::docker_credentials_create` argument parsing.

use clap::Parser;
use rust_cli::commands::docker_credentials_create::DockerCredentialsCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: DockerCredentialsCreateArgs,
}

#[test]
fn docker_credentials_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs",
        "--registry",
        "docker.io",
        "--username",
        "alice",
        "--token",
        "secret",
        "--silent",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.registry.as_deref(), Some("docker.io"));
    assert_eq!(cli.args.username.as_deref(), Some("alice"));
    assert_eq!(cli.args.token.as_deref(), Some("secret"));
    assert!(cli.args.silent);
}

#[test]
fn docker_credentials_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.registry.is_none());
    assert!(cli.args.username.is_none());
    assert!(cli.args.token.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn docker_credentials_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
