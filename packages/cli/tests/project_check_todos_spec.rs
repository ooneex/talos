//! The todos check — issue-bearing markers, and whether the issue they name
//! still exists and is still open.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use cli::commands::project_check::todos::{Marker, inspect, issues, markers, run, state_of};
use cli::commands::project_check::{CheckId, CheckStatus, ProjectCheckArgs};

fn write(path: &Path, content: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create parent directory");
    }
    fs::write(path, content).expect("write file");
}

/// The scan skips any path holding an excluded directory name, and the system
/// temp dir on macOS lives under `/var` — which is one of them. Scratch
/// workspaces therefore go beside the crate, where nothing is filtered out.
fn scratch() -> tempfile::TempDir {
    tempfile::Builder::new()
        .prefix("talos-todos-")
        .tempdir_in(env!("CARGO_MANIFEST_DIR"))
        .expect("create temp dir")
}

fn workspace() -> (tempfile::TempDir, PathBuf) {
    let dir = scratch();
    let root = dir.path().to_path_buf();
    let user = root.join("modules/user");
    write(&user.join("user.yml"), "name: \"user\"\ntype: \"module\"\n");
    (dir, root)
}

fn args(root: &Path) -> ProjectCheckArgs {
    ProjectCheckArgs {
        cwd: Some(root.to_string_lossy().to_string()),
        no_cache: true,
        ..Default::default()
    }
}

// ---------------------------------------------------------------------------
// markers
// ---------------------------------------------------------------------------

#[test]
fn markers_finds_every_allowed_marker_form() {
    let content = "// TODO(OON-123456) parenthesised\n\
                   // FIXME[OON-2]: bracketed\n\
                   // HACK (OON-3) spaced\n\
                   // XXX(ABC-4) another kind\n";

    let found = markers(content, "src/a.ts");

    assert_eq!(
        found.iter().map(|m| m.kind.as_str()).collect::<Vec<_>>(),
        ["TODO", "FIXME", "HACK", "XXX"]
    );
    assert_eq!(
        found.iter().map(|m| m.issue.as_str()).collect::<Vec<_>>(),
        ["OON-123456", "OON-2", "OON-3", "ABC-4"]
    );
}

#[test]
fn markers_records_the_file_and_one_based_line() {
    let found = markers("first\nsecond\n// TODO(OON-1) here\n", "src/a.ts");

    assert_eq!(
        found,
        vec![Marker {
            kind: "TODO".to_string(),
            issue: "OON-1".to_string(),
            file: "src/a.ts".to_string(),
            line: 3,
        }]
    );
}

#[test]
fn markers_finds_several_markers_on_one_line() {
    let found = markers("// TODO(OON-1) and FIXME(OON-2)\n", "src/a.ts");

    assert_eq!(found.len(), 2);
    assert_eq!(found[0].line, 1);
    assert_eq!(found[1].line, 1);
}

#[test]
fn markers_ignores_a_bare_marker_naming_no_issue() {
    // A bare TODO is the hygiene check's business, not this one's.
    assert!(markers("// TODO clean this up\n", "src/a.ts").is_empty());
    assert!(markers("// TODO() empty\n", "src/a.ts").is_empty());
    assert!(markers("// TODO(not-an-id) lowercase\n", "src/a.ts").is_empty());
}

#[test]
fn markers_ignores_a_word_that_merely_contains_a_marker() {
    assert!(markers("// MASTODON(OON-1)\n", "src/a.ts").is_empty());
}

// ---------------------------------------------------------------------------
// state_of
// ---------------------------------------------------------------------------

#[test]
fn state_of_reads_the_declared_state() {
    let (_dir, root) = workspace();
    let path = root.join("issue.yml");
    write(&path, "id: \"OON-1\"\nstate: \"Todo\"\n");

    assert_eq!(state_of(&path), Some("Todo".to_string()));
}

#[test]
fn state_of_strips_quotes_and_trailing_comments() {
    let (_dir, root) = workspace();
    let path = root.join("issue.yml");
    write(&path, "state: 'Done' # closed last week\n");

    assert_eq!(state_of(&path), Some("Done".to_string()));
}

#[test]
fn state_of_is_none_when_the_file_declares_no_state_or_is_missing() {
    let (_dir, root) = workspace();
    let path = root.join("issue.yml");
    write(&path, "id: \"OON-1\"\n");

    assert_eq!(state_of(&path), None);
    assert_eq!(state_of(&root.join("nope.yml")), None);
}

// ---------------------------------------------------------------------------
// issues
// ---------------------------------------------------------------------------

#[test]
fn issues_collects_every_issue_across_modules_and_packages() {
    let (_dir, root) = workspace();
    write(
        &root.join("modules/user/issues/OON-1.yml"),
        "state: \"Todo\"\n",
    );
    write(
        &root.join("packages/core/issues/OON-2.yml"),
        "state: \"Done\"\n",
    );

    let found = issues(&root);

    assert_eq!(found.get("OON-1"), Some(&Some("Todo".to_string())));
    assert_eq!(found.get("OON-2"), Some(&Some("Done".to_string())));
}

#[test]
fn issues_records_an_issue_that_declares_no_state() {
    let (_dir, root) = workspace();
    write(
        &root.join("modules/user/issues/OON-1.yml"),
        "id: \"OON-1\"\n",
    );

    assert_eq!(issues(&root).get("OON-1"), Some(&None));
}

#[test]
fn issues_ignores_non_yaml_files_and_modules_without_an_issues_directory() {
    let (_dir, root) = workspace();
    write(&root.join("modules/user/issues/README.md"), "notes\n");
    write(&root.join("modules/web/web.yml"), "name: \"web\"\n");

    assert!(issues(&root).is_empty());
}

#[test]
fn issues_is_empty_when_the_workspace_has_no_module_groups() {
    let dir = scratch();

    assert!(issues(dir.path()).is_empty());
}

// ---------------------------------------------------------------------------
// inspect
// ---------------------------------------------------------------------------

fn marker(issue: &str) -> Marker {
    Marker {
        kind: "TODO".to_string(),
        issue: issue.to_string(),
        file: "src/a.ts".to_string(),
        line: 7,
    }
}

#[test]
fn inspect_accepts_a_marker_naming_an_open_issue() {
    let known = BTreeMap::from([("OON-1".to_string(), Some("Todo".to_string()))]);
    let (mut errors, mut warnings) = (Vec::new(), Vec::new());

    inspect(&[marker("OON-1")], &known, &mut errors, &mut warnings);

    assert!(errors.is_empty());
    assert!(warnings.is_empty());
}

#[test]
fn inspect_reports_an_unknown_issue_as_an_error() {
    let (mut errors, mut warnings) = (Vec::new(), Vec::new());

    inspect(
        &[marker("OON-9")],
        &BTreeMap::new(),
        &mut errors,
        &mut warnings,
    );

    assert_eq!(errors.len(), 1);
    assert!(errors[0].starts_with("src/a.ts:7: TODO(OON-9) names an issue"));
    assert!(warnings.is_empty());
}

#[test]
fn inspect_warns_when_the_issue_declares_no_state() {
    let known = BTreeMap::from([("OON-1".to_string(), None)]);
    let (mut errors, mut warnings) = (Vec::new(), Vec::new());

    inspect(&[marker("OON-1")], &known, &mut errors, &mut warnings);

    assert!(errors.is_empty());
    assert_eq!(warnings, ["src/a.ts:7: OON-1 declares no state"]);
}

#[test]
fn inspect_warns_when_the_marker_outlived_a_closed_issue() {
    for state in ["Done", "Canceled"] {
        let known = BTreeMap::from([("OON-1".to_string(), Some(state.to_string()))]);
        let (mut errors, mut warnings) = (Vec::new(), Vec::new());

        inspect(&[marker("OON-1")], &known, &mut errors, &mut warnings);

        assert!(errors.is_empty());
        assert_eq!(warnings.len(), 1, "{state} should warn");
        assert!(warnings[0].contains(&format!("the issue is {state}")));
    }
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

#[test]
fn run_skips_when_no_source_carries_a_marker() {
    let (_dir, root) = workspace();
    write(&root.join("modules/user/src/a.ts"), "export const a = 1;\n");

    let outcome = run(&args(&root), &root);

    assert_eq!(outcome.id, CheckId::Todos);
    assert_eq!(outcome.status, CheckStatus::Skipped);
    assert!(outcome.summary.contains("no issue-bearing marker"));
}

#[test]
fn run_passes_when_every_marker_names_an_open_issue() {
    let (_dir, root) = workspace();
    write(
        &root.join("modules/user/src/a.ts"),
        "// TODO(OON-1) later\nexport const a = 1;\n",
    );
    write(
        &root.join("modules/user/issues/OON-1.yml"),
        "state: \"Todo\"\n",
    );

    let outcome = run(&args(&root), &root);

    assert_eq!(outcome.status, CheckStatus::Passed);
    assert_eq!(
        outcome.summary,
        "1 marker · every marker names an open issue"
    );
}

#[test]
fn run_fails_on_a_marker_naming_an_unknown_issue() {
    let (_dir, root) = workspace();
    write(
        &root.join("modules/user/src/a.ts"),
        "// TODO(OON-404) later\n// FIXME(OON-405) later\n",
    );

    let outcome = run(&args(&root), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(outcome.summary.starts_with("2 markers"));
    assert_eq!(outcome.details.len(), 2);
    assert!(!outcome.hints.is_empty());
}

#[test]
fn run_warns_on_a_marker_left_behind_by_a_closed_issue() {
    let (_dir, root) = workspace();
    write(
        &root.join("modules/user/src/a.ts"),
        "// TODO(OON-1) later\n",
    );
    write(
        &root.join("modules/user/issues/OON-1.yml"),
        "state: \"Done\"\n",
    );

    let outcome = run(&args(&root), &root);

    assert_eq!(outcome.status, CheckStatus::Warned);
}

#[test]
fn run_ignores_markers_inside_issue_files_and_excluded_directories() {
    let (_dir, root) = workspace();
    // An issue file names its own id on every line — it is not a marker.
    write(
        &root.join("modules/user/issues/OON-1.yml"),
        "state: \"Todo\"\ncontext: \"TODO(OON-1) is tracked here\"\n",
    );
    write(
        &root.join("modules/user/node_modules/dep/index.ts"),
        "// TODO(OON-404) vendored\n",
    );

    let outcome = run(&args(&root), &root);

    assert_eq!(outcome.status, CheckStatus::Skipped);
}
