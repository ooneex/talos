//! The commit-message rules, and the two commands built on them.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

use cli::utils::{
    check_commit_message_file, get_valid_scopes, lint_commit_message, strip_commit_comments,
};

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("a parent")).expect("create parent");
    fs::write(path, content).expect("write file");
}

/// A workspace whose members are the scopes a commit may name.
fn workspace() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().to_path_buf();
    write(&root.join("package.json"), "{ \"name\": \"scratch\" }\n");
    write(
        &root.join("modules/user/package.json"),
        "{ \"name\": \"@module/user\" }\n",
    );
    write(
        &root.join("packages/cli/package.json"),
        "{ \"name\": \"@scratch/cli\" }\n",
    );
    // A directory with no manifest is not a member, and neither is a dotfile.
    fs::create_dir_all(root.join("modules/scratchpad")).expect("create dir");
    fs::create_dir_all(root.join("modules/.hidden")).expect("create dir");
    (dir, root)
}

fn scopes(root: &Path) -> Vec<String> {
    get_valid_scopes(root)
}

fn talos(root: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .arg(format!("--cwd={}", root.display()))
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
// Scopes
// ---------------------------------------------------------------------------

#[test]
fn the_valid_scopes_are_common_plus_every_member_carrying_a_manifest() {
    let (_dir, root) = workspace();

    let scopes = scopes(&root);

    assert!(scopes.contains(&"common".to_string()), "{scopes:?}");
    assert!(scopes.contains(&"user".to_string()), "{scopes:?}");
    assert!(scopes.contains(&"cli".to_string()), "{scopes:?}");
    assert!(
        !scopes.contains(&"scratchpad".to_string()),
        "a directory with no manifest is not a scope: {scopes:?}"
    );
    assert!(
        !scopes.contains(&".hidden".to_string()),
        "{scopes:?}"
    );
}

#[test]
fn a_directory_that_is_not_a_workspace_still_offers_the_common_scope() {
    let dir = tempfile::tempdir().expect("create temp dir");

    assert_eq!(get_valid_scopes(dir.path()), vec!["common".to_string()]);
}

// ---------------------------------------------------------------------------
// The header
// ---------------------------------------------------------------------------

#[test]
fn a_well_formed_message_reports_nothing() {
    let (_dir, root) = workspace();

    assert!(
        lint_commit_message("feat(user): Add the create endpoint", &scopes(&root)).is_empty()
    );
    assert!(
        lint_commit_message(
            "fix(common)!: Repair the loader\n\nThe loader hung on an empty group.",
            &scopes(&root)
        )
        .is_empty(),
        "a breaking marker and a body are both fine"
    );
}

#[test]
fn a_header_that_does_not_follow_the_format_is_reported_on_its_own() {
    let (_dir, root) = workspace();

    let errors = lint_commit_message("just some words", &scopes(&root));

    assert_eq!(errors.len(), 1, "{errors:?}");
    assert!(errors[0].contains("type(scope): Subject"), "{errors:?}");
}

#[test]
fn the_type_must_be_lower_case_and_one_the_convention_knows() {
    let (_dir, root) = workspace();

    let errors = lint_commit_message("Feat(user): Add the endpoint", &scopes(&root));
    assert!(
        errors.iter().any(|error| error.contains("lower-case")),
        "{errors:?}"
    );

    let errors = lint_commit_message("wibble(user): Add the endpoint", &scopes(&root));
    assert!(
        errors.iter().any(|error| error.contains("must be one of")),
        "{errors:?}"
    );
}

#[test]
fn the_scope_must_be_present_lower_case_and_a_member_of_the_workspace() {
    let (_dir, root) = workspace();

    let errors = lint_commit_message("feat: Add the endpoint", &scopes(&root));
    assert!(
        errors.iter().any(|error| error.contains("Scope must not be empty")),
        "{errors:?}"
    );

    let errors = lint_commit_message("feat(User): Add the endpoint", &scopes(&root));
    assert!(
        errors.iter().any(|error| error.contains("must be lower-case")),
        "{errors:?}"
    );

    let errors = lint_commit_message("feat(nowhere): Add the endpoint", &scopes(&root));
    assert!(
        errors.iter().any(|error| error.contains("is not valid")),
        "{errors:?}"
    );
}

#[test]
fn several_scopes_are_each_checked_in_turn() {
    let (_dir, root) = workspace();

    let ok = lint_commit_message("feat(user,cli): Add the endpoint", &scopes(&root));
    assert!(ok.is_empty(), "{ok:?}");

    let errors = lint_commit_message("feat(user,nowhere): Add the endpoint", &scopes(&root));
    assert!(
        errors.iter().any(|error| error.contains("nowhere")),
        "{errors:?}"
    );
}

#[test]
fn the_subject_must_be_present_capitalised_and_unpunctuated() {
    let (_dir, root) = workspace();

    let errors = lint_commit_message("feat(user): add the endpoint.", &scopes(&root));

    assert!(
        errors.iter().any(|error| error.contains("upper-case")),
        "{errors:?}"
    );
    assert!(
        errors.iter().any(|error| error.contains("period")),
        "{errors:?}"
    );
}

#[test]
fn a_header_longer_than_the_limit_is_reported() {
    let (_dir, root) = workspace();
    let long = format!("feat(user): {}", "A".repeat(200));

    let errors = lint_commit_message(&long, &scopes(&root));

    assert!(
        errors.iter().any(|error| error.contains("at most")),
        "{errors:?}"
    );
}

#[test]
fn the_body_must_be_separated_by_a_blank_line_and_wrapped() {
    let (_dir, root) = workspace();

    let errors = lint_commit_message(
        "feat(user): Add the endpoint\nStraight into the body",
        &scopes(&root),
    );
    assert!(
        errors.iter().any(|error| error.contains("blank line")),
        "{errors:?}"
    );

    let errors = lint_commit_message(
        &format!("feat(user): Add the endpoint\n\n{}", "x".repeat(200)),
        &scopes(&root),
    );
    assert!(
        errors.iter().any(|error| error.contains("Body line")),
        "{errors:?}"
    );
}

#[test]
fn the_messages_git_writes_itself_are_left_alone() {
    let (_dir, root) = workspace();

    for header in [
        "Merge branch 'main' into feature",
        "Revert \"feat(user): Add the endpoint\"",
        "fixup! feat(user): Add the endpoint",
        "squash! feat(user): Add the endpoint",
    ] {
        assert!(
            lint_commit_message(header, &scopes(&root)).is_empty(),
            "{header} should be accepted"
        );
    }
}

// ---------------------------------------------------------------------------
// Reading the file git hands over
// ---------------------------------------------------------------------------

#[test]
fn the_comments_git_adds_are_stripped_before_the_message_is_read() {
    let raw = "feat(user): Add the endpoint\n\n# Please enter the commit message\n# with '#' will be ignored.\n";

    assert_eq!(strip_commit_comments(raw), "feat(user): Add the endpoint");
}

#[test]
fn everything_below_the_scissors_line_is_dropped() {
    let raw = "feat(user): Add the endpoint\n# ------------------------ >8 ------------------------\ndiff --git a/x b/x\n+ a change\n";

    assert_eq!(strip_commit_comments(raw), "feat(user): Add the endpoint");
}

#[test]
fn a_message_file_holding_only_comments_is_accepted() {
    let (_dir, root) = workspace();
    let file = root.join("COMMIT_EDITMSG");
    write(&file, "# nothing but comments\n");

    assert!(check_commit_message_file(&file, &root).is_empty());
}

#[test]
fn a_message_file_that_is_not_there_is_reported_rather_than_read() {
    let (_dir, root) = workspace();

    let errors = check_commit_message_file(&root.join("nowhere"), &root);

    assert_eq!(errors.len(), 1);
    assert!(errors[0].contains("Failed to read"), "{errors:?}");
}

// ---------------------------------------------------------------------------
// The commands
// ---------------------------------------------------------------------------

#[test]
fn commitlint_check_accepts_a_well_formed_message() {
    let (_dir, root) = workspace();
    let file = root.join("COMMIT_EDITMSG");
    write(&file, "feat(user): Add the create endpoint\n");

    let output = talos(
        &root,
        &["commitlint:check", &format!("--file={}", file.display())],
    );

    assert!(output.status.success(), "{}", text(&output));
}

#[test]
fn commitlint_check_lists_every_rule_a_bad_message_breaks() {
    let (_dir, root) = workspace();
    let file = root.join("COMMIT_EDITMSG");
    write(&file, "Feat(nowhere): add it.\n");

    let output = talos(
        &root,
        &["commitlint:check", &format!("--file={}", file.display())],
    );

    assert!(!output.status.success());
    let report = text(&output);
    assert!(report.contains("lower-case"), "{report}");
    assert!(report.contains("is not valid"), "{report}");
    assert!(report.contains("period"), "{report}");
}

#[test]
fn commitlint_check_needs_a_file_to_read() {
    let (_dir, root) = workspace();

    let output = talos(&root, &["commitlint:check"]);

    assert!(!output.status.success());
    assert!(text(&output).contains("--file"), "{}", text(&output));
}

#[test]
fn commitlint_init_writes_the_hook_that_calls_the_check() {
    let (_dir, root) = workspace();
    Command::new("git")
        .args(["init", "--initial-branch=main"])
        .current_dir(&root)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .expect("git should run");

    let output = talos(&root, &["commitlint:init"]);

    assert!(output.status.success(), "{}", text(&output));
    let hook = fs::read_to_string(root.join(".git/hooks/commit-msg"))
        .expect("the hook was written");
    assert!(hook.contains("commitlint:check"), "{hook}");
}
