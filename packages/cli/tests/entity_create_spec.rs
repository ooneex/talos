use clap::Parser;
use rust_cli::commands::entity_create::EntityCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: EntityCreateArgs,
}

#[test]
fn entity_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs",
        "--name",
        "User",
        "--module",
        "user",
        "--table-name",
        "users",
        "--override",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("User"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert_eq!(cli.args.table_name.as_deref(), Some("users"));
    assert!(cli.args.r#override);
}

#[test]
fn entity_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(cli.args.table_name.is_none());
    assert!(!cli.args.r#override);
}

#[test]
fn entity_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
