//! Integration tests for `rust_cli::commands::test` argument parsing.

use clap::Parser;
use rust_cli::commands::test::TestArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: TestArgs,
}

#[test]
fn test_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs",
        "--packages",
        "core",
        "--modules",
        "user",
        "--logs",
        "--no-cache",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.packages.as_deref(), Some("core"));
    assert_eq!(cli.args.modules.as_deref(), Some("user"));
    assert!(cli.args.logs);
    assert!(cli.args.no_cache);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn test_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.packages.is_none());
    assert!(cli.args.modules.is_none());
    assert!(!cli.args.logs);
    assert!(!cli.args.no_cache);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn test_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
