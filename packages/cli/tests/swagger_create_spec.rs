use clap::Parser;
use cli::commands::swagger_create::SwaggerCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: SwaggerCreateArgs,
}

#[test]
fn swagger_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--name",
        "MySwagger",
        "--module",
        "app",
        "--design",
        "design",
        "--prefix",
        "gateway",
        "--cwd",
        "./here",
        "--silent",
        "--no-cache",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MySwagger"));
    assert_eq!(cli.args.module.as_deref(), Some("app"));
    assert_eq!(cli.args.design.as_deref(), Some("design"));
    assert_eq!(cli.args.prefix.as_deref(), Some("gateway"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
    assert!(cli.args.no_cache);
}

#[test]
fn swagger_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(cli.args.design.is_none());
    assert!(cli.args.prefix.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
    assert!(!cli.args.no_cache);
}

#[test]
fn swagger_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}
