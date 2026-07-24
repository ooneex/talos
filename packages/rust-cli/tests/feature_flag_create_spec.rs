//! Integration tests for `rust_cli::commands::feature_flag_create` argument parsing.

use clap::Parser;
use rust_cli::commands::feature_flag_create::FeatureFlagCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: FeatureFlagCreateArgs,
}

#[test]
fn feature_flag_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs",
        "--name",
        "MyResource",
        "--module",
        "user",
        "--override",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyResource"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert!(cli.args.r#override);
}

#[test]
fn feature_flag_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(!cli.args.r#override);
}

#[test]
fn feature_flag_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
