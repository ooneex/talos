use clap::Parser;
use rust_cli::commands::migration_up::MigrationUpArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: MigrationUpArgs,
}

#[test]
fn migration_up_parses_all_flags() {
    let cli = TestCli::try_parse_from(["talosrs", "--drop", "--no-cache", "--cwd", "./here"])
        .expect("valid arguments should parse");

    assert!(cli.args.drop);
    assert!(cli.args.no_cache);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn migration_up_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(!cli.args.drop);
    assert!(!cli.args.no_cache);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn migration_up_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
