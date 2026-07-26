use clap::Parser;
use cli::commands::admin_create::AdminCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: AdminCreateArgs,
}

#[test]
fn admin_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos", "--name", "MyAdmin", "--design", "material", "--cwd", "./here", "--silent",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyAdmin"));
    assert_eq!(cli.args.design.as_deref(), Some("material"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
}

#[test]
fn admin_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.design.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn admin_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}
