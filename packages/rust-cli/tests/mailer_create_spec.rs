//! Integration tests for `rust_cli::commands::mailer_create` argument parsing.

use clap::Parser;
use rust_cli::commands::mailer_create::MailerCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: MailerCreateArgs,
}

#[test]
fn mailer_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs",
        "--name",
        "Welcome",
        "--module",
        "user",
        "--override",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("Welcome"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert!(cli.args.r#override);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn mailer_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(!cli.args.r#override);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn mailer_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
