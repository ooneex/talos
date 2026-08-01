//! The `issue:check` rules the base spec does not reach: the branch and pull
//! request fields, the dependency graph, comments, `spec`, `resources`, the
//! testing checklist, and the two reports the command prints.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

use cli::commands::issue_check::{CheckOptions, CheckReport, Severity, execute};

/// A planned issue with every required section filled in, used as the base for
/// the variations each test needs.
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
  1. [ ] Run `talos monorepo:check` — lint, types and tests pass.
dependencies: []
"#;

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("a parent")).expect("create parent");
    fs::write(path, content).expect("write file");
}

fn workspace() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().to_path_buf();
    write(&root.join("modules/user/user.yml"), "type: \"module\"\n");
    fs::create_dir_all(root.join("modules/user/issues")).expect("create issues dir");
    (dir, root)
}

fn write_issue(root: &Path, id: &str, content: &str) {
    write(
        &root.join("modules/user/issues").join(format!("{id}.yml")),
        content,
    );
}

/// The base issue with `state` replaced and the given lines appended.
fn issue(state: &str, extra: &str) -> String {
    format!(
        "{}{extra}",
        PLANNED.replace("state: \"Planned\"", &format!("state: \"{state}\""))
    )
}

fn check(root: &Path) -> CheckReport {
    execute(
        root,
        &CheckOptions {
            modules: Vec::new(),
            ids: Vec::new(),
        },
    )
}

fn rules(report: &CheckReport) -> Vec<&'static str> {
    report.diagnostics.iter().map(|d| d.rule).collect()
}

fn severity_of(report: &CheckReport, rule: &str) -> Option<Severity> {
    report
        .diagnostics
        .iter()
        .find(|d| d.rule == rule)
        .map(|d| d.severity)
}

// ---------------------------------------------------------------------------
// branch
// ---------------------------------------------------------------------------

#[test]
fn a_branch_is_required_once_the_issue_reaches_review_and_only_advised_when_done() {
    let (_dir, root) = workspace();

    write_issue(&root, "ABC-100000", &implemented("In Review", ""));
    assert_eq!(
        severity_of(&check(&root), "issue.branch.missing"),
        Some(Severity::Error)
    );

    write_issue(&root, "ABC-100000", &implemented("Done", ""));
    assert_eq!(
        severity_of(&check(&root), "issue.branch.missing"),
        Some(Severity::Warning),
        "a done issue only loses traceability"
    );

    write_issue(&root, "ABC-100000", PLANNED);
    assert!(
        !rules(&check(&root)).contains(&"issue.branch.missing"),
        "a planned issue has no branch yet"
    );
}

#[test]
fn a_branch_must_be_typed_named_after_the_issue_and_slugged_in_kebab_case() {
    let (_dir, root) = workspace();

    let cases = [
        ("no-slash", "issue.branch.format"),
        ("nope/ABC-100000-add-users", "issue.branch.type-invalid"),
        ("feat/XYZ-999999-add-users", "issue.branch.id-mismatch"),
        ("feat/ABC-100000-Add_Users", "issue.branch.slug"),
        ("fix/ABC-100000-add-users", "issue.branch.type-mismatch"),
    ];

    for (branch, rule) in cases {
        write_issue(
            &root,
            "ABC-100000",
            &issue("Planned", &format!("branch: \"{branch}\"\n")),
        );
        assert!(
            rules(&check(&root)).contains(&rule),
            "{branch} should trip {rule}, got {:?}",
            rules(&check(&root))
        );
    }
}

#[test]
fn a_branch_matching_the_change_type_label_passes_every_branch_rule() {
    let (_dir, root) = workspace();

    write_issue(
        &root,
        "ABC-100000",
        &issue("Planned", "branch: \"feat/ABC-100000-add-users\"\n"),
    );

    let reported = rules(&check(&root));
    assert!(
        !reported.iter().any(|rule| rule.starts_with("issue.branch")),
        "{reported:?}"
    );
}

#[test]
fn a_branch_that_is_not_a_string_is_rejected_before_it_is_parsed() {
    let (_dir, root) = workspace();

    write_issue(&root, "ABC-100000", &issue("Planned", "branch: 42\n"));

    assert!(rules(&check(&root)).contains(&"issue.branch.type"));
}

#[test]
fn two_issues_cannot_claim_the_same_branch() {
    let (_dir, root) = workspace();
    write_issue(
        &root,
        "ABC-100000",
        &issue("Planned", "branch: \"feat/ABC-100000-add-users\"\n"),
    );
    write_issue(
        &root,
        "ABC-100001",
        &issue("Planned", "branch: \"feat/ABC-100000-add-users\"\n")
            .replace("ABC-100000\"", "ABC-100001\""),
    );

    assert!(rules(&check(&root)).contains(&"issue.branch.duplicate"));
}

// ---------------------------------------------------------------------------
// pr
// ---------------------------------------------------------------------------

#[test]
fn a_pull_request_link_is_required_to_merge_and_advised_in_review() {
    let (_dir, root) = workspace();

    write_issue(&root, "ABC-100000", &implemented("To Merge", ""));
    assert_eq!(
        severity_of(&check(&root), "issue.pr.missing"),
        Some(Severity::Error)
    );

    write_issue(&root, "ABC-100000", &implemented("In Review", ""));
    assert_eq!(
        severity_of(&check(&root), "issue.pr.missing"),
        Some(Severity::Warning)
    );

    write_issue(&root, "ABC-100000", PLANNED);
    assert!(!rules(&check(&root)).contains(&"issue.pr.missing"));
}

#[test]
fn a_pull_request_link_must_point_at_a_numbered_pull_request() {
    let (_dir, root) = workspace();

    for url in [
        "not-a-url",
        "https://github.com/org/repo/issues/12",
        "https://github.com/org/repo/pull/",
        "https://github.com/org/repo/pull/abc",
    ] {
        write_issue(
            &root,
            "ABC-100000",
            &issue("Planned", &format!("pr: \"{url}\"\n")),
        );
        assert!(
            rules(&check(&root)).contains(&"issue.pr.format"),
            "{url} should be refused"
        );
    }

    for url in [
        "https://github.com/org/repo/pull/12",
        "https://gitlab.com/org/repo/-/merge_requests/7",
        "https://bitbucket.org/org/repo/pull-requests/3",
    ] {
        write_issue(
            &root,
            "ABC-100000",
            &issue("Planned", &format!("pr: \"{url}\"\n")),
        );
        assert!(
            !rules(&check(&root)).contains(&"issue.pr.format"),
            "{url} should be accepted"
        );
    }
}

#[test]
fn a_pull_request_field_that_is_not_a_string_is_rejected() {
    let (_dir, root) = workspace();

    write_issue(&root, "ABC-100000", &issue("Planned", "pr: []\n"));

    assert!(rules(&check(&root)).contains(&"issue.pr.type"));
}

// ---------------------------------------------------------------------------
// dependencies
// ---------------------------------------------------------------------------

#[test]
fn a_dependency_must_name_another_issue_that_exists_exactly_once() {
    let (_dir, root) = workspace();

    let cases = [
        ("dependencies:\n  - 42\n", "issue.dependencies.type"),
        ("dependencies: \"ABC-100001\"\n", "issue.dependencies.type"),
        ("dependencies:\n", "issue.dependencies.type"),
        ("dependencies:\n  - \"nope\"\n", "issue.dependencies.format"),
        (
            "dependencies:\n  - \"ABC-100000\"\n",
            "issue.dependencies.self",
        ),
        (
            "dependencies:\n  - \"ABC-999999\"\n",
            "issue.dependencies.unknown",
        ),
    ];

    for (fragment, rule) in cases {
        write_issue(
            &root,
            "ABC-100000",
            &PLANNED.replace("dependencies: []\n", fragment),
        );
        assert!(
            rules(&check(&root)).contains(&rule),
            "{fragment:?} should trip {rule}, got {:?}",
            rules(&check(&root))
        );
    }
}

#[test]
fn listing_the_same_dependency_twice_is_rejected() {
    let (_dir, root) = workspace();
    write_issue(
        &root,
        "ABC-100001",
        &PLANNED.replace("ABC-100000", "ABC-100001"),
    );
    write_issue(
        &root,
        "ABC-100000",
        &PLANNED.replace(
            "dependencies: []\n",
            "dependencies:\n  - \"ABC-100001\"\n  - \"ABC-100001\"\n",
        ),
    );

    assert!(rules(&check(&root)).contains(&"issue.dependencies.duplicate"));
}

#[test]
fn a_planned_issue_with_no_dependencies_field_is_asked_to_say_so() {
    let (_dir, root) = workspace();

    write_issue(
        &root,
        "ABC-100000",
        &PLANNED.replace("dependencies: []\n", ""),
    );

    assert_eq!(
        severity_of(&check(&root), "issue.dependencies.missing"),
        Some(Severity::Warning)
    );
}

#[test]
fn a_cycle_across_three_issues_is_reported_once_with_the_path_it_follows() {
    let (_dir, root) = workspace();
    let ids = ["ABC-100000", "ABC-100001", "ABC-100002"];
    for (index, id) in ids.iter().enumerate() {
        let next = ids[(index + 1) % ids.len()];
        write_issue(
            &root,
            id,
            &PLANNED.replace("ABC-100000", id).replace(
                "dependencies: []\n",
                &format!("dependencies:\n  - \"{next}\"\n"),
            ),
        );
    }

    let report = check(&root);
    let cycles: Vec<_> = report
        .diagnostics
        .iter()
        .filter(|d| d.rule == "issue.dependencies.cycle")
        .collect();
    assert_eq!(
        cycles.len(),
        ids.len(),
        "every issue in the cycle is told about it: {cycles:?}"
    );
    assert!(
        cycles
            .iter()
            .all(|d| d.message
                == "Dependency cycle: ABC-100000 → ABC-100001 → ABC-100002 → ABC-100000"),
        "they all name the same path: {cycles:?}"
    );
}

// ---------------------------------------------------------------------------
// comments, spec and resources
// ---------------------------------------------------------------------------

#[test]
fn every_comment_needs_a_message_and_may_only_carry_an_author_beside_it() {
    let (_dir, root) = workspace();

    let cases = [
        ("comments: \"hi\"\n", "issue.comments.type"),
        ("comments:\n  - \"hi\"\n", "issue.comments.type"),
        ("comments:\n  - author: \"me\"\n", "issue.comments.message"),
        (
            "comments:\n  - message: \"   \"\n",
            "issue.comments.message",
        ),
        ("comments:\n  - message: 42\n", "issue.comments.message"),
        (
            "comments:\n  - message: \"hi\"\n    author: 42\n",
            "issue.comments.author",
        ),
        (
            "comments:\n  - message: \"hi\"\n    mood: \"happy\"\n",
            "issue.comments.unknown-field",
        ),
    ];

    for (fragment, rule) in cases {
        write_issue(&root, "ABC-100000", &issue("Planned", fragment));
        assert!(
            rules(&check(&root)).contains(&rule),
            "{fragment:?} should trip {rule}, got {:?}",
            rules(&check(&root))
        );
    }

    write_issue(
        &root,
        "ABC-100000",
        &issue(
            "Planned",
            "comments:\n  - author: \"me\"\n    message: \"hi\"\n",
        ),
    );
    assert!(
        !rules(&check(&root))
            .iter()
            .any(|rule| rule.starts_with("issue.comments")),
        "a well-formed comment passes"
    );
}

#[test]
fn the_spec_block_checks_its_name_entity_roles_and_permissions() {
    let (_dir, root) = workspace();

    let cases = [
        ("spec: \"nope\"\n", "issue.spec.type"),
        ("spec:\n  colour: \"red\"\n", "issue.spec.unknown-field"),
        ("spec:\n  name: 42\n", "issue.spec.name"),
        ("spec:\n  name: \"create\"\n", "issue.spec.name"),
        ("spec:\n  entity: \"  \"\n", "issue.spec.entity"),
        ("spec:\n  roles: \"admin\"\n", "issue.spec.roles"),
        ("spec:\n  roles:\n    - \"\"\n", "issue.spec.roles"),
        (
            "spec:\n  permissions: \"user:create\"\n",
            "issue.spec.permissions",
        ),
        (
            "spec:\n  permissions:\n    - \"user:create\"\n",
            "issue.spec.permissions",
        ),
        (
            "spec:\n  permissions:\n    - name: \"usercreate\"\n",
            "issue.spec.permissions",
        ),
    ];

    for (fragment, rule) in cases {
        write_issue(&root, "ABC-100000", &issue("Planned", fragment));
        assert!(
            rules(&check(&root)).contains(&rule),
            "{fragment:?} should trip {rule}, got {:?}",
            rules(&check(&root))
        );
    }

    write_issue(
        &root,
        "ABC-100000",
        &issue(
            "Planned",
            "spec:\n  name: \"user.create\"\n  entity: \"User\"\n  roles:\n    - \"admin\"\n  permissions:\n    - name: \"user:create\"\n",
        ),
    );
    assert!(
        !rules(&check(&root))
            .iter()
            .any(|rule| rule.starts_with("issue.spec")),
        "a well-formed spec passes"
    );
}

#[test]
fn resources_map_a_name_to_a_string_or_a_list_of_strings() {
    let (_dir, root) = workspace();

    for fragment in [
        "resources: \"nope\"\n",
        "resources:\n  design: 42\n",
        "resources:\n  design:\n    - 42\n",
    ] {
        write_issue(&root, "ABC-100000", &issue("Planned", fragment));
        assert!(
            rules(&check(&root)).contains(&"issue.resources.type"),
            "{fragment:?} should be refused"
        );
    }

    write_issue(
        &root,
        "ABC-100000",
        &issue(
            "Planned",
            "resources:\n  design: \"https://figma.com/x\"\n  docs:\n    - \"https://example.com\"\n",
        ),
    );
    assert!(
        !rules(&check(&root)).contains(&"issue.resources.type"),
        "well-formed resources pass"
    );
}

// ---------------------------------------------------------------------------
// testing
// ---------------------------------------------------------------------------

#[test]
fn testing_steps_must_be_numbered_checkboxes_in_order() {
    let (_dir, root) = workspace();

    write_issue(
        &root,
        "ABC-100000",
        &PLANNED.replace(
            "  1. [ ] Run `talos monorepo:check` — lint, types and tests pass.\n",
            "  - [ ] Not a numbered step\n",
        ),
    );
    let reported = rules(&check(&root));
    assert!(reported.contains(&"issue.testing.format"));
    assert!(
        reported.contains(&"issue.testing.empty"),
        "a line that is not a step leaves the checklist with none: {reported:?}"
    );

    write_issue(
        &root,
        "ABC-100000",
        &PLANNED.replace(
            "  1. [ ] Run `talos monorepo:check` — lint, types and tests pass.\n",
            "  1. [ ] First step\n  3. [ ] Third step\n",
        ),
    );
    assert!(rules(&check(&root)).contains(&"issue.testing.numbering"));
}

#[test]
fn an_implemented_issue_cannot_leave_a_testing_step_unchecked() {
    let (_dir, root) = workspace();

    write_issue(&root, "ABC-100000", &implemented("Done", ""));

    let report = check(&root);
    assert!(
        !rules(&report).contains(&"issue.testing.unchecked"),
        "the ticked checklist passes: {:?}",
        rules(&report)
    );

    write_issue(
        &root,
        "ABC-100000",
        &implemented("Done", "").replace("1. [x]", "1. [ ]"),
    );
    assert!(rules(&check(&root)).contains(&"issue.testing.unchecked"));
}

#[test]
fn an_indented_line_continues_the_step_above_it() {
    let (_dir, root) = workspace();

    write_issue(
        &root,
        "ABC-100000",
        &PLANNED.replace(
            "  1. [ ] Run `talos monorepo:check` — lint, types and tests pass.\n",
            "  1. [ ] Run the suite\n     with the module flag set.\n",
        ),
    );

    assert!(
        !rules(&check(&root)).contains(&"issue.testing.format"),
        "the continuation is not read as its own step"
    );
}

// ---------------------------------------------------------------------------
// The reports
// ---------------------------------------------------------------------------

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

#[test]
fn the_human_report_names_the_file_the_rule_and_the_message() {
    let (_dir, root) = workspace();
    write_issue(&root, "ABC-100000", &issue("Planned", "pr: \"nope\"\n"));

    let output = talos(&root, &["issue:check"]);

    let report = text(&output);
    assert!(report.contains("ABC-100000.yml"), "{report}");
    assert!(report.contains("issue.pr.format"), "{report}");
    assert!(!output.status.success(), "an error ends the run non-zero");
}

#[test]
fn the_json_report_carries_every_diagnostic_as_data() {
    let (_dir, root) = workspace();
    write_issue(&root, "ABC-100000", &issue("Planned", "pr: \"nope\"\n"));

    let output = talos(&root, &["issue:check", "--json"]);

    let payload: serde_json::Value = serde_json::from_str(&String::from_utf8_lossy(&output.stdout))
        .expect("the report is valid JSON");
    let diagnostics = payload["diagnostics"]
        .as_array()
        .expect("diagnostics is an array");
    assert!(
        diagnostics
            .iter()
            .any(|entry| entry["rule"] == "issue.pr.format"),
        "{payload}"
    );
}

#[test]
fn strict_turns_a_warning_only_run_into_a_failure() {
    let (_dir, root) = workspace();
    write_issue(&root, "ABC-100000", &implemented("Done", ""));

    let lenient = talos(&root, &["issue:check"]);
    let strict = talos(&root, &["issue:check", "--strict"]);

    assert!(lenient.status.success(), "{}", text(&lenient));
    assert!(!strict.status.success(), "{}", text(&strict));
}

#[test]
fn a_project_with_no_issue_at_all_passes() {
    let dir = tempfile::tempdir().expect("create temp dir");

    let output = talos(dir.path(), &["issue:check"]);

    assert!(output.status.success(), "{}", text(&output));
}

#[test]
fn restricting_the_run_to_one_id_reports_only_that_issue() {
    let (_dir, root) = workspace();
    write_issue(&root, "ABC-100000", &issue("Planned", "pr: \"nope\"\n"));
    write_issue(
        &root,
        "ABC-100001",
        &issue("Planned", "pr: \"also-nope\"\n").replace("ABC-100000\"", "ABC-100001\""),
    );

    let report = execute(
        &root,
        &CheckOptions {
            modules: vec!["user".to_string()],
            ids: vec!["ABC-100000".to_string()],
        },
    );

    assert!(
        report
            .diagnostics
            .iter()
            .all(|d| d.issue == "ABC-100000" || d.issue.is_empty()),
        "{:?}",
        report.diagnostics
    );
}

/// The base issue advanced to a state that requires the work to be finished:
/// every checklist ticked, plus a branch and a pull request.
fn implemented(state: &str, extra: &str) -> String {
    let mut content = PLANNED
        .replace("state: \"Planned\"", &format!("state: \"{state}\""))
        .replace("- [ ]", "- [x]")
        .replace("1. [ ]", "1. [x]");
    content.push_str(extra);
    content
}

// ---------------------------------------------------------------------------
// identity, title, state, priority and labels
// ---------------------------------------------------------------------------

#[test]
fn the_id_and_the_module_must_both_be_strings_that_match_where_the_file_lives() {
    let (_dir, root) = workspace();

    let cases = [
        (
            PLANNED.replace("id: \"ABC-100000\"\n", ""),
            "issue.id.missing",
        ),
        (
            PLANNED.replace("id: \"ABC-100000\"", "id: 42"),
            "issue.id.type",
        ),
        (
            PLANNED.replace("id: \"ABC-100000\"", "id: \"not an id\""),
            "issue.id.format",
        ),
        (
            PLANNED.replace("module: \"user\"\n", ""),
            "issue.module.missing",
        ),
        (
            PLANNED.replace("module: \"user\"", "module: 42"),
            "issue.module.type",
        ),
        (
            PLANNED.replace("module: \"user\"", "module: \"order\""),
            "issue.module.mismatch",
        ),
    ];

    for (content, rule) in cases {
        write_issue(&root, "ABC-100000", &content);
        assert!(
            rules(&check(&root)).contains(&rule),
            "{rule} should have fired, got {:?}",
            rules(&check(&root))
        );
    }
}

#[test]
fn an_id_that_does_not_match_the_file_name_is_rejected() {
    let (_dir, root) = workspace();
    write_issue(&root, "ABC-100001", PLANNED);

    assert!(rules(&check(&root)).contains(&"issue.id.filename-mismatch"));
}

#[test]
fn the_title_must_be_a_single_capitalised_line_without_a_full_stop() {
    let (_dir, root) = workspace();

    let cases = [
        (
            PLANNED.replace("title: \"Add user create endpoint\"\n", ""),
            "issue.title.missing",
        ),
        (
            PLANNED.replace("title: \"Add user create endpoint\"", "title: 42"),
            "issue.title.type",
        ),
        (
            PLANNED.replace("title: \"Add user create endpoint\"", "title: \"   \""),
            "issue.title.empty",
        ),
        (
            PLANNED.replace("title: \"Add user create endpoint\"", "title: \" Add it \""),
            "issue.title.whitespace",
        ),
        (
            PLANNED.replace("title: \"Add user create endpoint\"", "title: \"Add it.\""),
            "issue.title.punctuation",
        ),
        (
            PLANNED.replace("title: \"Add user create endpoint\"", "title: \"add it\""),
            "issue.title.capitalization",
        ),
        (
            PLANNED.replace(
                "title: \"Add user create endpoint\"",
                &format!("title: \"{}\"", "A".repeat(120)),
            ),
            "issue.title.length",
        ),
    ];

    for (content, rule) in cases {
        write_issue(&root, "ABC-100000", &content);
        assert!(
            rules(&check(&root)).contains(&rule),
            "{rule} should have fired, got {:?}",
            rules(&check(&root))
        );
    }
}

#[test]
fn the_state_and_the_priority_must_come_from_their_vocabularies() {
    let (_dir, root) = workspace();

    let cases = [
        (
            PLANNED.replace("state: \"Planned\"\n", ""),
            "issue.state.missing",
        ),
        (
            PLANNED.replace("state: \"Planned\"", "state: 42"),
            "issue.state.type",
        ),
        (
            PLANNED.replace("state: \"Planned\"", "state: \"Nowhere\""),
            "issue.state.invalid",
        ),
        (
            PLANNED.replace("priority: \"High\"\n", ""),
            "issue.priority.missing",
        ),
        (
            PLANNED.replace("priority: \"High\"", "priority: 42"),
            "issue.priority.type",
        ),
        (
            PLANNED.replace("priority: \"High\"", "priority: \"Enormous\""),
            "issue.priority.invalid",
        ),
    ];

    for (content, rule) in cases {
        write_issue(&root, "ABC-100000", &content);
        assert!(
            rules(&check(&root)).contains(&rule),
            "{rule} should have fired, got {:?}",
            rules(&check(&root))
        );
    }
}

#[test]
fn a_state_or_priority_in_the_wrong_case_is_told_which_one_was_meant() {
    let (_dir, root) = workspace();
    write_issue(
        &root,
        "ABC-100000",
        &PLANNED.replace("state: \"Planned\"", "state: \"planned\""),
    );

    let report = check(&root);
    let message = report
        .diagnostics
        .iter()
        .find(|d| d.rule == "issue.state.invalid")
        .map(|d| d.message.clone())
        .expect("the state was rejected");

    assert!(message.contains("did you mean `Planned`"), "{message}");
}

#[test]
fn the_labels_must_be_a_list_from_the_vocabulary_with_the_change_type_first() {
    let (_dir, root) = workspace();

    let cases = [
        (
            PLANNED.replace("labels:\n  - \"Feature\"\n  - \"API\"\n", ""),
            "issue.labels.missing",
        ),
        (
            PLANNED.replace(
                "labels:\n  - \"Feature\"\n  - \"API\"\n",
                "labels: \"Feature\"\n",
            ),
            "issue.labels.type",
        ),
        (
            PLANNED.replace("labels:\n  - \"Feature\"\n  - \"API\"\n", "labels: []\n"),
            "issue.labels.empty",
        ),
        (
            PLANNED.replace("  - \"API\"\n", "  - 42\n"),
            "issue.labels.type",
        ),
        (
            PLANNED.replace("  - \"API\"\n", "  - \"\"\n"),
            "issue.labels.empty-entry",
        ),
        (
            PLANNED.replace("  - \"API\"\n", "  - \"Feature\"\n"),
            "issue.labels.duplicate",
        ),
        (
            PLANNED.replace("  - \"API\"\n", "  - \"Nonsense\"\n"),
            "issue.labels.unknown",
        ),
        (
            PLANNED.replace("  - \"Feature\"\n  - \"API\"\n", "  - \"API\"\n"),
            "issue.labels.change-type-missing",
        ),
        (
            PLANNED.replace(
                "  - \"Feature\"\n  - \"API\"\n",
                "  - \"API\"\n  - \"Feature\"\n",
            ),
            "issue.labels.change-type-first",
        ),
    ];

    for (content, rule) in cases {
        write_issue(&root, "ABC-100000", &content);
        assert!(
            rules(&check(&root)).contains(&rule),
            "{rule} should have fired, got {:?}",
            rules(&check(&root))
        );
    }
}

// ---------------------------------------------------------------------------
// goal and dod
// ---------------------------------------------------------------------------

#[test]
fn the_goal_only_carries_the_sections_the_convention_names() {
    let (_dir, root) = workspace();

    write_issue(
        &root,
        "ABC-100000",
        &PLANNED.replace(
            "  Expose a create endpoint.\n",
            "  Expose it.\n\n  ## Musings\n",
        ),
    );
    assert!(rules(&check(&root)).contains(&"issue.goal.unknown-section"));

    write_issue(
        &root,
        "ABC-100000",
        &PLANNED.replace(
            "  Expose a create endpoint.\n",
            "  Expose it.\n\n  ### Wishlist\n",
        ),
    );
    assert!(rules(&check(&root)).contains(&"issue.goal.unknown-section"));
}

#[test]
fn a_backend_module_documents_its_structure_under_the_data_model_heading() {
    let (_dir, root) = workspace();

    write_issue(
        &root,
        "ABC-100000",
        &PLANNED.replace(
            "  Expose a create endpoint.\n",
            "  Expose it.\n\n  ## Technical Notes\n\n  ### Front-End Structure\n",
        ),
    );

    assert!(rules(&check(&root)).contains(&"issue.goal.section-mismatch"));
}

#[test]
fn every_dod_line_must_be_a_checkbox_indented_by_an_even_number_of_spaces() {
    let (_dir, root) = workspace();

    let cases = [
        ("  A sentence, not a checkbox\n", "issue.dod.format"),
        (
            "  - [ ] The endpoint returns 201\n     - [ ] Oddly indented sub-item\n",
            "issue.dod.indentation",
        ),
        ("  - [X] Shouted\n", "issue.dod.checkbox-case"),
        (
            "  - [ ] The `@Column({ type: \"varchar\" })` is added\n",
            "issue.dod.implementation-detail",
        ),
        ("  - [ ] The `userId` is stored\n", "issue.dod.id-suffix"),
    ];

    for (line, rule) in cases {
        write_issue(
            &root,
            "ABC-100000",
            &PLANNED.replace("  - [ ] The endpoint returns 201 on success\n", line),
        );
        assert!(
            rules(&check(&root)).contains(&rule),
            "{line:?} should trip {rule}, got {:?}",
            rules(&check(&root))
        );
    }
}

#[test]
fn a_dod_holding_no_checkbox_at_all_is_rejected() {
    let (_dir, root) = workspace();

    write_issue(
        &root,
        "ABC-100000",
        &PLANNED.replace(
            "  - [ ] The endpoint returns 201 on success\n",
            "  A sentence, not a checkbox\n",
        ),
    );

    let reported = rules(&check(&root));
    assert!(reported.contains(&"issue.dod.format"), "{reported:?}");
    assert!(reported.contains(&"issue.dod.empty"), "{reported:?}");
}

#[test]
fn a_planned_issue_with_every_item_already_ticked_is_questioned() {
    let (_dir, root) = workspace();

    write_issue(&root, "ABC-100000", &PLANNED.replace("- [ ]", "- [x]"));

    assert_eq!(
        severity_of(&check(&root), "issue.dod.premature-check"),
        Some(Severity::Warning)
    );
}

#[test]
fn an_implemented_issue_cannot_leave_a_dod_item_unchecked() {
    let (_dir, root) = workspace();

    write_issue(
        &root,
        "ABC-100000",
        &implemented("Done", "").replace("- [x]", "- [ ]"),
    );

    assert!(rules(&check(&root)).contains(&"issue.dod.unchecked"));
}
