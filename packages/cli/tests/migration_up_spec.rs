use clap::Parser;
use cli::commands::migration_up::MigrationUpArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: MigrationUpArgs,
}

#[test]
fn migration_up_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--modules",
        "user,billing",
        "--packages",
        "color",
        "--drop",
        "--logs",
        "--no-cache",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.modules.as_deref(), Some("user,billing"));
    assert_eq!(cli.args.packages.as_deref(), Some("color"));
    assert!(cli.args.drop);
    assert!(cli.args.logs);
    assert!(cli.args.no_cache);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn migration_up_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.modules.is_none());
    assert!(cli.args.packages.is_none());
    assert!(!cli.args.drop);
    assert!(!cli.args.logs);
    assert!(!cli.args.no_cache);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn migration_up_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}
