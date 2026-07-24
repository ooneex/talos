use clap::Parser;
use rust_cli::commands::design_create::DesignCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: DesignCreateArgs,
}

#[test]
fn design_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs", "--name", "MyDesign", "--cwd", "./here", "--silent",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyDesign"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
}

#[test]
fn design_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn design_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
