use clap::Parser;
use rust_cli::commands::spa_create::SpaCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: SpaCreateArgs,
}

#[test]
fn spa_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs", "--name", "MySpa", "--design", "material", "--cwd", "./here", "--silent",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MySpa"));
    assert_eq!(cli.args.design.as_deref(), Some("material"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
}

#[test]
fn spa_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.design.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn spa_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
