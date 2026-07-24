//! Integration tests for `rust_cli::commands::module_remove` argument parsing.

use clap::Parser;
use rust_cli::commands::module_remove::ModuleRemoveArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: ModuleRemoveArgs,
}

#[test]
fn module_remove_parses_all_flags() {
    let cli = TestCli::try_parse_from(["talosrs", "--name", "user", "--cwd", "./here", "--silent"])
        .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("user"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
}

#[test]
fn module_remove_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn module_remove_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
