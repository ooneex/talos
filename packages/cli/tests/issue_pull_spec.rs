use clap::Parser;
use cli::commands::issue_pull::IssuePullArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: IssuePullArgs,
}

#[test]
fn issue_pull_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos", "--id", "ABC-123", "--module", "user", "--cwd", "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.id, vec!["ABC-123".to_string()]);
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn issue_pull_parses_comma_separated_ids() {
    let cli = TestCli::try_parse_from(["talos", "--id", "ABC-1,ABC-2,ABC-3"])
        .expect("comma-separated ids should parse");

    assert_eq!(
        cli.args.id,
        vec![
            "ABC-1".to_string(),
            "ABC-2".to_string(),
            "ABC-3".to_string()
        ]
    );
}

#[test]
fn issue_pull_parses_repeated_id_flags() {
    let cli = TestCli::try_parse_from(["talos", "--id", "ABC-1", "--id", "ABC-2"])
        .expect("repeated id flags should parse");

    assert_eq!(cli.args.id, vec!["ABC-1".to_string(), "ABC-2".to_string()]);
}

#[test]
fn issue_pull_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.id.is_empty());
    assert!(cli.args.module.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn issue_pull_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}
