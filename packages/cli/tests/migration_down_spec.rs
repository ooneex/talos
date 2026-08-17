use clap::Parser;
use cli::commands::migration_down::MigrationDownArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: MigrationDownArgs,
}

#[test]
fn migration_down_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--version",
        "20240101",
        "--logs",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.version.as_deref(), Some("20240101"));
    assert!(cli.args.logs);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn migration_down_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.version.is_none());
    assert!(!cli.args.logs);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn migration_down_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}
