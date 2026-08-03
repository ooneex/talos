use clap::Parser;
use cli::commands::commitlint_init::{CommitlintInitArgs, run};
use std::fs;
use std::process::Command;
use tempfile::tempdir;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: CommitlintInitArgs,
}

#[test]
fn commitlint_init_parses_all_flags() {
    let cli = TestCli::try_parse_from(["talos", "--cwd", "./here"])
        .expect("valid arguments should parse");

    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn commitlint_init_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.cwd.is_none());
}

#[test]
fn commitlint_init_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn commitlint_init_installs_hook_inside_a_git_repository() {
    let repo = tempdir().unwrap();
    assert!(
        Command::new("git")
            .args(["init", "--quiet"])
            .current_dir(repo.path())
            .status()
            .unwrap()
            .success()
    );

    run(&CommitlintInitArgs {
        cwd: Some(repo.path().to_string_lossy().to_string()),
    });

    let hook_path = repo.path().join(".git").join("hooks").join("commit-msg");
    assert!(hook_path.exists());
    let content = fs::read_to_string(&hook_path).unwrap();
    assert!(content.contains("talos commitlint:check"));
}
