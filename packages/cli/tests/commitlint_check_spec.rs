use clap::Parser;
use cli::commands::commitlint_check::CommitlintCheckArgs;
use std::fs;
use std::process::{Command, Output};
use tempfile::tempdir;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: CommitlintCheckArgs,
}

#[test]
fn commitlint_check_parses_all_flags() {
    let cli = TestCli::try_parse_from(["talos", "--file", "./msg.txt", "--cwd", "./here"])
        .expect("valid arguments should parse");

    assert_eq!(cli.args.file.as_deref(), Some("./msg.txt"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn commitlint_check_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.file.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn commitlint_check_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

fn talos(root: &std::path::Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .current_dir(root)
        .env("NO_COLOR", "1")
        .output()
        .expect("talos should run")
}

fn text(output: &Output) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

#[test]
fn commitlint_check_accepts_a_well_formed_message() {
    let dir = tempdir().expect("tempdir");
    fs::write(
        dir.path().join("package.json"),
        "{ \"name\": \"scratch\" }\n",
    )
    .expect("pkg");
    fs::create_dir_all(dir.path().join("modules/user")).expect("module");
    fs::write(
        dir.path().join("modules/user/user.yml"),
        "type: \"backend\"\n",
    )
    .expect("yml");
    fs::write(
        dir.path().join("modules/user/package.json"),
        "{ \"name\": \"@module/user\" }\n",
    )
    .expect("module pkg");
    let message = dir.path().join("COMMIT_EDITMSG");
    fs::write(&message, "feat(user): Add account creation\n").expect("message");

    let output = talos(
        dir.path(),
        &["commitlint:check", &format!("--file={}", message.display())],
    );

    assert!(output.status.success(), "{}", text(&output));
}

#[test]
fn commitlint_check_reports_a_bad_message() {
    let dir = tempdir().expect("tempdir");
    fs::write(
        dir.path().join("package.json"),
        "{ \"name\": \"scratch\" }\n",
    )
    .expect("pkg");
    let message = dir.path().join("COMMIT_EDITMSG");
    fs::write(&message, "Feat(common): bad.\n").expect("message");

    let output = talos(
        dir.path(),
        &["commitlint:check", &format!("--file={}", message.display())],
    );

    let output_text = text(&output);
    assert!(!output.status.success());
    assert!(
        output_text.contains("Invalid commit message"),
        "{output_text}"
    );
}

#[test]
fn commitlint_check_requires_a_message_file() {
    let dir = tempdir().expect("tempdir");

    let output = talos(dir.path(), &["commitlint:check"]);

    assert!(!output.status.success());
    assert!(text(&output).contains("--file"));
}
