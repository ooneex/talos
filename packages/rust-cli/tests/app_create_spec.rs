//! Integration tests for `rust_cli::commands::app_create`, moved out of
//! `src/commands/app_create.rs`.

use std::fs;

use clap::Parser;
use rust_cli::commands::app_create::{AppCreateArgs, CI_PROVIDERS, write_ci_cd_files, write_named};
use tempfile::tempdir;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: AppCreateArgs,
}

#[test]
fn app_create_args_parses_all_flags() {
    let cli = TestCli::try_parse_from(["talosrs", "--name", "MyApi", "--destination", "./my-api"])
        .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyApi"));
    assert_eq!(cli.args.destination.as_deref(), Some("./my-api"));
}

#[test]
fn app_create_args_defaults_are_none() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.destination.is_none());
}

#[test]
fn write_named_substitutes_name_placeholder() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("nested").join("file.yml");

    write_named(&path, "service: {{NAME}}\n", "my_app").unwrap();

    assert_eq!(fs::read_to_string(&path).unwrap(), "service: my_app\n");
}

#[test]
fn write_ci_cd_files_writes_github_workflows_and_renovate() {
    let dir = tempdir().unwrap();

    write_ci_cd_files(dir.path(), "github", "my_app").unwrap();

    assert!(
        dir.path()
            .join(".github")
            .join("workflows")
            .join("ci.yml")
            .is_file()
    );
    assert!(
        dir.path()
            .join(".github")
            .join("workflows")
            .join("production.yml")
            .is_file()
    );
    assert!(dir.path().join("renovate.json").is_file());
    assert!(!dir.path().join(".gitlab-ci.yml").exists());
}

#[test]
fn write_ci_cd_files_writes_gitlab_pipeline_and_include_file() {
    let dir = tempdir().unwrap();

    write_ci_cd_files(dir.path(), "gitlab", "my_app").unwrap();

    assert!(
        dir.path()
            .join(".gitlab")
            .join("ci")
            .join("ci.yml")
            .is_file()
    );
    assert!(
        dir.path()
            .join(".gitlab")
            .join("ci")
            .join("production.yml")
            .is_file()
    );
    let include = fs::read_to_string(dir.path().join(".gitlab-ci.yml")).unwrap();
    assert!(include.contains(".gitlab/ci/ci.yml"));
    assert!(include.contains(".gitlab/ci/production.yml"));
    assert!(dir.path().join("renovate.json").is_file());
}

#[test]
fn write_ci_cd_files_writes_bitbucket_pipelines() {
    let dir = tempdir().unwrap();

    write_ci_cd_files(dir.path(), "bitbucket", "my_app").unwrap();

    assert!(dir.path().join("bitbucket-pipelines.yml").is_file());
    assert!(dir.path().join("renovate.json").is_file());
}

#[test]
fn ci_providers_lists_the_three_supported_providers() {
    assert_eq!(CI_PROVIDERS, ["github", "gitlab", "bitbucket"]);
}
