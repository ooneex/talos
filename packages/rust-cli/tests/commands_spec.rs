//! Integration tests for `rust_cli::commands::Commands` subcommand dispatch,
//! moved out of `src/commands/mod.rs`.

use clap::Parser;
use rust_cli::commands::Commands;

#[derive(Parser)]
struct TestCli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[test]
fn app_init_subcommand_parses_its_name() {
    let cli = TestCli::try_parse_from(["talosrs", "app:init", "--name", "MyApp"])
        .expect("app:init should parse");

    match cli.command {
        Some(Commands::AppInit(args)) => assert_eq!(args.name.as_deref(), Some("MyApp")),
        other => panic!("expected Commands::AppInit, got {other:?}"),
    }
}

#[test]
fn app_create_subcommand_parses_its_name() {
    let cli = TestCli::try_parse_from(["talosrs", "app:create", "--name", "MyApi"])
        .expect("app:create should parse");

    match cli.command {
        Some(Commands::AppCreate(args)) => assert_eq!(args.name.as_deref(), Some("MyApi")),
        other => panic!("expected Commands::AppCreate, got {other:?}"),
    }
}

#[test]
fn no_subcommand_is_valid() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no subcommand should parse");
    assert!(cli.command.is_none());
}

#[test]
fn unknown_subcommand_is_rejected() {
    assert!(TestCli::try_parse_from(["talosrs", "not-a-command"]).is_err());
}
