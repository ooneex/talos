//! Integration tests for `rust_cli::commands::release_create` argument parsing.

use clap::Parser;
use rust_cli::commands::release_create::ReleaseCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: ReleaseCreateArgs,
}

#[test]
fn release_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs",
        "--modules",
        "user",
        "--packages",
        "core",
        "--publish",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.modules.as_deref(), Some("user"));
    assert_eq!(cli.args.packages.as_deref(), Some("core"));
    assert!(cli.args.publish);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn release_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.modules.is_none());
    assert!(cli.args.packages.is_none());
    assert!(!cli.args.publish);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn release_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
