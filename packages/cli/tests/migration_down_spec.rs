use clap::Parser;
use rust_cli::commands::migration_down::MigrationDownArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: MigrationDownArgs,
}

#[test]
fn migration_down_parses_all_flags() {
    let cli = TestCli::try_parse_from(["talosrs", "--version", "20240101", "--cwd", "./here"])
        .expect("valid arguments should parse");

    assert_eq!(cli.args.version.as_deref(), Some("20240101"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn migration_down_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.version.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn migration_down_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
