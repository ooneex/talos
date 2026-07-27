use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use clap::Parser;
use cli::commands::project_check::{
    A11yDiagnostic, CheckId, CheckOutcome, CheckStatus, HygieneSeverity, ProjectCheckArgs,
    ProjectReport, classify_a11y, disabled_a11y_rules, discover_ui_modules, lint_commits,
    parse_biome_a11y, render_json, render_report, scan_source, select_checks,
};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: ProjectCheckArgs,
}

fn root() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let path = dir.path().to_path_buf();
    (dir, path)
}

fn write(path: &Path, content: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create parent directory");
    }
    fs::write(path, content).expect("write file");
}

fn outcome(id: CheckId, status: CheckStatus, summary: &str) -> CheckOutcome {
    CheckOutcome {
        id,
        status,
        summary: summary.to_string(),
        details: Vec::new(),
        hints: Vec::new(),
        duration_ms: 10,
    }
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

#[test]
fn project_check_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--only",
        "security",
        "--skip",
        "hygiene",
        "--packages",
        "core",
        "--modules",
        "user",
        "--audit-level",
        "high",
        "--logs",
        "--no-cache",
        "--strict",
        "--json",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.only.as_deref(), Some("security"));
    assert_eq!(cli.args.skip.as_deref(), Some("hygiene"));
    assert_eq!(cli.args.packages.as_deref(), Some("core"));
    assert_eq!(cli.args.modules.as_deref(), Some("user"));
    assert_eq!(cli.args.audit_level.as_deref(), Some("high"));
    assert!(cli.args.logs);
    assert!(cli.args.no_cache);
    assert!(cli.args.strict);
    assert!(cli.args.json);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn project_check_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.only.is_none());
    assert!(cli.args.skip.is_none());
    assert!(!cli.args.strict);
    assert!(!cli.args.json);
}

#[test]
fn project_check_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// Check selection
// ---------------------------------------------------------------------------

#[test]
fn every_check_runs_by_default() {
    assert_eq!(
        select_checks(None, None).expect("default selection"),
        CheckId::ALL.to_vec()
    );
}

#[test]
fn only_keeps_the_execution_order() {
    let checks = select_checks(Some("hygiene,workspace"), None).expect("only selection");

    assert_eq!(checks, vec![CheckId::Workspace, CheckId::Hygiene]);
}

#[test]
fn aliases_resolve_to_their_check() {
    let checks = select_checks(Some("a11y,audit,commit"), None).expect("aliases");

    assert_eq!(
        checks,
        vec![CheckId::Accessibility, CheckId::Security, CheckId::Commits]
    );
}

#[test]
fn skip_removes_a_check() {
    let checks = select_checks(None, Some("workspace,security")).expect("skip selection");

    assert!(!checks.contains(&CheckId::Workspace));
    assert!(!checks.contains(&CheckId::Security));
    assert_eq!(checks.len(), CheckId::ALL.len() - 2);
}

#[test]
fn skip_wins_over_only() {
    let error = select_checks(Some("hygiene"), Some("hygiene")).expect_err("nothing left to run");

    assert!(error.contains("No check left to run"));
}

#[test]
fn unknown_check_is_rejected_with_the_valid_names() {
    let error = select_checks(Some("typo"), None).expect_err("unknown check");

    assert!(error.contains("typo"));
    assert!(error.contains("workspace"));
    assert!(error.contains("hygiene"));
}

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

const BIOME_PAYLOAD: &str = r#"The --json option is unstable/experimental.
{"summary":{"errors":2},"diagnostics":[
  {"severity":"error","message":"Missing alt text.","category":"lint/a11y/useAltText","location":{"path":"modules/design/src/Logo.tsx","start":{"line":12,"column":3}}},
  {"severity":"info","message":"Unexpected event handler.","category":"lint/a11y/noNoninteractiveElementInteractions","location":{"path":"modules/spa/src/Row.tsx","start":{"line":4,"column":1}}},
  {"severity":"error","message":"Missing title.","category":"lint/a11y/noSvgWithoutTitle","location":{"path":"modules/design/src/Icon.tsx","start":{"line":7,"column":1}}},
  {"severity":"error","message":"Unused import.","category":"lint/correctness/noUnusedImports","location":{"path":"modules/design/src/Icon.tsx","start":{"line":1,"column":1}}}
]}"#;

#[test]
fn biome_payload_keeps_a11y_diagnostics_only() {
    let diagnostics = parse_biome_a11y(BIOME_PAYLOAD).expect("payload should parse");

    assert_eq!(diagnostics.len(), 3);
    assert_eq!(diagnostics[0].rule, "useAltText");
    assert_eq!(diagnostics[0].file, "modules/design/src/Logo.tsx");
    assert_eq!(diagnostics[0].line, 12);
    assert_eq!(diagnostics[0].message, "Missing alt text.");
}

#[test]
fn biome_payload_that_is_not_json_is_rejected() {
    assert!(parse_biome_a11y("biome: command not found").is_none());
}

#[test]
fn disabled_rules_never_fail_the_accessibility_check() {
    let diagnostics = parse_biome_a11y(BIOME_PAYLOAD).expect("payload should parse");
    let disabled = BTreeSet::from(["noSvgWithoutTitle".to_string()]);

    let report = classify_a11y(&diagnostics, &disabled);

    assert_eq!(report.errors.len(), 1);
    assert_eq!(report.errors[0].rule, "useAltText");
    assert_eq!(report.warnings.len(), 1);
    assert_eq!(
        report.warnings[0].rule,
        "noNoninteractiveElementInteractions"
    );
    assert_eq!(report.ignored.get("noSvgWithoutTitle"), Some(&1));
    assert_eq!(report.violations(), 2);
}

#[test]
fn info_diagnostics_are_reported_as_warnings() {
    let diagnostics = vec![A11yDiagnostic {
        rule: "useKeyWithClickEvents".to_string(),
        severity: "info".to_string(),
        file: "modules/spa/src/Card.tsx".to_string(),
        line: 3,
        message: "Missing keyboard handler.".to_string(),
    }];

    let report = classify_a11y(&diagnostics, &BTreeSet::new());

    assert!(report.errors.is_empty());
    assert_eq!(report.warnings.len(), 1);
}

#[test]
fn disabled_a11y_rules_are_read_from_the_biome_config() {
    let (_dir, root) = root();
    write(
        &root.join("biome.jsonc"),
        r#"{
  // Comments are allowed in a jsonc config.
  "linter": {
    "rules": {
      "a11y": {
        "noSvgWithoutTitle": "off",
        "useKeyWithClickEvents": { "level": "off" },
        "useAltText": "error"
      }
    }
  }
}"#,
    );

    let disabled = disabled_a11y_rules(&root);

    assert!(disabled.contains("noSvgWithoutTitle"));
    assert!(disabled.contains("useKeyWithClickEvents"));
    assert!(!disabled.contains("useAltText"));
}

#[test]
fn disabled_a11y_rules_are_empty_without_a_config() {
    let (_dir, root) = root();

    assert!(disabled_a11y_rules(&root).is_empty());
}

#[test]
fn only_ui_modules_are_audited_for_accessibility() {
    let (_dir, root) = root();
    for (name, module_type) in [
        ("design", "design"),
        ("spa", "spa"),
        ("admin", "admin"),
        ("storybook", "storybook"),
        ("app", "api"),
        ("shared", "module"),
    ] {
        let dir = root.join("modules").join(name);
        fs::create_dir_all(dir.join("src")).expect("create module src");
        write(
            &dir.join(format!("{name}.yml")),
            &format!("type: \"{module_type}\" # comment\n"),
        );
    }

    let modules = discover_ui_modules(&root);
    let names: Vec<String> = modules.into_iter().map(|module| module.name).collect();

    assert_eq!(names, vec!["admin", "design", "spa", "storybook"]);
}

#[test]
fn a_module_without_sources_is_not_audited() {
    let (_dir, root) = root();
    let dir = root.join("modules/design");
    fs::create_dir_all(&dir).expect("create module");
    write(&dir.join("design.yml"), "type: \"design\"\n");

    assert!(discover_ui_modules(&root).is_empty());
}

// ---------------------------------------------------------------------------
// Commits
// ---------------------------------------------------------------------------

#[test]
fn conventional_commits_report_no_problem() {
    let commits = vec![(
        "abc1234".to_string(),
        "feat(user): Add the create endpoint".to_string(),
    )];

    assert!(lint_commits(&commits, &["user".to_string()]).is_empty());
}

#[test]
fn non_conventional_commits_are_reported_with_their_header() {
    let commits = vec![
        ("abc1234".to_string(), "wip".to_string()),
        (
            "def5678".to_string(),
            "feat(unknown): Add something".to_string(),
        ),
    ];

    let problems = lint_commits(&commits, &["user".to_string()]);

    assert_eq!(problems.len(), 2);
    assert_eq!(problems[0].id, "abc1234");
    assert_eq!(problems[0].header, "wip");
    assert!(!problems[0].errors.is_empty());
    assert!(
        problems[1]
            .errors
            .iter()
            .any(|error| error.contains("unknown"))
    );
}

#[test]
fn merge_commits_are_ignored() {
    let commits = vec![(
        "abc1234".to_string(),
        "Merge branch 'main' into feature".to_string(),
    )];

    assert!(lint_commits(&commits, &["common".to_string()]).is_empty());
}

// ---------------------------------------------------------------------------
// Hygiene
// ---------------------------------------------------------------------------

#[test]
fn unresolved_conflict_markers_are_errors() {
    let content = format!("const a = 1;\n{} HEAD\nconst b = 2;\n", "<".repeat(7));

    let findings = scan_source("modules/user/src/a.ts", &content);

    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "hygiene.conflict-marker");
    assert_eq!(findings[0].severity, HygieneSeverity::Error);
    assert_eq!(findings[0].line, 2);
}

#[test]
fn focused_tests_are_errors_and_skipped_tests_are_warnings() {
    let content = format!(
        "{}\n{}\n",
        "describe.only(\"user\", () => {});", "it.skip(\"creates\", () => {});"
    );

    let findings = scan_source("modules/user/tests/a.spec.ts", &content);

    assert_eq!(findings.len(), 2);
    assert_eq!(findings[0].rule, "hygiene.focused-test");
    assert_eq!(findings[0].severity, HygieneSeverity::Error);
    assert_eq!(findings[1].rule, "hygiene.skipped-test");
    assert_eq!(findings[1].severity, HygieneSeverity::Warning);
}

#[test]
fn bare_todo_comments_are_warnings() {
    let findings = scan_source("modules/user/src/a.ts", "// TODO rework this later\n");

    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "hygiene.bare-todo");
    assert_eq!(findings[0].severity, HygieneSeverity::Warning);
}

#[test]
fn tracked_todo_comments_are_accepted() {
    let content = "// TODO(ABC-123) rework this later\n// FIXME https://example.com/issues/1\n";

    assert!(scan_source("modules/user/src/a.ts", content).is_empty());
}

#[test]
fn documentation_may_mention_markers() {
    let content = "# TODO\n\nImplement the generated `// TODO` bodies.\n";

    assert!(scan_source("README.md", content).is_empty());
}

#[test]
fn documentation_conflict_markers_are_still_reported() {
    let content = format!("# Title\n{} HEAD\n", "<".repeat(7));

    let findings = scan_source("README.md", &content);

    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "hygiene.conflict-marker");
}

#[test]
fn only_javascript_sources_are_scanned_for_focused_tests() {
    let content = "describe.only(\"user\", () => {});\n";

    assert!(scan_source("docs/example.yml", content).is_empty());
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

fn report() -> ProjectReport {
    ProjectReport {
        root: "/workspace".to_string(),
        outcomes: vec![
            outcome(
                CheckId::Workspace,
                CheckStatus::Passed,
                "install, build, fmt, lint, test",
            ),
            CheckOutcome {
                details: vec![
                    "HIGH  user · lodash@4.17.20  GHSA-1234  patched 4.17.21".to_string(),
                ],
                hints: vec!["Inspect with `talos security:check`".to_string()],
                ..outcome(
                    CheckId::Security,
                    CheckStatus::Failed,
                    "2 vulnerabilities (1 high, 1 moderate)",
                )
            },
            outcome(CheckId::Commits, CheckStatus::Warned, "1 non-conventional"),
            outcome(CheckId::Issues, CheckStatus::Skipped, "no issue file found"),
        ],
        duration_ms: 1234,
    }
}

#[test]
fn the_report_lists_every_check_with_its_summary() {
    let rendered = render_report(&report());

    assert!(rendered.contains("Project check"));
    assert!(rendered.contains("Workspace"));
    assert!(rendered.contains("install, build, fmt, lint, test"));
    assert!(rendered.contains("2 vulnerabilities (1 high, 1 moderate)"));
    assert!(rendered.contains("1 failed · 1 warning · 1 passed · 1 skipped"));
}

#[test]
fn the_report_details_failing_checks_only() {
    let rendered = render_report(&report());

    assert!(rendered.contains("GHSA-1234"));
    assert!(rendered.contains("Inspect with `talos security:check`"));
    // A passing check never adds a detail section.
    assert_eq!(rendered.matches("Workspace").count(), 1);
}

#[test]
fn a_clean_report_is_green() {
    let clean = ProjectReport {
        root: "/workspace".to_string(),
        outcomes: vec![outcome(CheckId::Hygiene, CheckStatus::Passed, "no problem")],
        duration_ms: 12,
    };

    let rendered = render_report(&clean);

    assert!(rendered.contains("0 failed · 0 warnings · 1 passed"));
}

#[test]
fn counts_and_failure_follow_the_strict_flag() {
    let report = report();

    assert_eq!(report.count(CheckStatus::Failed), 1);
    assert_eq!(report.count(CheckStatus::Warned), 1);
    assert!(report.failed());
    assert!(report.warned());
    assert!(report.is_failure(false));

    let warned_only = ProjectReport {
        root: "/workspace".to_string(),
        outcomes: vec![outcome(CheckId::Commits, CheckStatus::Warned, "1 warning")],
        duration_ms: 1,
    };

    assert!(!warned_only.is_failure(false));
    assert!(warned_only.is_failure(true));
}

#[test]
fn the_json_report_exposes_every_check() {
    let json: serde_json::Value =
        serde_json::from_str(&render_json(&report())).expect("valid JSON report");

    assert_eq!(json["root"], "/workspace");
    assert_eq!(json["failed"], 1);
    assert_eq!(json["warnings"], 1);
    assert_eq!(json["skipped"], 1);
    assert_eq!(json["checks"].as_array().expect("checks").len(), 4);
    assert_eq!(json["checks"][1]["id"], "security");
    assert_eq!(json["checks"][1]["status"], "failed");
    assert_eq!(json["checks"][3]["status"], "skipped");
}

#[test]
fn every_check_has_a_stable_key_and_title() {
    for id in CheckId::ALL {
        assert!(!id.key().is_empty());
        assert!(!id.title().is_empty());
        assert!(!id.description().is_empty());
        assert_eq!(CheckId::from_key(id.key()), Some(id));
    }
}
