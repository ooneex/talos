use clap::Parser;
use rust_cli::commands::microservice_create::MicroserviceCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: MicroserviceCreateArgs,
}

#[test]
fn microservice_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs", "--name", "payments", "--cwd", "./here", "--silent",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("payments"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
}

#[test]
fn microservice_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn microservice_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
