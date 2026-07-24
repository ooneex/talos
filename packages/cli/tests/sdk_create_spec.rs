use clap::Parser;
use rust_cli::commands::sdk_create::SdkCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: SdkCreateArgs,
}

#[test]
fn sdk_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs", "--name", "MySdk", "--module", "user", "--cwd", "./here", "--silent",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MySdk"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
}

#[test]
fn sdk_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn sdk_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
