use clap::Parser;
use cli::commands::bitbucket_secret_push::BitbucketSecretPushArgs;
use std::fs;
use std::process::{Command, Output};
use std::sync::Mutex;

mod support;

use support::http::{Reply, Server};

static ENV_GUARD: Mutex<()> = Mutex::new(());

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: BitbucketSecretPushArgs,
}

#[test]
fn bitbucket_secret_push_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos", "--name", "API_KEY", "--value", "shh", "--silent", "--cwd", "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("API_KEY"));
    assert_eq!(cli.args.value.as_deref(), Some("shh"));
    assert!(cli.args.silent);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn bitbucket_secret_push_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.value.is_none());
    assert!(!cli.args.silent);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn bitbucket_secret_push_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

fn run(args: &[&str], envs: &[(&str, &str)], cwd: &std::path::Path) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_talos"));
    command.args(args).current_dir(cwd).env("NO_COLOR", "1");
    for (key, value) in envs {
        command.env(key, value);
    }
    command.output().expect("the talos binary should run")
}

fn text(output: &Output) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

fn seed_repo(root: &std::path::Path) {
    Command::new("git")
        .args(["init", "-q"])
        .current_dir(root)
        .output()
        .expect("git init");
    Command::new("git")
        .args(["remote", "add", "origin", "git@bitbucket.org:acme/web.git"])
        .current_dir(root)
        .output()
        .expect("git remote");
}

fn seed_home(home: &std::path::Path) {
    fs::create_dir_all(home.join(".talos/credentials")).expect("credentials dir");
    fs::write(
        home.join(".talos/credentials/bitbucket.yml"),
        "profiles:\n  default:\n    username: ada\n    token: hunter2\n",
    )
    .expect("credentials");
}

#[test]
fn bitbucket_secret_push_runs_against_the_configured_api_base() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let repo = tempfile::tempdir().expect("tempdir");
    let home = tempfile::tempdir().expect("tempdir");
    seed_repo(repo.path());
    seed_home(home.path());
    let server = Server::start(|_| Reply::status(201, "{}"));

    let output = run(
        &[
            "bitbucket:secret:push",
            "--name",
            "API_KEY",
            "--value",
            "shh",
        ],
        &[
            ("HOME", home.path().to_str().expect("utf8")),
            ("TALOS_BITBUCKET_API_BASE", server.base()),
        ],
        repo.path(),
    );

    assert!(output.status.success(), "{}", text(&output));
    let requests = server.requests();
    assert_eq!(requests[0].method, "POST");
    assert_eq!(
        requests[0].path,
        "/2.0/repositories/acme/web/pipelines_config/variables/"
    );
    assert_eq!(requests[0].json()["key"], "API_KEY");
    assert!(text(&output).contains("Variable \"API_KEY\" pushed to acme/web"));
}

#[test]
fn bitbucket_secret_push_reports_api_failures() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let repo = tempfile::tempdir().expect("tempdir");
    let home = tempfile::tempdir().expect("tempdir");
    seed_repo(repo.path());
    seed_home(home.path());
    let server = Server::start(|_| Reply::status(401, r#"{"error":"bad token"}"#));

    let output = run(
        &[
            "bitbucket:secret:push",
            "--name",
            "API_KEY",
            "--value",
            "shh",
        ],
        &[
            ("HOME", home.path().to_str().expect("utf8")),
            ("TALOS_BITBUCKET_API_BASE", server.base()),
        ],
        repo.path(),
    );

    assert!(!output.status.success());
    assert!(text(&output).contains("Failed to push variable \"API_KEY\" to acme/web"));
    assert!(text(&output).contains("bad token"));
}
