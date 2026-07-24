//! Integration tests for `rust_cli::commands::docker_create` argument parsing.

use clap::Parser;
use rust_cli::commands::docker_create::DockerCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: DockerCreateArgs,
}

#[test]
fn docker_create_parses_all_flags() {
    let cli = TestCli::try_parse_from(["talosrs", "--name", "redis", "--cwd", "./here"])
        .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("redis"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn docker_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn docker_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
