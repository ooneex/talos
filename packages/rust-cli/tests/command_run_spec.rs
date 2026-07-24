use clap::Parser;
use rust_cli::commands::command_run::CommandRunArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: CommandRunArgs,
}

#[test]
fn command_run_parses_id_and_cwd() {
    let cli = TestCli::try_parse_from(["talosrs", "--id", "seed", "--cwd", "./here"])
        .expect("valid arguments should parse");

    assert_eq!(cli.args.id.as_deref(), Some("seed"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.args.is_empty());
}

#[test]
fn command_run_collects_trailing_var_args() {
    let cli = TestCli::try_parse_from(["talosrs", "--id", "seed", "--", "run", "--flag", "-x"])
        .expect("trailing arguments should parse");

    assert_eq!(cli.args.id.as_deref(), Some("seed"));
    assert_eq!(
        cli.args.args,
        vec!["run".to_string(), "--flag".to_string(), "-x".to_string(),]
    );
}

#[test]
fn command_run_allows_hyphen_values_in_trailing_args() {
    let cli = TestCli::try_parse_from(["talosrs", "--", "--only-hyphenated"])
        .expect("hyphenated trailing arguments should parse");

    assert_eq!(cli.args.args, vec!["--only-hyphenated".to_string()]);
}

#[test]
fn command_run_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.id.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(cli.args.args.is_empty());
}
