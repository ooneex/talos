use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use clap::Parser;
use cli::commands::project_check::conventions::{
    inspect as inspect_conventions, is_generated, may_read_process_env,
};
use cli::commands::project_check::dependencies::{import_specifiers, package_of};
use cli::commands::project_check::docker::{host_port, inspect as inspect_docker};
use cli::commands::project_check::docs::is_relative_target;
use cli::commands::project_check::git::{forbidden, human_size, ignores};
use cli::commands::project_check::migrations::timestamp;
use cli::commands::project_check::tests::{self as tests_check, needs_test};
use cli::commands::project_check::{
    A11yDiagnostic, CheckId, CheckOutcome, CheckStatus, HygieneSeverity, ProjectCheckArgs,
    ProjectReport, classify_a11y, dependencies, disabled_a11y_rules, discover_ui_modules, docker,
    docs, env, lint_commits, migrations, modules_with_e2e, parse_biome_a11y, render_json,
    render_report, scan_source, secrets, select_checks, structure, translations,
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
        "--e2e",
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
    assert!(cli.args.e2e);
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
fn every_default_check_runs_by_default() {
    assert_eq!(
        select_checks(None, None, &[]).expect("default selection"),
        CheckId::DEFAULT.to_vec()
    );
}

#[test]
fn the_end_to_end_suite_is_opt_in() {
    let default = select_checks(None, None, &[]).expect("default selection");
    assert!(!default.contains(&CheckId::E2e));
    assert!(CheckId::E2e.opt_in());

    let requested = select_checks(None, None, &[CheckId::E2e]).expect("e2e requested");
    assert_eq!(requested.last(), Some(&CheckId::E2e));

    let only = select_checks(Some("e2e"), None, &[]).expect("only e2e");
    assert_eq!(only, vec![CheckId::E2e]);
}

#[test]
fn only_keeps_the_execution_order() {
    let checks = select_checks(Some("hygiene,workspace"), None, &[]).expect("only selection");

    assert_eq!(checks, vec![CheckId::Workspace, CheckId::Hygiene]);
}

#[test]
fn aliases_resolve_to_their_check() {
    let checks =
        select_checks(Some("a11y,audit,commit,deps,i18n,layout"), None, &[]).expect("aliases");

    assert_eq!(
        checks,
        vec![
            CheckId::Structure,
            CheckId::Dependencies,
            CheckId::Accessibility,
            CheckId::Translations,
            CheckId::Security,
            CheckId::Commits,
        ]
    );
}

#[test]
fn skip_removes_a_check() {
    let checks = select_checks(None, Some("workspace,security"), &[]).expect("skip selection");

    assert!(!checks.contains(&CheckId::Workspace));
    assert!(!checks.contains(&CheckId::Security));
    assert_eq!(checks.len(), CheckId::DEFAULT.len() - 2);
}

#[test]
fn skip_wins_over_only() {
    let error =
        select_checks(Some("hygiene"), Some("hygiene"), &[]).expect_err("nothing left to run");

    assert!(error.contains("No check left to run"));
}

#[test]
fn unknown_check_is_rejected_with_the_valid_names() {
    let error = select_checks(Some("typo"), None, &[]).expect_err("unknown check");

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

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

/// Write a workspace member with the files a real module carries.
fn scaffold_module(
    root: &Path,
    group: &str,
    name: &str,
    kind: Option<&str>,
    package: Option<&str>,
) {
    let dir = root.join(group).join(name);
    fs::create_dir_all(dir.join("src")).expect("create src");
    fs::create_dir_all(dir.join("tests")).expect("create tests");
    write(&dir.join("src/index.ts"), "export const noop = () => {};\n");
    write(&dir.join("tsconfig.json"), "{}\n");
    if let Some(kind) = kind {
        write(
            &dir.join(format!("{name}.yml")),
            &format!("type: \"{kind}\"\n"),
        );
    }
    if let Some(package) = package {
        write(
            &dir.join("package.json"),
            &format!("{{ \"name\": \"{package}\" }}\n"),
        );
    }
}

fn scaffold_root(root: &Path) {
    write(
        &root.join("package.json"),
        "{ \"name\": \"fixture\", \"workspaces\": [\"modules/*\"] }\n",
    );
}

#[test]
fn a_module_without_a_manifest_fails_the_structure_check() {
    let (_guard, root) = root();
    scaffold_root(&root);
    scaffold_module(&root, "modules", "user", None, Some("@module/user"));

    let outcome = structure::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("user.yml is missing"))
    );
}

#[test]
fn a_package_without_a_manifest_is_accepted() {
    let (_guard, root) = root();
    write(
        &root.join("package.json"),
        "{ \"name\": \"fixture\", \"workspaces\": [\"packages/*\"] }\n",
    );
    scaffold_module(&root, "packages", "utils", None, Some("@fixture/utils"));

    let outcome = structure::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Passed, "{:?}", outcome.details);
}

#[test]
fn an_unknown_module_type_is_reported() {
    let (_guard, root) = root();
    scaffold_root(&root);
    scaffold_module(
        &root,
        "modules",
        "user",
        Some("banana"),
        Some("@module/user"),
    );

    let outcome = structure::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("unknown type \"banana\""))
    );
}

#[test]
fn two_modules_cannot_share_a_package_name() {
    let (_guard, root) = root();
    scaffold_root(&root);
    scaffold_module(
        &root,
        "modules",
        "user",
        Some("module"),
        Some("@module/user"),
    );
    scaffold_module(
        &root,
        "modules",
        "admin",
        Some("admin"),
        Some("@module/user"),
    );

    let outcome = structure::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("is already used by"))
    );
}

#[test]
fn a_group_outside_the_workspace_globs_is_reported() {
    let (_guard, root) = root();
    write(&root.join("package.json"), "{ \"name\": \"fixture\" }\n");
    scaffold_module(
        &root,
        "modules",
        "user",
        Some("module"),
        Some("@module/user"),
    );

    let outcome = structure::run(&ProjectCheckArgs::default(), &root);

    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("does not cover \"modules/*\""))
    );
}

#[test]
fn a_dangling_path_alias_is_reported() {
    let (_guard, root) = root();
    scaffold_root(&root);
    scaffold_module(
        &root,
        "modules",
        "user",
        Some("module"),
        Some("@module/user"),
    );
    write(
        &root.join("tsconfig.json"),
        "{ \"compilerOptions\": { \"paths\": { \"@module/gone/*\": [\"./modules/gone/src/*\"] } } }\n",
    );

    let outcome = structure::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("@module/gone/*"))
    );
}

#[test]
fn a_module_without_tests_only_warns() {
    let (_guard, root) = root();
    scaffold_root(&root);
    scaffold_module(
        &root,
        "modules",
        "user",
        Some("module"),
        Some("@module/user"),
    );
    fs::remove_dir_all(root.join("modules/user/tests")).expect("drop the tests directory");

    let outcome = structure::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("no tests/ directory"))
    );
}

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

#[test]
fn env_keys_are_flattened_with_dots() {
    let keys = env::read_keys("app:\n  host: \"\"\n  port: 8030\nlogs:\n  level: info\n")
        .expect("valid YAML");

    assert_eq!(keys, vec!["app.host", "app.port", "logs.level"]);
}

#[test]
fn env_key_diff_reports_both_directions() {
    let example = vec!["app.host".to_string(), "app.port".to_string()];
    let actual = vec!["app.host".to_string(), "app.debug".to_string()];

    let (missing, extra) = env::diff_keys(&example, &actual);

    assert_eq!(missing, vec!["app.port".to_string()]);
    assert_eq!(extra, vec!["app.debug".to_string()]);
}

#[test]
fn a_missing_env_file_fails_the_env_check() {
    let (_guard, root) = root();
    write(&root.join(".env.example.yml"), "app:\n  host: \"\"\n");

    let outcome = env::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains(".env.yml is missing"))
    );
}

#[test]
fn an_undocumented_env_key_only_warns() {
    let (_guard, root) = root();
    write(&root.join(".env.example.yml"), "app:\n  host: \"\"\n");
    write(
        &root.join(".env.yml"),
        "app:\n  host: \"0.0.0.0\"\n  debug: true\n",
    );

    let outcome = env::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("`app.debug` is not documented"))
    );
}

#[test]
fn a_complete_env_file_passes() {
    let (_guard, root) = root();
    write(&root.join(".env.example.yml"), "app:\n  host: \"\"\n");
    write(&root.join(".env.yml"), "app:\n  host: \"0.0.0.0\"\n");

    assert_eq!(
        env::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Passed
    );
}

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

#[test]
fn known_credential_formats_are_confident_findings() {
    let findings = secrets::scan_content("const key = \"AKIAIOSFODNN7EXAMPLE\";", false);

    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "aws-access-key");
    assert!(findings[0].confident);
}

#[test]
fn a_fixture_downgrades_a_credential_to_a_warning() {
    let findings = secrets::scan_content("const key = \"AKIAIOSFODNN7EXAMPLE\";", true);

    assert_eq!(findings.len(), 1);
    assert!(!findings[0].confident);
    assert!(secrets::is_fixture_path("modules/user/tests/user.spec.ts"));
    assert!(!secrets::is_fixture_path("modules/user/src/UserService.ts"));
}

#[test]
fn placeholders_are_not_reported_as_secrets() {
    assert!(!secrets::looks_like_secret("your-api-key-here"));
    assert!(!secrets::looks_like_secret("${STRIPE_SECRET}"));
    assert!(!secrets::looks_like_secret("changeme"));
    assert!(secrets::looks_like_secret("s3cr3t-value-98213"));

    let findings = secrets::scan_content("password = \"process.env.PASSWORD\"", false);
    assert!(findings.is_empty());
}

#[test]
fn a_literal_password_warns_without_failing() {
    let findings = secrets::scan_content("const password = \"Tr0ub4dor&3xyz\";", false);

    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "hardcoded-assignment");
    assert!(!findings[0].confident);
}

#[test]
fn only_real_secret_files_are_flagged_in_the_index() {
    assert!(secrets::is_secret_file(".env"));
    assert!(secrets::is_secret_file(".env.production.yml"));
    assert!(secrets::is_secret_file("server.pem"));
    assert!(!secrets::is_secret_file(".env.example.yml"));
    assert!(!secrets::is_secret_file("package.json"));
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

#[test]
fn import_specifiers_ignore_prose_and_regex_literals() {
    let content = r#"
import { User } from "@module/user";
import "./styles.css";
const lazy = await import("nanoid");
const legacy = require("path");
const pattern = /from\s+["']\.\./;
// copied from "the docs"
"#;

    let specifiers = import_specifiers(content);

    assert!(specifiers.contains(&"@module/user".to_string()));
    assert!(specifiers.contains(&"./styles.css".to_string()));
    assert!(specifiers.contains(&"nanoid".to_string()));
    assert!(specifiers.contains(&"path".to_string()));
    assert!(
        specifiers.iter().all(|specifier| !specifier.contains('\\')),
        "regex literals must not be read as imports: {specifiers:?}"
    );
}

#[test]
fn package_names_resolve_from_their_specifier() {
    assert_eq!(package_of("nanoid"), Some("nanoid".to_string()));
    assert_eq!(
        package_of("@talosjs/service/dist/index.js"),
        Some("@talosjs/service".to_string())
    );
    assert_eq!(package_of("./local"), None);
    assert_eq!(package_of("node:fs"), None);
    assert_eq!(package_of("path"), None);
    assert_eq!(package_of("@/utils"), None);
}

#[test]
fn a_dependency_pinned_twice_is_reported_once() {
    let manifests = vec![
        dependencies::Manifest {
            label: "modules/spa".to_string(),
            name: Some("@module/spa".to_string()),
            dependencies: [("react".to_string(), "^19.2.0".to_string())]
                .into_iter()
                .collect(),
        },
        dependencies::Manifest {
            label: "modules/design".to_string(),
            name: Some("@module/design".to_string()),
            dependencies: [("react".to_string(), "^19.1.0".to_string())]
                .into_iter()
                .collect(),
        },
        dependencies::Manifest {
            label: "modules/admin".to_string(),
            name: Some("@module/admin".to_string()),
            dependencies: [("react".to_string(), "^19.1.0".to_string())]
                .into_iter()
                .collect(),
        },
    ];

    let mismatches = dependencies::version_mismatches(&manifests);

    assert_eq!(mismatches.len(), 1);
    assert!(mismatches[0].starts_with("react: "));
    assert!(mismatches[0].contains("+1"), "{}", mismatches[0]);
}

#[test]
fn unpinned_ranges_are_reported() {
    let manifests = vec![dependencies::Manifest {
        label: "modules/user".to_string(),
        name: None,
        dependencies: [
            ("nanoid".to_string(), "latest".to_string()),
            ("zod".to_string(), "^4.0.0".to_string()),
        ]
        .into_iter()
        .collect(),
    }];

    let findings = dependencies::loose_ranges(&manifests);

    assert_eq!(findings.len(), 1);
    assert!(findings[0].contains("nanoid"));
}

#[test]
fn undeclared_and_unused_dependencies_are_separated() {
    let imports: BTreeSet<String> = ["nanoid", "@module/shared", "zod"]
        .into_iter()
        .map(str::to_string)
        .collect();
    let declared: std::collections::BTreeMap<String, String> = [
        ("zod".to_string(), "^4.0.0".to_string()),
        ("dayjs".to_string(), "^1.0.0".to_string()),
        ("@types/bun".to_string(), "^1.0.0".to_string()),
    ]
    .into_iter()
    .collect();
    let known: BTreeSet<String> = ["nanoid".to_string()].into_iter().collect();

    let (undeclared, unused) = dependencies::compare(
        &imports,
        &["const noop = 1;".to_string()],
        &declared,
        &known,
        &["@module/".to_string()],
    );

    assert_eq!(undeclared, Vec::<String>::new());
    assert_eq!(unused, vec!["dayjs".to_string()]);
}

// ---------------------------------------------------------------------------
// Translations
// ---------------------------------------------------------------------------

fn dictionary(root: &Path, content: &str) {
    write(
        &root.join("package.json"),
        "{ \"workspaces\": [\"modules/*\"] }\n",
    );
    let dir = root.join("modules/user");
    fs::create_dir_all(dir.join("src")).expect("create src");
    write(&dir.join("user.yml"), "type: \"module\"\n");
    write(&dir.join("src/translations.yml"), content);
}

#[test]
fn a_dictionary_is_flattened_to_its_locale_maps() {
    let document = translations::parse_dictionary(
        "cart:\n  items:\n    en: \"{{ count }} item\"\n    fr: \"{{ count }} article\"\n",
        false,
    )
    .expect("valid YAML");

    let flattened = translations::flatten(&document);

    assert_eq!(flattened.len(), 1);
    assert_eq!(
        flattened["cart.items"]["fr"],
        "{{ count }} article".to_string()
    );
    assert_eq!(
        translations::locales(&flattened),
        ["en", "fr"].into_iter().map(str::to_string).collect()
    );
}

#[test]
fn a_missing_fallback_locale_fails_the_translations_check() {
    let (_guard, root) = root();
    dictionary(&root, "welcome:\n  fr: \"Bienvenue\"\n");

    let outcome = translations::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("has no `en` value"))
    );
}

#[test]
fn a_missing_locale_and_a_dropped_placeholder_warn() {
    let (_guard, root) = root();
    dictionary(
        &root,
        "welcome:\n  en: \"Welcome, {{ name }}!\"\n  fr: \"Bienvenue !\"\ncart:\n  en: \"Cart\"\n",
    );

    let outcome = translations::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("drops the placeholder"))
    );
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("missing the `fr` translation"))
    );
}

#[test]
fn a_complete_dictionary_passes() {
    let (_guard, root) = root();
    dictionary(
        &root,
        "welcome:\n  en: \"Welcome, {{ name }}!\"\n  fr: \"Bienvenue, {{ name }} !\"\n",
    );

    assert_eq!(
        translations::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Passed
    );
}

// ---------------------------------------------------------------------------
// End-to-end
// ---------------------------------------------------------------------------

#[test]
fn only_modules_declaring_an_e2e_script_are_run() {
    let (_guard, root) = root();
    scaffold_root(&root);
    scaffold_module(
        &root,
        "modules",
        "user",
        Some("module"),
        Some("@module/user"),
    );
    scaffold_module(&root, "modules", "spa", Some("spa"), Some("@module/spa"));
    write(
        &root.join("modules/spa/package.json"),
        "{ \"name\": \"@module/spa\", \"scripts\": { \"e2e\": \"playwright test\" } }\n",
    );

    assert_eq!(modules_with_e2e(&root), vec!["modules/spa".to_string()]);
}

// ---------------------------------------------------------------------------
// Conventions
// ---------------------------------------------------------------------------

#[test]
fn a_decorated_class_must_carry_the_decorator_suffix() {
    let findings = inspect_conventions(
        "modules/user/src/services/UserCreate.ts",
        "@decorator.service()\nexport class UserCreate {}\n",
    );

    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "conventions.di-name");
    assert!(findings[0].blocking);
    assert!(findings[0].message.contains("does not end with `Service`"));
}

#[test]
fn a_correctly_named_injected_class_is_accepted() {
    assert!(
        inspect_conventions(
            "modules/user/src/services/UserCreateService.ts",
            "@decorator.service()\nexport class UserCreateService {}\n",
        )
        .is_empty()
    );
}

#[test]
fn reading_process_env_outside_the_typed_config_is_blocking() {
    let findings = inspect_conventions(
        "modules/user/src/services/StripeService.ts",
        "const key = process.env.STRIPE_SECRET_KEY;\n",
    );

    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "conventions.process-env");
    assert!(findings[0].blocking);
}

#[test]
fn the_files_that_build_the_typed_config_may_read_process_env() {
    assert!(may_read_process_env("packages/app-env/src/AppEnv.ts"));
    assert!(may_read_process_env("modules/user/tests/user.spec.ts"));
    assert!(!may_read_process_env("modules/user/src/services/A.ts"));
}

#[test]
fn only_exported_type_names_are_held_to_the_convention() {
    let findings = inspect_conventions(
        "modules/user/src/types.ts",
        "type Local = string;\nexport type Payload = string;\nexport interface Options {}\n",
    );

    let rules: Vec<&str> = findings.iter().map(|finding| finding.rule).collect();
    assert_eq!(
        rules,
        vec!["conventions.type-name", "conventions.interface-name"]
    );
    assert!(findings.iter().all(|finding| !finding.blocking));
}

#[test]
fn a_generated_file_is_left_alone() {
    assert!(is_generated("/* eslint-disable */\n// @generated\n"));
    assert!(is_generated(
        "// This file is auto-generated. Do not edit.\n"
    ));
    assert!(!is_generated("export const value = 1;\n"));
}

#[test]
fn a_non_null_assertion_is_reported_but_a_comparison_is_not() {
    let findings = inspect_conventions(
        "modules/user/src/services/AService.ts",
        "if (a !== b) { return user!.name; }\n",
    );

    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "conventions.non-null");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[test]
fn barrel_and_type_files_need_no_spec() {
    assert!(!needs_test("index", "export * from './a';\n"));
    assert!(!needs_test("types", "export type AType = string;\n"));
    assert!(needs_test("UserService", "export class UserService {}\n"));
    assert!(!needs_test("UserService", "// nothing here\n"));
}

#[test]
fn a_source_file_without_a_spec_is_reported() {
    let (_guard, root) = root();
    scaffold_root(&root);
    scaffold_module(
        &root,
        "modules",
        "user",
        Some("module"),
        Some("@module/user"),
    );
    write(
        &root.join("modules/user/src/UserService.ts"),
        "export class UserService {}\n",
    );
    write(&root.join("modules/user/tests/index.spec.ts"), "// ok\n");

    let outcome = tests_check::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("`UserService` has no test"))
    );
}

#[test]
fn a_mirrored_spec_satisfies_the_check() {
    let (_guard, root) = root();
    scaffold_root(&root);
    scaffold_module(
        &root,
        "modules",
        "user",
        Some("module"),
        Some("@module/user"),
    );
    write(
        &root.join("modules/user/src/UserService.ts"),
        "export class UserService {}\n",
    );
    write(
        &root.join("modules/user/tests/UserService.spec.ts"),
        "// ok\n",
    );

    assert_eq!(
        tests_check::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Passed
    );
}

// ---------------------------------------------------------------------------
// Docker
// ---------------------------------------------------------------------------

#[test]
fn the_host_side_of_a_port_mapping_is_extracted() {
    assert_eq!(host_port("\"8080:80\""), Some("8080".to_string()));
    assert_eq!(host_port("127.0.0.1:5432:5432"), Some("5432".to_string()));
    assert_eq!(host_port("3000:3000/tcp"), Some("3000".to_string()));
    assert_eq!(host_port("80"), None);
}

#[test]
fn duplicate_host_ports_and_unpinned_images_are_reported() {
    let document: serde_yaml::Value = serde_yaml::from_str(
        "services:\n  db:\n    image: postgres:latest\n    ports: [\"5432:5432\"]\n  cache:\n    image: redis:7.2\n    restart: always\n    ports: [\"5432:6379\"]\n",
    )
    .expect("parse compose");

    let findings = inspect_docker(&document);

    assert!(
        findings
            .iter()
            .any(|finding| finding.blocking && finding.message.contains("host port 5432"))
    );
    assert!(
        findings
            .iter()
            .any(|finding| !finding.blocking && finding.message.contains("is unpinned"))
    );
}

#[test]
fn a_pinned_compose_file_passes() {
    let document: serde_yaml::Value = serde_yaml::from_str(
        "services:\n  db:\n    image: postgres:16.2\n    restart: always\n    ports: [\"5432:5432\"]\n",
    )
    .expect("parse compose");

    assert!(inspect_docker(&document).is_empty());
}

#[test]
fn a_module_owned_compose_file_is_discovered() {
    let (_guard, root) = root();
    scaffold_root(&root);
    scaffold_module(&root, "modules", "app", Some("api"), Some("@module/app"));
    write(
        &root.join("modules/app/docker-compose.yml"),
        "services:\n  db:\n    image: postgres:16.2\n    restart: always\n",
    );

    let outcome = docker::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Passed);
    assert!(outcome.summary.contains("1 compose file"));
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

#[test]
fn only_a_leading_epoch_counts_as_a_migration_timestamp() {
    assert_eq!(timestamp("1700000000000-create-user"), Some(1700000000000));
    assert_eq!(timestamp("CreateUser"), None);
    assert_eq!(timestamp("20240101-user"), Some(20240101));
}

#[test]
fn two_migrations_sharing_a_timestamp_fail() {
    let (_guard, root) = root();
    scaffold_root(&root);
    scaffold_module(
        &root,
        "modules",
        "user",
        Some("module"),
        Some("@module/user"),
    );
    let dir = root.join("modules/user/src/migrations");
    write(
        &dir.join("1700000000000-a.ts"),
        "export class A { public async up() {} public async down() {} }\n",
    );
    write(
        &dir.join("1700000000000-b.ts"),
        "export class B { public async up() {} public async down() {} }\n",
    );

    let outcome = migrations::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("shares its timestamp"))
    );
}

#[test]
fn a_migration_without_a_down_is_a_warning_and_broken_seed_yaml_fails() {
    let (_guard, root) = root();
    scaffold_root(&root);
    scaffold_module(
        &root,
        "modules",
        "user",
        Some("module"),
        Some("@module/user"),
    );
    write(
        &root.join("modules/user/src/migrations/1700000000001-a.ts"),
        "export class A { public async up() {} }\n",
    );
    write(
        &root.join("modules/user/src/seeds/users.yml"),
        "users:\n  - name: a\n   - broken\n",
    );

    let outcome = migrations::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("is not valid YAML"))
    );
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("no `down` method"))
    );
}

// ---------------------------------------------------------------------------
// Docs
// ---------------------------------------------------------------------------

#[test]
fn only_on_disk_link_targets_are_resolved() {
    assert!(is_relative_target("./docs/guide.md"));
    assert!(!is_relative_target("https://example.com"));
    assert!(!is_relative_target("#section"));
    assert!(!is_relative_target("mailto:a@b.c"));
    assert!(!is_relative_target("{{ NAME }}"));
}

#[test]
fn a_link_to_a_missing_file_is_reported_and_an_anchor_is_stripped() {
    let (_guard, root) = root();
    write(&root.join("guide.md"), "# guide\n");
    write(
        &root.join("README.md"),
        "[here](guide.md#intro) and [gone](missing.md)\n",
    );

    let outcome = docs::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert_eq!(outcome.details.len(), 1);
    assert!(outcome.details[0].contains("missing.md"));
}

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

#[test]
fn gitignore_patterns_are_matched_through_their_decorations() {
    let gitignore = "/node_modules\n**/dist\n.env*\n# comment\n";

    assert!(ignores(gitignore, "node_modules"));
    assert!(ignores(gitignore, "dist"));
    assert!(ignores(gitignore, ".env"));
    assert!(!ignores(gitignore, ".DS_Store"));
}

#[test]
fn tracked_build_output_is_reported() {
    let tracked = vec![
        "modules/user/src/index.ts".to_string(),
        "node_modules/left-pad/index.js".to_string(),
        "modules/spa/dist/app.js".to_string(),
    ];

    assert_eq!(
        forbidden(&tracked),
        vec![
            "node_modules/left-pad/index.js".to_string(),
            "modules/spa/dist/app.js".to_string()
        ]
    );
}

#[test]
fn sizes_are_rendered_for_a_human() {
    assert_eq!(human_size(3 * 1024 * 1024), "3.0 MB".to_string());
    assert_eq!(human_size(512 * 1024), "512 KB".to_string());
}
