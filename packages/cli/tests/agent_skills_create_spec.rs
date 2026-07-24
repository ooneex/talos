use clap::Parser;
use rust_cli::commands::agent_skills_create::AgentSkillsCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: AgentSkillsCreateArgs,
}

#[test]
fn agent_skills_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs",
        "--agents",
        "a",
        "--agents",
        "b",
        "--name",
        "MyAgent",
        "--source-dir",
        "./skills",
        "--silent",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.agents, vec!["a".to_string(), "b".to_string()]);
    assert_eq!(cli.args.name.as_deref(), Some("MyAgent"));
    assert_eq!(cli.args.source_dir.as_deref(), Some("./skills"));
    assert!(cli.args.silent);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn agent_skills_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.agents.is_empty());
    assert!(cli.args.name.is_none());
    assert!(cli.args.source_dir.is_none());
    assert!(!cli.args.silent);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn agent_skills_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
