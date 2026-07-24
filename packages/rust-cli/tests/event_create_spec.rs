//! Integration tests for `rust_cli::commands::event_create` argument parsing.

use clap::Parser;
use rust_cli::commands::event_create::EventCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: EventCreateArgs,
}

#[test]
fn event_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs",
        "--name",
        "MyEvent",
        "--module",
        "user",
        "--override",
        "--channel",
        "updates",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyEvent"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert!(cli.args.r#override);
    assert_eq!(cli.args.channel.as_deref(), Some("updates"));
}

#[test]
fn event_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(!cli.args.r#override);
    assert!(cli.args.channel.is_none());
}

#[test]
fn event_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
