use clap::Parser;
use cli::commands::commitlint_init::{CommitlintInitArgs, run};
use std::fs;
use std::process::Command;
#[cfg(unix)]
use std::process::Output;
use std::sync::Mutex;
use tempfile::tempdir;

static ENV_GUARD: Mutex<()> = Mutex::new(());

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
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
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

#[cfg(unix)]
fn talos(args: &[&str], path: &std::path::Path) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .env("NO_COLOR", "1")
        .env("PATH", path)
        .output()
        .expect("talos should run")
}

#[cfg(unix)]
fn text(output: &Output) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

#[test]
fn commitlint_init_returns_cleanly_when_git_is_missing() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let dir = tempdir().unwrap();
    let empty_bin = dir.path().join("bin");
    fs::create_dir_all(&empty_bin).unwrap();

    let previous_path = std::env::var_os("PATH");
    unsafe {
        std::env::set_var("PATH", &empty_bin);
    }
    run(&CommitlintInitArgs {
        cwd: Some(dir.path().to_string_lossy().to_string()),
    });
    match previous_path {
        Some(value) => unsafe {
            std::env::set_var("PATH", value);
        },
        None => unsafe {
            std::env::remove_var("PATH");
        },
    }

    assert!(!dir.path().join(".git/hooks/commit-msg").exists());
}

/// The `git` stand-in is a shell script, so this one is unix-only.
#[cfg(unix)]
#[test]
fn commitlint_init_exits_with_an_error_outside_a_git_repository() {
    use std::os::unix::fs::PermissionsExt;

    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let dir = tempdir().unwrap();
    let bin = dir.path().join("bin");
    fs::create_dir_all(&bin).unwrap();
    let git = bin.join("git");
    fs::write(
        &git,
        "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then exit 0; fi\nexit 0\n",
    )
    .unwrap();
    let mut permissions = fs::metadata(&git).unwrap().permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&git, permissions).unwrap();

    let output = talos(
        &[
            "commitlint:init",
            "--cwd",
            dir.path().to_str().expect("utf8"),
        ],
        &bin,
    );

    assert!(!output.status.success());
    assert!(text(&output).contains("git repository"));
}
