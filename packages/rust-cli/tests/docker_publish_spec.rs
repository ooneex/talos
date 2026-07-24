//! Integration tests for `rust_cli::commands::docker_publish` argument parsing.

use clap::Parser;
use rust_cli::commands::docker_publish::DockerPublishArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: DockerPublishArgs,
}

#[test]
fn docker_publish_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs",
        "--packages",
        "core",
        "--modules",
        "user",
        "--tag",
        "1.0.0",
        "--silent",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.packages.as_deref(), Some("core"));
    assert_eq!(cli.args.modules.as_deref(), Some("user"));
    assert_eq!(cli.args.tag.as_deref(), Some("1.0.0"));
    assert!(cli.args.silent);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn docker_publish_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.packages.is_none());
    assert!(cli.args.modules.is_none());
    assert!(cli.args.tag.is_none());
    assert!(!cli.args.silent);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn docker_publish_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
