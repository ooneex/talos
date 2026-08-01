//! Drives the GitHub issue integration against a stand-in `gh`.
//!
//! Everything the CLI knows about GitHub goes through the `gh` binary, so a
//! script named `gh` at the front of `PATH` is enough to exercise the whole
//! path — the wrapper, `issue:pull --provider=github` and
//! `issue:push --provider=github` — without a network or an account. The stub
//! records the arguments it was called with so the tests can assert on them.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

/// The canned issue the stub answers `gh issue view` with.
const ISSUE_JSON: &str = r#"{
  "number": 42,
  "title": "Add pagination",
  "body": "Page the list",
  "state": "OPEN",
  "labels": [{ "name": "Feature" }, { "name": "API" }],
  "comments": [
    { "author": { "login": "octocat" }, "body": "Looks good" },
    { "body": "No author here" }
  ]
}"#;

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("a parent")).expect("create parent");
    fs::write(path, content).expect("write file");
}

/// A directory holding a `gh` script that answers the calls the CLI makes and
/// appends every invocation to `calls.log` beside it.
fn stub_gh(tag: &str, exit_code: u8) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("talos-gh-{tag}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("create stub dir");

    let script = format!(
        r#"#!/bin/sh
printf '%s\n' "$*" >> "$(dirname "$0")/calls.log"
case "$1" in
  --version) echo "gh version 2.0.0"; exit {exit_code} ;;
esac
case "$2" in
  view) cat <<'JSON'
{ISSUE_JSON}
JSON
        exit {exit_code} ;;
  create) echo "https://github.com/ooneex/scratch/issues/42"; exit {exit_code} ;;
esac
exit {exit_code}
"#
    );
    let path = dir.join("gh");
    fs::write(&path, script).expect("write the stub");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).expect("make it executable");
    }
    dir
}

fn calls(stub: &Path) -> String {
    fs::read_to_string(stub.join("calls.log")).unwrap_or_default()
}

/// A workspace with one module and one local issue.
fn workspace() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().to_path_buf();
    write(&root.join("modules/user/user.yml"), "type: \"module\"\n");
    write(
        &root.join("modules/user/package.json"),
        "{ \"name\": \"@module/user\" }\n",
    );
    (dir, root)
}

fn talos(root: &Path, stub: Option<&Path>, args: &[&str]) -> Output {
    let path = match stub {
        Some(stub) => format!("{}:/usr/bin:/bin", stub.display()),
        None => "/nonexistent".to_string(),
    };
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .arg(format!("--cwd={}", root.display()))
        .env("PATH", path)
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .output()
        .expect("the talos binary should run")
}

fn text(output: &Output) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

// ---------------------------------------------------------------------------
// Pulling
// ---------------------------------------------------------------------------

#[test]
fn pulling_an_issue_writes_the_yaml_the_local_tools_read() {
    let (_dir, root) = workspace();
    let stub = stub_gh("pull", 0);

    let output = talos(
        &root,
        Some(&stub),
        &[
            "issue:pull",
            "--provider=github",
            "--id=42",
            "--module=user",
        ],
    );

    assert!(output.status.success(), "{}", text(&output));
    let issue =
        fs::read_to_string(root.join("modules/user/issues/42.yml")).expect("the issue was written");
    assert!(issue.contains("Add pagination"), "{issue}");
    assert!(issue.contains("Page the list"), "{issue}");
    assert!(issue.contains("Feature"), "{issue}");
    assert!(
        issue.contains("Todo"),
        "an open issue lands in Todo: {issue}"
    );
    assert!(
        issue.contains("- \"API\""),
        "every label comes across: {issue}"
    );
}

#[test]
fn pulling_without_the_github_cli_installed_stops_with_an_explanation() {
    let (_dir, root) = workspace();

    let output = talos(&root, None, &["issue:pull", "--provider=github", "--id=42"]);

    assert!(!output.status.success());
    assert!(text(&output).contains("gh"), "{}", text(&output));
}

#[test]
fn pulling_with_no_id_at_all_is_refused() {
    let (_dir, root) = workspace();
    let stub = stub_gh("pull-no-id", 0);

    let output = talos(&root, Some(&stub), &["issue:pull", "--provider=github"]);

    assert!(!output.status.success());
    assert!(text(&output).contains("issue id"), "{}", text(&output));
}

#[test]
fn an_issue_the_cli_cannot_read_is_reported_rather_than_written() {
    let (_dir, root) = workspace();
    let stub = stub_gh("pull-fail", 1);

    let output = talos(
        &root,
        Some(&stub),
        &[
            "issue:pull",
            "--provider=github",
            "--id=42",
            "--module=user",
        ],
    );

    assert!(!output.status.success());
    assert!(
        !root.join("modules/user/issues/42.yml").exists(),
        "nothing is written for an issue that could not be read"
    );
}

// ---------------------------------------------------------------------------
// Pushing
// ---------------------------------------------------------------------------

#[test]
fn pushing_an_existing_issue_edits_it_in_place_and_syncs_its_state() {
    let (_dir, root) = workspace();
    let stub = stub_gh("push-update", 0);
    write(
        &root.join("modules/user/issues/42.yml"),
        "id: \"42\"\nmodule: \"user\"\ntitle: \"Add pagination\"\nstate: \"Done\"\nlabels:\n  - \"Feature\"\ncontext: |\n  The list is long.\ngoal: |\n  Page it.\n",
    );

    let output = talos(
        &root,
        Some(&stub),
        &[
            "issue:push",
            "--provider=github",
            "--id=42",
            "--module=user",
        ],
    );

    assert!(output.status.success(), "{}", text(&output));
    let log = calls(&stub);
    assert!(log.contains("issue edit 42"), "{log}");
    assert!(
        log.contains("issue close 42"),
        "a Done issue is closed: {log}"
    );
    assert!(log.contains("label create Feature"), "{log}");
}

#[test]
fn pushing_a_new_issue_creates_it_and_renames_the_file_to_the_number_it_got() {
    let (_dir, root) = workspace();
    let stub = stub_gh("push-create", 0);
    write(
        &root.join("modules/user/issues/OON-100000.yml"),
        "id: \"OON-100000\"\nmodule: \"user\"\ntitle: \"Add pagination\"\nstate: \"Todo\"\ncomments:\n  - message: \"Please do this\"\n",
    );

    let output = talos(
        &root,
        Some(&stub),
        &[
            "issue:push",
            "--provider=github",
            "--id=OON-100000",
            "--module=user",
        ],
    );

    assert!(output.status.success(), "{}", text(&output));
    let log = calls(&stub);
    assert!(log.contains("issue create"), "{log}");
    assert!(log.contains("issue comment 42"), "{log}");
    assert!(
        root.join("modules/user/issues/42.yml").is_file(),
        "the file takes the number GitHub assigned"
    );
    assert!(
        !root.join("modules/user/issues/OON-100000.yml").exists(),
        "the placeholder id is gone"
    );
}

#[test]
fn pushing_an_issue_with_no_local_file_is_reported() {
    let (_dir, root) = workspace();
    let stub = stub_gh("push-missing", 0);

    let output = talos(
        &root,
        Some(&stub),
        &["issue:push", "--provider=github", "--id=OON-999999"],
    );

    assert!(!output.status.success());
    assert!(text(&output).contains("OON-999999"), "{}", text(&output));
}

#[test]
fn pushing_without_the_github_cli_installed_stops_with_an_explanation() {
    let (_dir, root) = workspace();

    let output = talos(&root, None, &["issue:push", "--provider=github", "--id=42"]);

    assert!(!output.status.success());
    assert!(text(&output).contains("gh"), "{}", text(&output));
}

#[test]
fn pushing_with_no_id_at_all_is_refused() {
    let (_dir, root) = workspace();

    let output = talos(&root, None, &["issue:push", "--provider=github"]);

    assert!(!output.status.success());
    assert!(text(&output).contains("issue id"), "{}", text(&output));
}
