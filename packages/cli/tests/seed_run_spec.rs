use clap::Parser;
use rust_cli::commands::seed_run::SeedRunArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: SeedRunArgs,
}

#[test]
fn seed_run_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs",
        "--drop",
        "--env",
        "test",
        "--no-cache",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert!(cli.args.drop);
    assert_eq!(cli.args.env.as_deref(), Some("test"));
    assert!(cli.args.no_cache);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn seed_run_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(!cli.args.drop);
    assert!(cli.args.env.is_none());
    assert!(!cli.args.no_cache);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn seed_run_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
