use clap::Parser;
use cli::commands::Commands;

#[derive(Parser)]
#[command(disable_help_subcommand = true)]
struct TestCli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[test]
fn app_init_subcommand_parses_its_name() {
    let cli = TestCli::try_parse_from(["talos", "app:init", "--name", "MyApp"])
        .expect("app:init should parse");

    match cli.command {
        Some(Commands::AppInit(args)) => assert_eq!(args.name.as_deref(), Some("MyApp")),
        other => panic!("expected Commands::AppInit, got {other:?}"),
    }
}

#[test]
fn app_create_subcommand_parses_its_name() {
    let cli = TestCli::try_parse_from(["talos", "app:create", "--name", "MyApi"])
        .expect("app:create should parse");

    match cli.command {
        Some(Commands::AppCreate(args)) => assert_eq!(args.name.as_deref(), Some("MyApi")),
        other => panic!("expected Commands::AppCreate, got {other:?}"),
    }
}

#[test]
fn project_check_subcommand_parses_its_flags() {
    let cli = TestCli::try_parse_from(["talos", "project:check", "--only", "security", "--strict"])
        .expect("project:check should parse");

    match cli.command {
        Some(Commands::ProjectCheck(args)) => {
            assert_eq!(args.only.as_deref(), Some("security"));
            assert!(args.strict);
        }
        other => panic!("expected Commands::ProjectCheck, got {other:?}"),
    }
}

#[test]
fn no_subcommand_is_valid() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no subcommand should parse");
    assert!(cli.command.is_none());
}

#[test]
fn unknown_subcommand_is_rejected() {
    assert!(TestCli::try_parse_from(["talos", "not-a-command"]).is_err());
}
