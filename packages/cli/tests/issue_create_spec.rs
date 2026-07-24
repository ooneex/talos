use clap::Parser;
use rust_cli::commands::issue_create::IssueCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: IssueCreateArgs,
}

#[test]
fn issue_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs",
        "--title",
        "My issue",
        "--priority",
        "high",
        "--description",
        "details",
        "--label",
        "a",
        "--label",
        "b",
        "--module",
        "user",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.title.as_deref(), Some("My issue"));
    assert_eq!(cli.args.priority.as_deref(), Some("high"));
    assert_eq!(cli.args.description.as_deref(), Some("details"));
    assert_eq!(cli.args.labels, vec!["a".to_string(), "b".to_string()]);
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn issue_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.title.is_none());
    assert!(cli.args.priority.is_none());
    assert!(cli.args.description.is_none());
    assert!(cli.args.labels.is_empty());
    assert!(cli.args.module.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn issue_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
