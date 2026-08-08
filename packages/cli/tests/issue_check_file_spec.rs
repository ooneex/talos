//! The file-integrity rules of `issue:check` — the ones that fire before the
//! YAML is ever parsed, plus the shape of the issues directory itself.

use std::fs;
use std::path::{Path, PathBuf};

use cli::commands::issue_check::{CheckOptions, CheckReport, Severity, execute};

const PLANNED: &str = r#"id: "ABC-100000"
module: "user"
title: "Add user create endpoint"
state: "Planned"
priority: "High"
labels:
  - "Feature"
  - "API"
context: |
  Users cannot be created yet.
goal: |
  Expose a create endpoint.
dod: |
  - [ ] The endpoint returns 201 on success
testing: |
  1. [ ] Run `talos workspace:check` — lint, types and tests pass.
dependencies: []
"#;

fn root() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let path = dir.path().to_path_buf();
    (dir, path)
}

fn write_module(root: &Path, name: &str) {
    let dir = root.join("modules").join(name);
    fs::create_dir_all(dir.join("issues")).expect("create issues dir");
    fs::write(
        dir.join(format!("{name}.yml")),
        format!("name: \"{name}\"\ntype: \"module\"\n"),
    )
    .expect("write module descriptor");
}

fn write_issue(root: &Path, module: &str, id: &str, content: &str) -> PathBuf {
    let path = root
        .join("modules")
        .join(module)
        .join("issues")
        .join(format!("{id}.yml"));
    fs::create_dir_all(path.parent().expect("parent")).expect("create issues dir");
    fs::write(&path, content).expect("write issue");
    path
}

fn check(root: &Path) -> CheckReport {
    execute(root, &CheckOptions::default())
}

fn diagnostic<'a>(
    report: &'a CheckReport,
    rule: &str,
) -> Option<&'a cli::commands::issue_check::Diagnostic> {
    report.diagnostics.iter().find(|entry| entry.rule == rule)
}

fn has(report: &CheckReport, rule: &str) -> bool {
    diagnostic(report, rule).is_some()
}

// ---------------------------------------------------------------------------
// Line endings and trailing newline
// ---------------------------------------------------------------------------

#[test]
fn crlf_line_endings_are_a_warning() {
    let (_dir, root) = root();
    write_module(&root, "user");
    write_issue(&root, "user", "ABC-100000", &PLANNED.replace('\n', "\r\n"));

    let report = check(&root);

    let found = diagnostic(&report, "issue.file.crlf").expect("crlf is reported");
    assert_eq!(found.severity, Severity::Warning);
    assert!(found.message.contains("CRLF"));
}

#[test]
fn a_lone_carriage_return_is_an_error() {
    let (_dir, root) = root();
    write_module(&root, "user");
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace("state:", "\rstate:"),
    );

    let report = check(&root);

    let found = diagnostic(&report, "issue.file.carriage-return").expect("lone CR is reported");
    assert_eq!(found.severity, Severity::Error);
}

#[test]
fn a_missing_trailing_newline_is_a_warning() {
    let (_dir, root) = root();
    write_module(&root, "user");
    write_issue(&root, "user", "ABC-100000", PLANNED.trim_end());

    let report = check(&root);

    let found = diagnostic(&report, "issue.file.trailing-newline").expect("reported");
    assert_eq!(found.severity, Severity::Warning);
}

#[test]
fn a_well_formed_file_raises_none_of_the_integrity_rules() {
    let (_dir, root) = root();
    write_module(&root, "user");
    write_issue(&root, "user", "ABC-100000", PLANNED);

    let report = check(&root);

    for rule in [
        "issue.file.crlf",
        "issue.file.carriage-return",
        "issue.file.trailing-newline",
        "issue.file.trailing-whitespace",
        "issue.file.tab-indentation",
        "issue.file.control-character",
    ] {
        assert!(!has(&report, rule), "{rule} should not fire");
    }
}

// ---------------------------------------------------------------------------
// Whitespace and control characters
// ---------------------------------------------------------------------------

#[test]
fn a_tab_in_the_indentation_is_an_error_naming_its_line() {
    let (_dir, root) = root();
    write_module(&root, "user");
    write_issue(
        &root,
        "user",
        "ABC-100000",
        "id: \"ABC-100000\"\nlabels:\n\t- \"Feature\"\n",
    );

    let report = check(&root);

    let found = diagnostic(&report, "issue.file.tab-indentation").expect("reported");
    assert_eq!(found.severity, Severity::Error);
    assert_eq!(found.line, Some(3));
}

#[test]
fn a_control_character_is_an_error_naming_its_codepoint() {
    let (_dir, root) = root();
    write_module(&root, "user");
    write_issue(
        &root,
        "user",
        "ABC-100000",
        "id: \"ABC-100000\"\ntitle: \"Add\u{0007}\"\n",
    );

    let report = check(&root);

    let found = diagnostic(&report, "issue.file.control-character").expect("reported");
    assert_eq!(found.severity, Severity::Error);
    assert!(found.message.contains("U+0007"));
    assert_eq!(found.line, Some(2));
}

#[test]
fn trailing_whitespace_is_reported_once_from_its_first_line() {
    let (_dir, root) = root();
    write_module(&root, "user");
    write_issue(
        &root,
        "user",
        "ABC-100000",
        "id: \"ABC-100000\"   \ntitle: \"Add\"  \nstate: \"Todo\"\n",
    );

    let report = check(&root);

    let found = diagnostic(&report, "issue.file.trailing-whitespace").expect("reported");
    assert_eq!(found.severity, Severity::Warning);
    assert_eq!(found.line, Some(1));
    assert!(found.message.contains("2 lines"));
}

#[test]
fn one_line_of_trailing_whitespace_is_counted_in_the_singular() {
    let (_dir, root) = root();
    write_module(&root, "user");
    write_issue(
        &root,
        "user",
        "ABC-100000",
        "id: \"ABC-100000\"\ntitle: \"Add\"  \n",
    );

    let report = check(&root);

    let found = diagnostic(&report, "issue.file.trailing-whitespace").expect("reported");
    assert!(found.message.contains("1 line end"));
}

// ---------------------------------------------------------------------------
// The issues directory
// ---------------------------------------------------------------------------

#[test]
fn a_nested_directory_inside_issues_is_an_error() {
    let (_dir, root) = root();
    write_module(&root, "user");
    write_issue(&root, "user", "ABC-100000", PLANNED);
    fs::create_dir_all(root.join("modules/user/issues/archive")).expect("create nested dir");

    let report = check(&root);

    let found = diagnostic(&report, "issue.directory.nested").expect("reported");
    assert_eq!(found.severity, Severity::Error);
}

#[test]
fn a_dotfile_inside_issues_is_ignored() {
    let (_dir, root) = root();
    write_module(&root, "user");
    write_issue(&root, "user", "ABC-100000", PLANNED);
    fs::write(root.join("modules/user/issues/.DS_Store"), "").expect("write");

    let report = check(&root);

    assert!(!has(&report, "issue.directory.nested"));
    assert_eq!(report.files, 1);
}
