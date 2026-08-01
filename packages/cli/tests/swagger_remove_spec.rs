use clap::Parser;
use cli::commands::swagger_remove::SwaggerRemoveArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: SwaggerRemoveArgs,
}

#[test]
fn swagger_remove_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--name",
        "MySwagger",
        "--cwd",
        "./here",
        "--silent",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MySwagger"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
}

#[test]
fn swagger_remove_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn swagger_remove_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}
