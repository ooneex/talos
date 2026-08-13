use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use clap::Parser;
use cli::commands::project_check::conventions::{
    inspect as inspect_conventions, is_generated, may_read_process_env,
};
use cli::commands::project_check::dependencies::{import_specifiers, package_of};
use cli::commands::project_check::docker::{host_port, inspect as inspect_docker};
use cli::commands::project_check::docs::is_relative_target;
use cli::commands::project_check::git::{forbidden, ignores};
use cli::commands::project_check::graph::Layer;
use cli::commands::project_check::migrations::timestamp;
use cli::commands::project_check::tests::{self as tests_check, needs_test};
use cli::commands::project_check::{
    A11yDiagnostic, CheckId, CheckOutcome, CheckStatus, HygieneSeverity, ProjectCheckArgs,
    ProjectReport, asynchrony, boundaries, branches, bundle, classify_a11y, complexity, container,
    contrast, dependencies, disabled_a11y_rules, discover_ui_modules, docker, docs, e2e_coverage,
    entities, env, exceptions, execute, graph, health, imports, lint_commits, lockfile, migrations,
    modules_with_e2e, orphans, outdated, parse_biome_a11y, queries, registration, render_json,
    render_report, restricted, roles, routes, scan_source, sdk, secrets, select_checks, sql,
    stories, structure, transactions, translations, tsconfig, validation,
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
        cached: false,
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
fn strict_turns_a_warning_into_a_failure() {
    let (_guard, root) = root();
    let dir = workspace(&root, "app", "api");
    // A role with no place in the hierarchy: a warning, and nothing else.
    write(
        &dir.join("roles.yml"),
        "roles:\n  USER: ROLE_USER\n  ADMIN: ROLE_ADMIN\nhierarchy:\n  ROLE_USER:\n    description: Standard user\n",
    );

    let args = |strict: bool| ProjectCheckArgs {
        cwd: Some(root.to_string_lossy().to_string()),
        no_cache: true,
        json: true,
        strict,
        ..ProjectCheckArgs::default()
    };

    let lenient = execute(&args(false), &[CheckId::Roles]);
    assert_eq!(lenient.outcomes[0].status, CheckStatus::Warned);
    assert!(!lenient.is_failure(false));

    let strict = execute(&args(true), &[CheckId::Roles]);
    assert_eq!(strict.outcomes[0].status, CheckStatus::Failed);
    assert_eq!(strict.count(CheckStatus::Warned), 0);
    assert!(strict.is_failure(true));
    // The detail that earned the warning survives the promotion, relabelled:
    // a failing check may not report a line as a warning.
    assert!(
        strict.outcomes[0]
            .details
            .iter()
            .any(|detail| detail.starts_with("error  ") && detail.contains("`ROLE_ADMIN`"))
    );
    assert!(
        !strict.outcomes[0]
            .details
            .iter()
            .any(|detail| detail.starts_with("warn"))
    );

    let rendered = render_report(&strict);
    assert!(rendered.contains("1 failed · 0 warnings"));
    assert!(!rendered.contains("warn "));
}

#[test]
fn strict_reports_the_promoted_warning_as_a_failure_in_json() {
    let (_guard, root) = root();
    let dir = workspace(&root, "app", "api");
    write(
        &dir.join("roles.yml"),
        "roles:\n  USER: ROLE_USER\n  ADMIN: ROLE_ADMIN\nhierarchy:\n  ROLE_USER:\n    description: Standard user\n",
    );

    let report = execute(
        &ProjectCheckArgs {
            cwd: Some(root.to_string_lossy().to_string()),
            no_cache: true,
            json: true,
            strict: true,
            ..ProjectCheckArgs::default()
        },
        &[CheckId::Roles],
    );
    let json: serde_json::Value =
        serde_json::from_str(&render_json(&report)).expect("valid JSON report");

    assert_eq!(json["failed"], 1);
    assert_eq!(json["warnings"], 0);
    assert_eq!(json["checks"][0]["status"], "failed");
}

#[test]
fn strict_leaves_every_other_status_alone() {
    let (_guard, clean) = root();
    let dir = workspace(&clean, "app", "api");
    // Every declared role sits in the hierarchy and guards the one route.
    write(
        &dir.join("roles.yml"),
        "roles:\n  USER: ROLE_USER\nhierarchy:\n  ROLE_USER:\n    description: Standard user\n",
    );
    controller(&dir, "Read", "get", "/users", "  roles: [\"ROLE_USER\"],\n");

    let strict = |root: &Path| ProjectCheckArgs {
        cwd: Some(root.to_string_lossy().to_string()),
        no_cache: true,
        json: true,
        strict: true,
        ..ProjectCheckArgs::default()
    };

    let passed = execute(&strict(&clean), &[CheckId::Roles]);
    assert_eq!(passed.outcomes[0].status, CheckStatus::Passed);
    assert!(!passed.is_failure(true));

    // No roles.yml anywhere: the check has nothing to say, and `--strict` does
    // not turn silence into a finding.
    let (_empty_guard, empty) = root();
    workspace(&empty, "app", "api");
    let skipped = execute(&strict(&empty), &[CheckId::Roles]);
    assert_eq!(skipped.outcomes[0].status, CheckStatus::Skipped);
    assert!(!skipped.is_failure(true));

    // An error was already a failure and stays one, details intact.
    let (_broken_guard, broken) = root();
    let broken_dir = workspace(&broken, "app", "api");
    write(
        &broken_dir.join("roles.yml"),
        "roles:\n  USER: ROLE_USER\nhierarchy:\n  ROLE_USER:\n    description: Standard user\n",
    );
    controller(
        &broken_dir,
        "Read",
        "get",
        "/users",
        "  roles: [\"ROLE_ADMIN\"],\n",
    );
    let failed = execute(&strict(&broken), &[CheckId::Roles]);
    assert_eq!(failed.outcomes[0].status, CheckStatus::Failed);
    assert!(
        failed.outcomes[0]
            .details
            .iter()
            .any(|detail| detail.contains("guards on `ROLE_ADMIN`"))
    );
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
fn a_tests_directory_holding_no_spec_is_reported() {
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
    write(&root.join("modules/user/tests/README.md"), "// ok\n");

    let outcome = tests_check::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("tests/ exists but holds no spec file"))
    );
}

#[test]
fn any_spec_in_tests_satisfies_the_check() {
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
fn a_compose_file_without_services_or_restart_is_reported() {
    let empty: serde_yaml::Value = serde_yaml::from_str("version: '3.9'\n").expect("compose");
    let findings = inspect_docker(&empty);
    assert_eq!(findings.len(), 1);
    assert!(findings[0].blocking);

    let document: serde_yaml::Value = serde_yaml::from_str(
        "services:\n  web:\n    build: .\n    ports:\n      - published: 8080\n  worker:\n    image: postgres\n    ports:\n      - 5432\n",
    )
    .expect("compose");
    let findings = inspect_docker(&document);
    assert!(
        findings
            .iter()
            .any(|finding| finding.message.contains("no `restart` policy"))
    );
    assert!(
        findings
            .iter()
            .any(|finding| finding.message.contains("image `postgres` is unpinned"))
    );
    assert_eq!(docker::host_port(":80"), None);

    let missing: serde_yaml::Value =
        serde_yaml::from_str("services:\n  ghost:\n    ports: [true, { published: 8080 }]\n")
            .expect("compose");
    let findings = inspect_docker(&missing);
    assert!(findings.iter().any(|finding| {
        finding
            .message
            .contains("declares neither `image` nor `build`")
    }));
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

#[test]
fn docker_is_skipped_without_any_compose_file_and_fails_on_invalid_yaml() {
    let (_guard, root) = root();
    assert_eq!(
        docker::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Skipped
    );

    write(&root.join("docker-compose.yml"), "services:\n  bad: [\n");
    let outcome = docker::run(&ProjectCheckArgs::default(), &root);
    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("is not valid YAML"))
    );
}

/// Mode `0o000` is the only portable way to make a file unreadable, and it
/// has no Windows equivalent.
#[cfg(unix)]
#[test]
fn docker_reports_an_unreadable_compose_file() {
    use std::os::unix::fs::PermissionsExt;

    let (_guard, root) = root();
    let compose = root.join("docker-compose.yml");
    write(
        &compose,
        "services:\n  db:\n    image: postgres:16\n    restart: always\n",
    );
    let mut permissions = fs::metadata(&compose).expect("metadata").permissions();
    permissions.set_mode(0o000);
    fs::set_permissions(&compose, permissions).expect("chmod");

    let outcome = docker::run(&ProjectCheckArgs::default(), &root);
    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("could not be read"))
    );
}

#[test]
fn docker_run_reports_blocking_compose_findings() {
    let (_guard, root) = root();
    write(
        &root.join("docker-compose.yml"),
        "services:\n  app:\n    ports:\n      - '8080:80'\n",
    );

    let outcome = docker::run(&ProjectCheckArgs::default(), &root);
    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("declares neither `image` nor `build`"))
    );

    let document: serde_yaml::Value = serde_yaml::from_str(
        "services:\n  app:\n    image: a:1\n    ports:\n      - { published: '8080' }\n",
    )
    .expect("compose");
    assert!(
        inspect_docker(&document)
            .iter()
            .any(|finding| finding.message.contains("no `restart` policy"))
    );
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

// ---------------------------------------------------------------------------
// Graph — the import index the imports, orphans and stories checks share
// ---------------------------------------------------------------------------

/// A workspace holding one module, ready for the graph-backed checks.
fn workspace(root: &Path, name: &str, kind: &str) -> PathBuf {
    write(
        &root.join("package.json"),
        "{ \"workspaces\": [\"modules/*\"] }\n",
    );
    write(
        &root.join("tsconfig.json"),
        &format!(
            "{{ \"compilerOptions\": {{ \"strict\": true, \"paths\": {{ \"@module/{name}/*\": [\"./modules/{name}/src/*\"] }} }} }}\n"
        ),
    );
    let dir = root.join("modules").join(name);
    write(
        &dir.join(format!("{name}.yml")),
        &format!("type: \"{kind}\"\n"),
    );
    write(
        &dir.join("package.json"),
        &format!("{{ \"name\": \"{name}\" }}\n"),
    );
    dir
}

#[test]
fn a_relative_specifier_is_resolved_through_its_parent_segments() {
    let known: BTreeSet<PathBuf> = [PathBuf::from("/w/src/routes/index.tsx")]
        .into_iter()
        .collect();
    let base = graph::normalize(Path::new("/w/src/bootstrap/./../routes/index"));

    assert_eq!(base, PathBuf::from("/w/src/routes/index"));
    assert_eq!(
        graph::resolve_file(&base, &known),
        Some(PathBuf::from("/w/src/routes/index.tsx"))
    );
}

#[test]
fn a_directory_specifier_resolves_to_its_index() {
    let known: BTreeSet<PathBuf> = [PathBuf::from("/w/src/shared/story/index.ts")]
        .into_iter()
        .collect();

    assert_eq!(
        graph::resolve_file(Path::new("/w/src/shared/story"), &known),
        Some(PathBuf::from("/w/src/shared/story/index.ts"))
    );
}

#[test]
fn a_stylesheet_import_is_an_asset_rather_than_a_missing_module() {
    assert!(graph::is_asset("@module/design/styles/app.css"));
    assert!(graph::is_asset("./translations.json"));
    assert!(!graph::is_asset("./Button"));
    assert!(!graph::is_asset("@talosjs/container"));
}

#[test]
fn re_exports_and_type_imports_are_told_apart() {
    let imports = graph::parse_imports(
        "import type { Config } from \"./types\";\nimport { Button } from \"./Button\";\nexport * from \"./Card\";\n",
    );

    assert_eq!(imports.len(), 3);
    assert!(imports[0].type_only);
    assert!(!imports[1].type_only);
    assert_eq!(
        imports[1].names,
        ["Button".to_string()].into_iter().collect()
    );
    // A barrel reaches the file it re-exports just as an import does.
    assert_eq!(imports[2].specifier, "./Card".to_string());
}

#[test]
fn exported_names_cover_every_declaration_form() {
    let names = graph::exported_names(
        "export const a = 1;\nexport type B = string;\nexport class C {}\nexport { d, e as f };\nexport default g;\n",
    );

    assert!(names.contains("a"));
    assert!(names.contains("B"));
    assert!(names.contains("C"));
    assert!(names.contains("d"));
    // `e as f` publishes `f`, which is the name an importer writes.
    assert!(names.contains("f"));
    assert!(names.contains("default"));
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

#[test]
fn a_specifier_pointing_at_no_file_fails_the_imports_check() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(
        &dir.join("src/services/UserService.ts"),
        "import { Missing } from \"./Missing\";\nexport class UserService {}\n",
    );

    let outcome = imports::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("`./Missing` resolves to no file"))
    );
}

#[test]
fn an_entity_importing_a_service_inverts_the_dependency_rule() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(
        &dir.join("src/services/UserService.ts"),
        "export class UserService {}\n",
    );
    write(
        &dir.join("src/entities/UserEntity.ts"),
        "import { UserService } from \"../services/UserService\";\nexport class UserEntity {}\n",
    );

    let outcome = imports::run(&ProjectCheckArgs::default(), &root);
    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("entity imports service"))
    );
}

#[test]
fn the_layers_below_a_controller_may_be_imported_freely() {
    assert!(imports::allows(Layer::Controller, Layer::Service));
    assert!(imports::allows(Layer::Service, Layer::Repository));
    assert!(imports::allows(Layer::Repository, Layer::Entity));
    assert!(!imports::allows(Layer::Service, Layer::Controller));
    assert!(!imports::allows(Layer::Entity, Layer::Repository));
}

#[test]
fn a_cycle_is_reported_once_from_its_lowest_node() {
    let mut edges: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    edges.insert("b".to_string(), ["c".to_string()].into_iter().collect());
    edges.insert("c".to_string(), ["a".to_string()].into_iter().collect());
    edges.insert("a".to_string(), ["b".to_string()].into_iter().collect());

    let cycles = imports::cycles(&edges);

    assert_eq!(cycles.len(), 1);
    assert_eq!(
        imports::render_cycle(&cycles[0]),
        "a → b → c → a".to_string()
    );
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

#[test]
fn a_controller_missing_from_its_module_is_never_loaded() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(
        &dir.join("src/UserModule.ts"),
        "export const UserModule = {\n  controllers: [],\n  entities: [],\n};\n",
    );
    write(
        &dir.join("src/controllers/ProfileController.ts"),
        "@Route.get(\"/profile\", { name: \"user.profile.read\" })\nexport class ProfileController {}\n",
    );

    let outcome = registration::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("`ProfileController`") && detail.contains("controllers"))
    );
}

#[test]
fn a_registered_class_that_no_longer_exists_is_reported() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(
        &dir.join("src/UserModule.ts"),
        "export const UserModule = {\n  controllers: [ProfileController],\n  entities: [],\n};\n",
    );

    let outcome = registration::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("no class declares any more"))
    );
}

#[test]
fn a_spread_of_another_module_registers_nothing_of_its_own() {
    let listed = registration::registered(
        "controllers: [...SharedModule.controllers, UserController],",
        "controllers",
    );

    assert_eq!(listed, ["UserController".to_string()].into_iter().collect());
}

#[test]
fn each_decorator_names_the_registry_it_belongs_to() {
    assert_eq!(
        registration::registry_of("@Route.post(\"/\", {"),
        Some("controllers")
    );
    assert_eq!(
        registration::registry_of("@Entity({ name: \"users\" })"),
        Some("entities")
    );
    assert_eq!(
        registration::registry_of("@decorator.cron()"),
        Some("cronJobs")
    );
    // A service is resolved by the container, not listed in the module.
    assert_eq!(registration::registry_of("@decorator.service()"), None);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/// A controller file, with the config the generator writes.
fn controller(dir: &Path, name: &str, method: &str, path: &str, extra: &str) {
    write(
        &dir.join(format!("src/controllers/{name}Controller.ts")),
        &format!(
            "export type {name}RouteType = {{ params: {{}} }};\n\n@Route.{method}(\"{path}\", {{\n  name: \"user.{name}.handle\",\n  description: \"The {name} route\",\n  version: 1,\n  payload: Assert({{}}),\n{extra}}})\nexport class {name}Controller {{}}\n"
        ),
    );
}

#[test]
fn a_route_config_is_parsed_past_its_nested_validators() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    controller(
        &dir,
        "Read",
        "get",
        "/users/:id",
        "  roles: [\"ROLE_USER\"],\n",
    );

    let modules = cli::commands::project_check::modules::discover_modules(&root);
    let routes = routes::collect(&root, &modules);

    assert_eq!(routes.len(), 1);
    assert_eq!(routes[0].method, "get".to_string());
    assert_eq!(routes[0].path, "/users/:id".to_string());
    assert_eq!(routes[0].name.as_deref(), Some("user.Read.handle"));
    assert_eq!(routes[0].version, Some(1));
    assert!(!routes[0].is_public());
}

#[test]
fn two_controllers_cannot_claim_one_endpoint() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    controller(&dir, "Read", "get", "/users", "  roles: [\"ROLE_USER\"],\n");
    controller(&dir, "List", "get", "/users", "  roles: [\"ROLE_USER\"],\n");

    let outcome = routes::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("`GET /v1/users` is already declared"))
    );
}

#[test]
fn a_route_without_roles_is_reported_as_open() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    controller(&dir, "Read", "get", "/users", "");

    let outcome = routes::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("it is open to anyone"))
    );
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

#[test]
fn a_column_no_migration_builds_is_reported() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(
        &dir.join("src/entities/UserEntity.ts"),
        "@Entity({ name: \"users\" })\nexport class UserEntity {\n  @PrimaryColumn({ name: \"id\", type: \"varchar\" })\n  id!: string;\n\n  @Column({ name: \"nickname\", type: \"varchar\" })\n  nickname?: string | null;\n}\n",
    );
    write(
        &dir.join("src/migrations/1700000000000-users.ts"),
        "export class Users {\n  public async up(runner) {\n    await runner.query(`CREATE TABLE \"users\" (\"id\" varchar)`);\n  }\n  public async down() {}\n}\n",
    );

    let outcome = entities::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("\"users\".\"nickname\""))
    );
}

#[test]
fn an_entity_with_no_migration_at_all_fails() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(
        &dir.join("src/entities/UserEntity.ts"),
        "@Entity({ name: \"users\" })\nexport class UserEntity {}\n",
    );

    let outcome = entities::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("no migration builds their tables"))
    );
}

#[test]
fn an_entity_is_parsed_into_its_table_and_columns() {
    let entity = entities::parse(
        "@Entity({\n  name: \"users\",\n})\nexport class UserEntity {\n  @CreateDateColumn({ name: \"created_at\" })\n  createdAt?: Date | null;\n}\n",
        "modules/user/src/entities/UserEntity.ts",
    )
    .expect("an entity");

    assert_eq!(entity.class, "UserEntity".to_string());
    assert_eq!(entity.table.as_deref(), Some("users"));
    assert_eq!(entity.columns, vec!["created_at".to_string()]);
}

// ---------------------------------------------------------------------------
// Tsconfig
// ---------------------------------------------------------------------------

#[test]
fn a_module_relaxing_a_root_strictness_flag_fails() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(&dir.join("src/index.ts"), "export const value = 1;\n");
    write(
        &dir.join("tsconfig.json"),
        "{ \"extends\": \"../../tsconfig.json\", \"compilerOptions\": { \"strict\": false } }\n",
    );

    let outcome = tsconfig::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("turns `strict` off"))
    );
}

#[test]
fn a_module_extending_nothing_inherits_nothing() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(&dir.join("src/index.ts"), "export const value = 1;\n");
    write(&dir.join("tsconfig.json"), "{ \"compilerOptions\": {} }\n");

    let outcome = tsconfig::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("extends nothing"))
    );
}

#[test]
fn tsconfig_helpers_detect_typescript_and_missing_excludes() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(
        &root.join("tsconfig.json"),
        "{ \"compilerOptions\": { \"strict\": true, \"noImplicitAny\": true, \"noUnusedParameters\": false } }\n",
    );
    write(&dir.join("src/index.ts"), "export const value = 1;\n");
    fs::create_dir_all(dir.join("dist")).expect("create dist");
    fs::create_dir_all(dir.join("node_modules")).expect("create node_modules");
    write(
        &dir.join("tsconfig.json"),
        "{ \"extends\": \"../shared/tsconfig.json\", \"exclude\": [] }\n",
    );

    assert!(tsconfig::has_typescript(&dir));
    let root_tsconfig = serde_json::json!({
        "compilerOptions": { "strict": true, "noImplicitAny": true, "noUnusedParameters": false }
    });
    assert_eq!(tsconfig::option(&root_tsconfig, "strict"), Some(true));
    assert_eq!(
        tsconfig::strict_flags(&root_tsconfig),
        vec!["strict", "noImplicitAny"]
    );

    let outcome = tsconfig::run(&ProjectCheckArgs::default(), &root);
    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("extends \"../shared/tsconfig.json\""))
    );
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("does not exclude \"dist\""))
    );
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("does not exclude \"node_modules\""))
    );
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("root tsconfig.json turns `noUnusedParameters` off"))
    );
}

#[test]
fn tsconfig_reports_invalid_root_or_module_json_and_skips_non_typescript_modules() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(&dir.join("src/index.js"), "export const value = 1;\n");
    write(&root.join("tsconfig.json"), "{ nope\n");

    assert_eq!(
        tsconfig::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Skipped
    );

    write(&dir.join("src/index.ts"), "export const value = 1;\n");
    assert_eq!(
        tsconfig::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Failed
    );

    write(
        &root.join("tsconfig.json"),
        "{ \"compilerOptions\": { \"strict\": true } }\n",
    );
    write(&dir.join("tsconfig.json"), "{ nope\n");
    let outcome = tsconfig::run(&ProjectCheckArgs::default(), &root);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("is not valid JSON"))
    );
}

// ---------------------------------------------------------------------------
// Lockfile
// ---------------------------------------------------------------------------

#[test]
fn two_package_managers_cannot_both_own_the_tree() {
    let (_guard, root) = root();
    write(
        &root.join("package.json"),
        "{ \"workspaces\": [\"modules/*\"] }\n",
    );
    write(&root.join("bun.lock"), "{}\n");
    write(&root.join("package-lock.json"), "{}\n");

    let outcome = lockfile::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("bun and npm"))
    );
}

#[test]
fn a_dependency_absent_from_the_lockfile_is_reported() {
    let (_guard, root) = root();
    write(
        &root.join("package.json"),
        "{ \"workspaces\": [\"modules/*\"], \"dependencies\": { \"left-pad\": \"^1.0.0\" } }\n",
    );
    write(
        &root.join("bun.lock"),
        "{ \"packages\": { \"right-pad\": [] } }\n",
    );

    let outcome = lockfile::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("`left-pad` is declared but absent"))
    );
}

#[test]
fn a_nested_npm_lockfile_shadows_the_workspace_one() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(&root.join("bun.lock"), "{}\n");
    write(&dir.join("bun.lock"), "{}\n");

    let outcome = lockfile::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("shadows the workspace lockfile"))
    );
}

#[test]
fn lockfile_helpers_cover_managers_and_missing_entries() {
    let (_guard, root) = root();
    write(&root.join("bun.lock"), "{}\n");

    let found = lockfile::lockfiles_in(&root);
    assert!(found.contains(&"bun.lock".to_string()));
    assert_eq!(lockfile::managers(&found), ["bun"].into_iter().collect());

    let manifest = serde_json::json!({
        "dependencies": { "left-pad": "^1.0.0" },
        "devDependencies": { "typescript": "~5.0.0" },
        "peerDependencies": { "react": "^19.0.0" }
    });
    let missing =
        lockfile::missing_from_lock(&manifest, "\"left-pad@1.0.0\"\nnode_modules/react\n");
    assert_eq!(missing, vec!["typescript".to_string()]);
}

#[test]
fn lockfile_reports_missing_root_lockfiles_and_nested_npm_locks() {
    let (_guard, root) = root();
    write(
        &root.join("package.json"),
        "{ \"workspaces\": [\"modules/*\", \"packages/*\"] }\n",
    );
    let outcome = lockfile::run(&ProjectCheckArgs::default(), &root);
    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("no npm lockfile at the root"))
    );

    write(&root.join("bun.lock"), "{}\n");
    let member_dir = root.join("packages/cli");
    write(&member_dir.join("package.json"), "{ \"name\": \"cli\" }\n");
    write(
        &member_dir.join("src/index.ts"),
        "export const run = () => {};\n",
    );
    write(&member_dir.join("bun.lock"), "{}\n");

    let outcome = lockfile::run(&ProjectCheckArgs::default(), &root);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("shadows the workspace lockfile"))
    );
}

#[test]
fn lockfile_is_skipped_without_a_manifest_or_lockfile() {
    let (_guard, root) = root();
    assert_eq!(
        lockfile::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Skipped
    );
}

#[test]
fn lockfile_run_ignores_invalid_module_manifests() {
    let (_guard, root) = root();
    write(
        &root.join("package.json"),
        "{ \"workspaces\": [\"modules/*\"] }\n",
    );
    write(&root.join("bun.lock"), "{}\n");

    let module = workspace(&root, "user", "module");
    write(&module.join("package.json"), "{ nope\n");

    let outcome = lockfile::run(&ProjectCheckArgs::default(), &root);
    assert_eq!(outcome.status, CheckStatus::Passed);
}

// ---------------------------------------------------------------------------
// Orphans
// ---------------------------------------------------------------------------

#[test]
fn a_file_nothing_imports_is_reported_but_an_entry_is_not() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(&dir.join("src/index.ts"), "export const value = 1;\n");
    write(
        &dir.join("src/helpers/format.ts"),
        "export const format = () => 1;\n",
    );

    let outcome = orphans::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(outcome.details.iter().any(
        |detail| detail.contains("src/helpers/format.ts") && detail.contains("nothing imports")
    ));
    assert!(
        !outcome
            .details
            .iter()
            .any(|detail| detail.contains("src/index.ts"))
    );
}

#[test]
fn a_design_module_publishes_its_components_rather_than_orphaning_them() {
    let (_guard, root) = root();
    let dir = workspace(&root, "design", "design");
    write(
        &dir.join("src/components/button/Button.tsx"),
        "export const Button = () => null;\n",
    );

    assert_eq!(
        orphans::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Passed
    );
}

// ---------------------------------------------------------------------------
// Complexity
// ---------------------------------------------------------------------------

#[test]
fn a_long_parameter_list_is_over_budget() {
    let overruns = complexity::inspect(
        "export const send = (a: string, b: Map<string, number>, c: number, d: number, e: number, f: number) => {\n  return a;\n};\n",
        false,
    );

    assert_eq!(overruns.len(), 1);
    assert_eq!(overruns[0].rule, "complexity.parameters");
    assert!(overruns[0].message.contains("`send` takes 6 parameters"));
}

#[test]
fn a_generic_parameter_is_not_two_parameters() {
    assert_eq!(
        complexity::parameter_count("a: Map<string, number>, b: number"),
        2
    );
    assert_eq!(complexity::parameter_count(""), 0);
}

#[test]
fn markup_is_measured_on_its_length_rather_than_its_shape() {
    let deep = format!(
        "export const Icon = () => {{\n{}\n{}\n}};\n",
        "  <svg>{".repeat(8),
        "  }</svg>".repeat(8)
    );

    // The same body is over the nesting budget as logic and within it as markup.
    assert!(
        complexity::inspect(&deep, false)
            .iter()
            .any(|overrun| overrun.rule == "complexity.nesting")
    );
    assert!(
        !complexity::inspect(&deep, true)
            .iter()
            .any(|overrun| overrun.rule == "complexity.nesting")
    );
}

#[test]
fn a_declaration_keyword_is_never_read_as_the_function_name() {
    let (name, parameters) =
        complexity::function_signature("export const load = async (id: string) => {")
            .expect("a signature");

    assert_eq!(name, "load".to_string());
    assert_eq!(parameters, "id: string".to_string());
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

#[test]
fn a_component_without_a_story_is_reported() {
    let (_guard, root) = root();
    let design = workspace(&root, "design", "design");
    write(
        &design.join("src/components/button/Button.tsx"),
        "export const Button = () => null;\n",
    );
    write(
        &design.join("src/components/card/Card.tsx"),
        "export const Card = () => null;\n",
    );

    let storybook = root.join("modules/storybook");
    write(&storybook.join("storybook.yml"), "type: \"storybook\"\n");
    write(
        &storybook.join("package.json"),
        "{ \"name\": \"storybook\" }\n",
    );
    write(
        &storybook.join("src/features/button/Button.stories.tsx"),
        "import { Button } from \"@module/design/components/button/Button\";\nexport const meta = { title: \"Button\", component: Button };\n",
    );

    let outcome = stories::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("`Card`") && detail.contains("has no story"))
    );
    assert!(
        !outcome
            .details
            .iter()
            .any(|detail| detail.contains("`Button`"))
    );
}

#[test]
fn a_part_of_a_compound_component_is_documented_by_its_whole() {
    let told: BTreeSet<String> = ["Accordion".to_string()].into_iter().collect();

    assert!(stories::is_documented("Accordion", &told));
    assert!(stories::is_documented("AccordionTrigger", &told));
    assert!(!stories::is_documented("Card", &told));
}

// ---------------------------------------------------------------------------
// SDK
// ---------------------------------------------------------------------------

#[test]
fn a_route_the_sdk_does_not_wrap_is_reported() {
    let (_guard, root) = root();
    let app = workspace(&root, "app", "api");
    controller(&app, "Read", "get", "/users", "  roles: [\"ROLE_USER\"],\n");

    let sdk = root.join("modules/sdk");
    write(&sdk.join("sdk.yml"), "type: \"sdk\"\ntarget: \"app\"\n");
    write(&sdk.join("package.json"), "{ \"name\": \"sdk\" }\n");
    write(&sdk.join("src/index.ts"), "export const sdk = {};\n");

    let outcome = sdk::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("the SDK has no method for it"))
    );
}

#[test]
fn an_sdk_targeting_a_deleted_module_fails() {
    let (_guard, root) = root();
    write(
        &root.join("package.json"),
        "{ \"workspaces\": [\"modules/*\"] }\n",
    );
    let sdk = root.join("modules/sdk");
    write(&sdk.join("sdk.yml"), "type: \"sdk\"\ntarget: \"gone\"\n");
    write(&sdk.join("package.json"), "{ \"name\": \"sdk\" }\n");

    let outcome = sdk::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("not a module any more"))
    );
}

#[test]
fn an_sdk_without_a_target_or_with_a_target_without_routes_is_reported() {
    let (_guard, root) = root();
    let sdk_dir = root.join("modules/sdk");
    write(
        &root.join("package.json"),
        "{ \"workspaces\": [\"modules/*\"] }\n",
    );
    write(&sdk_dir.join("sdk.yml"), "type: \"sdk\"\n");
    write(&sdk_dir.join("package.json"), "{ \"name\": \"sdk\" }\n");
    let outcome = sdk::run(&ProjectCheckArgs::default(), &root);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("declares no `target:`"))
    );

    let app = workspace(&root, "app", "api");
    write(
        &sdk_dir.join("sdk.yml"),
        "type: \"sdk\"\ntarget: \"app\" # comment\n",
    );
    write(&sdk_dir.join("src/index.ts"), "export const sdk = {};\n");
    write(
        &app.join("src/services/UserService.ts"),
        "export class UserService {}\n",
    );

    assert_eq!(
        sdk::target_of(&cli::commands::project_check::modules::WorkspaceModule {
            name: "sdk".to_string(),
            group: "modules".to_string(),
            kind: Some("sdk".to_string()),
            dir: sdk_dir.clone(),
        }),
        Some("app".to_string())
    );

    let outcome = sdk::run(&ProjectCheckArgs::default(), &root);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("declares no route to wrap"))
    );
}

/// Mode `0o000` is the only portable way to make a file unreadable, and it
/// has no Windows equivalent.
#[cfg(unix)]
#[test]
fn sdk_surface_skips_unreadable_files_and_ignores_unnamed_routes() {
    use std::os::unix::fs::PermissionsExt;

    let (_guard, root) = root();
    let sdk_dir = root.join("modules/sdk");
    fs::create_dir_all(sdk_dir.join("src")).expect("create src");
    write(&sdk_dir.join("sdk.yml"), "type: \"sdk\"\ntarget: \"app\"\n");
    write(&sdk_dir.join("package.json"), "{ \"name\": \"sdk\" }\n");
    write(&sdk_dir.join("src/index.ts"), "export const sdk = {};\n");
    let unreadable = sdk_dir.join("src/secret.ts");
    write(&unreadable, "export const nope = 1;\n");
    let mut permissions = fs::metadata(&unreadable).expect("metadata").permissions();
    permissions.set_mode(0o000);
    fs::set_permissions(&unreadable, permissions).expect("chmod");

    let surface = sdk::surface(&cli::commands::project_check::modules::WorkspaceModule {
        name: "sdk".to_string(),
        group: "modules".to_string(),
        kind: Some("sdk".to_string()),
        dir: sdk_dir,
    });
    assert!(surface.keys.is_empty());

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    sdk::inspect(
        "modules/sdk",
        "app",
        &surface,
        &[cli::commands::project_check::routes::Route {
            method: "get".to_string(),
            path: "/users".to_string(),
            name: None,
            description: None,
            version: Some(1),
            version_raw: Some("1".to_string()),
            roles: Vec::new(),
            declares_roles: false,
            file: "controller.ts".to_string(),
        }],
        &mut errors,
        &mut warnings,
    );
    assert!(errors.is_empty());
}

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

#[test]
fn a_shipped_source_map_fails_the_bundle_check() {
    let (_guard, root) = root();
    let dir = workspace(&root, "spa", "spa");
    write(&dir.join("dist/assets/index.js"), "console.log(1);\n");
    write(&dir.join("dist/assets/index.js.map"), "{}\n");

    let outcome = bundle::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("a source map is shipped"))
    );
}

#[test]
fn a_module_that_was_never_built_is_skipped() {
    let (_guard, root) = root();
    workspace(&root, "spa", "spa");

    assert_eq!(
        bundle::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Skipped
    );
}

// ---------------------------------------------------------------------------
// Outdated
// ---------------------------------------------------------------------------

#[test]
fn a_range_is_reduced_to_the_version_it_starts_at() {
    assert_eq!(outdated::floor("^1.2.3"), Some("1.2.3".to_string()));
    assert_eq!(outdated::floor(">=2.0 <3"), Some("2.0".to_string()));
    assert_eq!(outdated::floor("~0.4"), Some("0.4".to_string()));
    // Nothing to compare a workspace or path dependency against.
    assert_eq!(outdated::floor("workspace:*"), None);
    assert_eq!(outdated::floor("*"), None);
}

#[test]
fn the_outdated_check_skips_when_nothing_is_pinned_and_fetch_all_handles_empty_sets() {
    let (_guard, root) = root();
    write(
        &root.join("package.json"),
        "{ \"workspaces\": [\"modules/*\"], \"dependencies\": { \"shared\": \"workspace:*\" } }\n",
    );

    assert!(outdated::fetch_all(&[]).is_empty());
    assert_eq!(
        outdated::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Skipped
    );
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

#[test]
fn queries_skip_without_frontend_modules_or_hooks_and_report_real_usage() {
    let (_guard, root) = root();
    assert_eq!(
        queries::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Skipped
    );

    let spa = workspace(&root, "web", "spa");
    write(
        &spa.join("src/features/user/Profile.tsx"),
        "export const Profile = () => null;\n",
    );
    assert_eq!(
        queries::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Skipped
    );

    write(
        &spa.join("src/features/user/Profile.tsx"),
        "export const useProfile = () => useQuery({ queryKey: ['profile'], queryFn: getProfile });\nexport const useSaveProfile = () => useMutation({ mutationFn: saveProfile, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }) });\n",
    );
    let outcome = queries::run(&ProjectCheckArgs::default(), &root);
    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(outcome.summary.contains("1 query"));
    assert!(outcome.summary.contains("1 mutation"));
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("key factory"))
    );
}

#[test]
fn only_a_major_gap_counts_as_behind() {
    assert_eq!(outdated::majors_behind("1.9.0", "3.0.1"), 2);
    assert_eq!(outdated::majors_behind("2.1.0", "2.9.9"), 0);
    assert!(outdated::is_behind("2.1.0", "2.9.9"));
    assert!(!outdated::is_behind("3.0.0", "3.0.0"));
}

#[test]
fn each_registry_reads_its_own_response_shape() {
    let npm = serde_json::json!({ "version": "1.2.3" });

    assert_eq!(
        outdated::Registry::Npm.latest(&npm),
        Some("1.2.3".to_string())
    );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

#[test]
fn validation_detects_typed_sections_without_schemas_and_skips_when_no_contract_exists() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(
        &dir.join("src/controllers/UserController.ts"),
        "export class UserController {}\n",
    );
    assert_eq!(
        validation::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Skipped
    );

    write(
        &dir.join("src/controllers/UserController.ts"),
        "export type UserRouteType = { queries: { page: number } };\n@Route.get(\"/users\", { name: \"user.read\", roles: [\"ROLE_USER\"] })\nexport class UserController {}\n",
    );
    let outcome = validation::run(&ProjectCheckArgs::default(), &root);
    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("`queries` is typed but the route asserts no schema"))
    );
}

/// Mode `0o000` is the only portable way to make a file unreadable, and it
/// has no Windows equivalent.
#[cfg(unix)]
#[test]
fn validation_skips_unreadable_controller_files() {
    use std::os::unix::fs::PermissionsExt;

    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    let controller = dir.join("src/controllers/UserController.ts");
    write(
        &controller,
        "export type UserRouteType = { params: { id: string } };\n@Route.get(\"/users/:id\", { params: Assert({ id: 'string' }) })\nexport class UserController {}\n",
    );
    let mut permissions = fs::metadata(&controller).expect("metadata").permissions();
    permissions.set_mode(0o000);
    fs::set_permissions(&controller, permissions).expect("chmod");

    assert_eq!(
        validation::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Skipped
    );
}

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

#[test]
fn exceptions_skip_migrations_and_seeds_and_can_report_no_checked_source() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(
        &dir.join("src/migrations/1700000000000-users.ts"),
        "throw new Error('nope');\n",
    );
    write(
        &dir.join("src/seeds/users.ts"),
        "throw { reason: 'nope' };\n",
    );

    assert_eq!(
        exceptions::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Skipped
    );
}

#[test]
fn exceptions_ignore_real_exception_classes_and_unbalanced_catches() {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    exceptions::inspect(
        "export class UserNotFoundException extends Exception {}\ntry { run(); } catch (error) {\n",
        "a.ts",
        &mut errors,
        &mut warnings,
    );

    assert!(errors.is_empty());
    assert!(warnings.is_empty());
}

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

#[test]
fn boundaries_warn_on_design_dependencies_and_skip_singletons() {
    let (_guard, root) = root();
    let design = workspace(&root, "design", "design");
    write(
        &design.join("src/index.ts"),
        "import { app } from \"@module/app/index\";\nexport const design = app;\n",
    );
    assert_eq!(
        boundaries::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Skipped
    );

    let app = workspace(&root, "app", "spa");
    write(&app.join("src/index.ts"), "export const app = 1;\n");
    let outcome = boundaries::run(&ProjectCheckArgs::default(), &root);
    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("design module depends on a spa"))
    );
}

#[test]
fn boundary_verdicts_cover_storybooks_sdks_and_unknown_types() {
    assert_eq!(
        boundaries::runtime_of(Some("sdk")),
        boundaries::Runtime::Shared
    );
    assert_eq!(boundaries::runtime_of(None), boundaries::Runtime::Unknown);
    assert!(
        boundaries::verdict(Some("storybook"), Some("spa"))
            .expect("warning")
            .1
            .contains("documents a design module")
    );
    assert!(
        boundaries::verdict(Some("sdk"), Some("module"))
            .expect("warning")
            .1
            .contains("should not import a module")
    );
    assert_eq!(boundaries::verdict(None, Some("spa")), None);
    assert_eq!(boundaries::verdict(Some("spa"), Some("spa")), None);
}

#[test]
fn boundaries_inspect_ignores_unknown_or_allowed_crossings() {
    let index = cli::commands::project_check::graph::SourceIndex {
        files: vec![
            cli::commands::project_check::graph::IndexedFile {
                path: PathBuf::from("modules/spa/src/a.ts"),
                label: "modules/spa/src/a.ts".to_string(),
                module: "spa".to_string(),
                group: "modules".to_string(),
                kind: Some("spa".to_string()),
                layer: Layer::Other,
                imports: vec![
                    cli::commands::project_check::graph::Import {
                        specifier: "@module/unknown/x".to_string(),
                        resolved: None,
                        module: Some("unknown".to_string()),
                        names: BTreeSet::new(),
                        type_only: false,
                    },
                    cli::commands::project_check::graph::Import {
                        specifier: "@module/design/x".to_string(),
                        resolved: None,
                        module: Some("design".to_string()),
                        names: BTreeSet::new(),
                        type_only: false,
                    },
                ],
                exports: BTreeSet::new(),
                reexports: false,
                lines: 1,
            },
            cli::commands::project_check::graph::IndexedFile {
                path: PathBuf::from("modules/design/src/a.ts"),
                label: "modules/design/src/a.ts".to_string(),
                module: "design".to_string(),
                group: "modules".to_string(),
                kind: Some("design".to_string()),
                layer: Layer::Other,
                imports: Vec::new(),
                exports: BTreeSet::new(),
                reexports: false,
                lines: 1,
            },
        ],
        aliases: BTreeMap::new(),
    };
    let modules = vec![
        cli::commands::project_check::modules::WorkspaceModule {
            name: "spa".to_string(),
            group: "modules".to_string(),
            kind: Some("spa".to_string()),
            dir: PathBuf::from("modules/spa"),
        },
        cli::commands::project_check::modules::WorkspaceModule {
            name: "design".to_string(),
            group: "modules".to_string(),
            kind: Some("design".to_string()),
            dir: PathBuf::from("modules/design"),
        },
    ];
    let (errors, warnings, count) = boundaries::inspect(&index, &modules);
    assert!(errors.is_empty());
    assert!(warnings.is_empty());
    assert_eq!(count, 2);
}

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

#[test]
fn secrets_run_warns_in_fixtures_and_skips_empty_trees() {
    let (_guard, root) = root();
    assert_eq!(
        secrets::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Skipped
    );

    write(
        &root.join("tests/fixture.spec.ts"),
        "export const token = 'ghp_abcdefghijklmnopqrstuvwxyz1234567890';\n",
    );
    let outcome = secrets::run(&ProjectCheckArgs::default(), &root);
    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("expected in a fixture"))
    );
}

/// Mode `0o000` is the only portable way to make a file unreadable, and it
/// has no Windows equivalent.
#[cfg(unix)]
#[test]
fn secrets_run_reports_real_secrets_and_skips_unreadable_files() {
    use std::os::unix::fs::PermissionsExt;

    let (_guard, root) = root();
    assert!(secrets::is_secret_file("id_rsa"));
    let src = root.join("src");
    fs::create_dir_all(&src).expect("create src");
    write(
        &src.join("secrets.ts"),
        "export const token = 'ghp_abcdefghijklmnopqrstuvwxyz1234567890';\n",
    );
    let unreadable = src.join("hidden.ts");
    write(&unreadable, "export const x = 1;\n");
    let mut permissions = fs::metadata(&unreadable).expect("metadata").permissions();
    permissions.set_mode(0o000);
    fs::set_permissions(&unreadable, permissions).expect("chmod");

    let outcome = secrets::run(&ProjectCheckArgs::default(), &root);
    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("hardcoded credential"))
    );
}

#[test]
fn real_secret_files_tracked_by_git_fail_the_check() {
    let (_guard, root) = root();
    std::process::Command::new("git")
        .arg("init")
        .current_dir(&root)
        .output()
        .expect("git init");
    write(&root.join(".env"), "API_KEY=secret\n");
    std::process::Command::new("git")
        .args(["add", ".env"])
        .current_dir(&root)
        .output()
        .expect("git add");

    let outcome = secrets::run(&ProjectCheckArgs::default(), &root);
    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains(".env is tracked by git"))
    );
}

#[test]
fn bare_git_repositories_do_not_crash_the_secrets_check() {
    let (_guard, root) = root();
    std::process::Command::new("git")
        .args(["init", "--bare"])
        .current_dir(&root)
        .output()
        .expect("git init --bare");

    let outcome = secrets::run(&ProjectCheckArgs::default(), &root);
    assert_eq!(outcome.status, CheckStatus::Skipped);
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

#[test]
fn transactions_skip_non_backend_workspaces_and_warn_on_multi_write_services() {
    let (_guard, root) = root();
    workspace(&root, "web", "spa");
    assert_eq!(
        transactions::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Skipped
    );

    let dir = workspace(&root, "user", "module");
    write(
        &dir.join("src/services/UserService.ts"),
        "export class UserService {\n  public async sync(): Promise<void> {\n    await this.repository.create({});\n    await this.repository.decrement({}, 'count', 1);\n  }\n}\n",
    );
    let outcome = transactions::run(&ProjectCheckArgs::default(), &root);
    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("writes 2 times outside a transaction"))
    );
}

#[test]
fn transactions_skip_when_backend_has_only_exempt_or_unbalanced_sources() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(
        &dir.join("src/repositories/UserRepository.ts"),
        "export class UserRepository {\n  public async save(): Promise<void> {\n    await this.repository.save({});\n    await this.repository.save({});\n  }\n}\n",
    );
    assert_eq!(
        transactions::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Skipped
    );

    let broken = "public async save(order: OrderEntity): Promise<void> ";
    assert!(transactions::inspect(broken, "a.ts").is_empty());
    let unbalanced = "public async save(order: OrderEntity): Promise<void> { await repo.save({});";
    assert!(transactions::inspect(unbalanced, "a.ts").is_empty());
}

// ---------------------------------------------------------------------------
// Translations — key usage
// ---------------------------------------------------------------------------

#[test]
fn a_key_looked_up_but_never_defined_fails_the_translations_check() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(
        &dir.join("src/translations.yml"),
        "welcome:\n  en: \"Welcome\"\n",
    );
    write(
        &dir.join("src/features/Profile.tsx"),
        "export const Profile = () => trans(\"welcome\") + trans(\"user.missing\");\n",
    );

    let outcome = translations::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("`user.missing` is looked up"))
    );
}

#[test]
fn a_key_defined_by_another_features_dictionary_does_not_excuse_the_lookup() {
    let (_guard, root) = root();
    let dir = workspace(&root, "app", "spa");
    write(
        &dir.join("src/features/cart/translations/translations.json"),
        "{ \"title\": { \"en\": \"Cart\" } }\n",
    );
    write(
        &dir.join("src/features/user/translations/translations.json"),
        "{ \"name\": { \"en\": \"Name\" } }\n",
    );
    write(
        &dir.join("src/features/user/Profile.tsx"),
        "export const Profile = () => trans(\"name\") + trans(\"title\");\n",
    );

    let outcome = translations::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("`title` is looked up in its scope")),
        "{:?}",
        outcome.details
    );
}

#[test]
fn a_key_built_at_runtime_suspends_the_unused_check() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(
        &dir.join("src/translations.yml"),
        "welcome:\n  en: \"Welcome\"\n",
    );
    write(
        &dir.join("src/Menu.tsx"),
        "export const Menu = (id: string) => trans(`nav.${id}`);\n",
    );

    let outcome = translations::run(&ProjectCheckArgs::default(), &root);

    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("unused keys not checked")),
        "{:?}",
        outcome.details
    );
    assert!(
        !outcome
            .details
            .iter()
            .any(|detail| detail.contains("never looked up")),
        "{:?}",
        outcome.details
    );
}

#[test]
fn a_has_probe_proves_a_key_is_reached_without_demanding_it_exists() {
    let usage = translations::scan_usage(
        "cache.has(\"user.cached\"); t.trans(\"user.name\"); t.has(\"user.subtitle\");",
    );

    assert_eq!(
        usage.lookups,
        ["user.name".to_string()].into_iter().collect()
    );
    assert!(usage.probes.contains("user.subtitle"));
    assert!(!usage.dynamic);
}

#[test]
fn the_plumbing_that_binds_a_dictionary_is_not_read_as_usage() {
    let usage = translations::scan_usage(
        "import { has, trans } from \"@talosjs/utils/trans\";\nexport const useTranslate = () => trans(dict as TransDictType, key, { lang });\n",
    );

    assert_eq!(usage, translations::Usage::default());
}

#[test]
fn a_dictionary_scopes_to_its_feature_rather_than_its_translations_folder() {
    assert_eq!(
        translations::dictionary_scope(Path::new(
            "/repo/modules/app/src/features/user/translations/translations.json"
        )),
        Some(PathBuf::from("/repo/modules/app/src/features/user"))
    );
    assert_eq!(
        translations::dictionary_scope(Path::new("/repo/modules/user/src/translations.yml")),
        Some(PathBuf::from("/repo/modules/user/src"))
    );
}

#[test]
fn only_the_plural_siblings_trans_selects_are_excused_as_used() {
    assert_eq!(
        translations::plural_base("cart.items_plural"),
        Some("cart.items")
    );
    assert_eq!(
        translations::plural_base("cart.items_zero"),
        Some("cart.items")
    );
    assert_eq!(translations::plural_base("cart.items_many"), None);
}

#[test]
fn a_pluralized_entry_is_used_through_its_base_key() {
    let used: BTreeSet<String> = ["cart.items".to_string()].into_iter().collect();
    let mut dictionary = translations::Dictionary::new();
    dictionary.insert("cart.items".to_string(), BTreeMap::new());
    dictionary.insert("cart.items_plural".to_string(), BTreeMap::new());
    dictionary.insert("cart.empty".to_string(), BTreeMap::new());

    assert_eq!(
        translations::unused_keys(&dictionary, &used),
        vec!["cart.empty".to_string()]
    );
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/// A deployed service: the module, its `App` config, and the probe its image
/// declares. `probe` of `None` writes a Dockerfile with no HEALTHCHECK.
fn service(
    root: &Path,
    name: &str,
    kind: &str,
    prefix: Option<&str>,
    probe: Option<&str>,
) -> PathBuf {
    let dir = workspace(root, name, kind);
    write(
        &dir.join("src/index.ts"),
        &format!(
            "const app = new App({{\n  routing: {{\n    prefix: \"{}\",\n  }},\n}});\n",
            prefix.unwrap_or("")
        ),
    );
    let healthcheck = probe.map_or_else(String::new, |path| {
        format!(
            "HEALTHCHECK --interval=30s \\\n  CMD [\"bun\", \"-e\", \"fetch(`http://127.0.0.1:${{process.env.PORT||3500}}{path}`)\"]\n"
        )
    });
    write(
        &dir.join("Dockerfile"),
        &format!("FROM oven/bun:1\n\n{healthcheck}"),
    );
    dir
}

fn health_controller(dir: &Path, method: &str, path: &str, roles: &str) {
    write(
        &dir.join("src/controllers/HealthcheckController.ts"),
        &format!(
            "@Route.{method}(\"{path}\", {{\n  name: \"app.health.read\",\n  description: \"Liveness probe\",\n  version: 1,\n  roles: [{roles}],\n}})\nexport class HealthcheckController {{}}\n"
        ),
    );
}

#[test]
fn a_service_with_no_health_controller_fails_the_health_check() {
    let (_guard, root) = root();
    service(&root, "app", "api", Some("api"), Some("/healthcheck"));

    let outcome = health::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("no controller declares a health route")),
        "{:?}",
        outcome.details
    );
}

#[test]
fn a_probe_that_misses_the_mounted_path_fails_the_health_check() {
    let (_guard, root) = root();
    let dir = service(&root, "app", "api", Some("api"), Some("/healthcheck"));
    health_controller(&dir, "get", "/healthcheck", "");

    let outcome = health::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome.details.iter().any(|detail| detail.contains(
            "probes `/healthcheck` but the health route is served at `/api/v1/healthcheck`"
        )),
        "{:?}",
        outcome.details
    );
}

#[test]
fn a_probe_reaching_the_mounted_path_passes_the_health_check() {
    let (_guard, root) = root();
    let dir = service(
        &root,
        "service",
        "microservice",
        None,
        Some("/v1/healthcheck"),
    );
    health_controller(&dir, "get", "/healthcheck", "");

    assert_eq!(
        health::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Passed
    );
}

#[test]
fn a_guarded_or_non_get_health_route_fails_the_health_check() {
    let (_guard, root) = root();
    let dir = service(&root, "app", "api", None, Some("/v1/health"));
    health_controller(&dir, "post", "/health", "\"ADMIN\"");

    let outcome = health::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("a probe issues a GET")),
        "{:?}",
        outcome.details
    );
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("guards on `ADMIN`")),
        "{:?}",
        outcome.details
    );
}

#[test]
fn an_image_declaring_no_healthcheck_warns() {
    let (_guard, root) = root();
    let dir = service(&root, "app", "api", None, None);
    health_controller(&dir, "get", "/healthcheck", "");

    let outcome = health::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("declares no HEALTHCHECK")),
        "{:?}",
        outcome.details
    );
}

#[test]
fn a_service_with_no_image_is_reported_once() {
    let (_guard, root) = root();
    let dir = workspace(&root, "app", "api");
    health_controller(&dir, "get", "/healthcheck", "");

    let outcome = health::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Warned);
    assert_eq!(
        outcome
            .details
            .iter()
            .filter(|detail| detail.contains("Dockerfile"))
            .count(),
        1,
        "{:?}",
        outcome.details
    );
}

#[test]
fn only_services_are_probed() {
    let (_guard, root) = root();
    workspace(&root, "shared", "module");
    workspace(&root, "spa", "spa");

    assert_eq!(
        health::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Skipped
    );
}

#[test]
fn the_generated_dockerfile_probe_is_read_out_of_its_fetch() {
    let dockerfile = "FROM oven/bun:1\nHEALTHCHECK --interval=30s --timeout=5s --retries=3 \\\n  CMD [\"bun\", \"-e\", \"fetch(`http://127.0.0.1:${process.env.PORT||3500}/healthcheck`).then(()=>process.exit(0))\"]\n";

    assert_eq!(
        health::probed_path(dockerfile),
        Some("/healthcheck".to_string())
    );
    assert_eq!(
        health::probed_path("FROM oven/bun:1\nCMD [\"bun\"]\n"),
        None
    );
}

#[test]
fn the_routing_prefix_decides_where_a_route_is_mounted() {
    assert_eq!(
        health::routing_prefix("new App({ routing: { prefix: \"/api/\" }, loggers: [] })"),
        Some("api".to_string())
    );
    assert_eq!(
        health::routing_prefix("new App({ routing: { prefix: \"\" } })"),
        None
    );
    assert_eq!(
        health::mounted_path(Some("api"), 2, "/healthcheck"),
        "/api/v2/healthcheck"
    );
    assert_eq!(health::mounted_path(None, 1, "/health"), "/v1/health");
}

#[test]
fn the_conventional_probe_paths_are_recognised() {
    assert!(health::is_health_path("/healthcheck"));
    assert!(health::is_health_path("/healthz"));
    assert!(health::is_health_path("/readyz"));
    assert!(!health::is_health_path("/users"));
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

#[test]
fn an_injected_class_that_nothing_binds_fails_the_container_check() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(
        &dir.join("src/services/MailerService.ts"),
        "export class MailerService {}\n",
    );
    write(
        &dir.join("src/services/UserService.ts"),
        "import { MailerService } from \"./MailerService\";\n\n@decorator.service()\nexport class UserService {\n  public constructor(@inject(MailerService) private readonly mailer: MailerService) {}\n}\n",
    );

    let outcome = container::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("`MailerService` is injected but no decorator binds it"))
    );
}

#[test]
fn a_decorated_class_satisfies_the_injection() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(
        &dir.join("src/services/MailerService.ts"),
        "@decorator.service()\nexport class MailerService {}\n",
    );
    write(
        &dir.join("src/services/UserService.ts"),
        "import { MailerService } from \"./MailerService\";\n\n@decorator.service()\nexport class UserService {\n  public constructor(@inject(MailerService) private readonly mailer: MailerService) {}\n}\n",
    );

    assert_eq!(
        container::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Passed
    );
}

#[test]
fn a_framework_token_is_left_to_the_framework() {
    // A string token and a class imported from a package are both bound
    // somewhere the workspace cannot see.
    let injected = container::injected(
        "@inject(\"database\") private readonly database: ITypeormDatabase,\n@inject(AppEnv) private readonly env: AppEnv,\n",
    );

    assert_eq!(injected.len(), 1);
    assert_eq!(injected[0].1, "AppEnv".to_string());
}

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

#[test]
fn a_browser_module_importing_a_server_one_fails() {
    let (_guard, root) = root();
    let spa = workspace(&root, "spa", "spa");
    let api = root.join("modules/api");
    write(&api.join("api.yml"), "type: \"api\"\n");
    write(&api.join("package.json"), "{ \"name\": \"api\" }\n");
    write(
        &api.join("src/services/UserService.ts"),
        "export class UserService {}\n",
    );
    write(
        &root.join("tsconfig.json"),
        "{ \"compilerOptions\": { \"paths\": { \"@module/api/*\": [\"./modules/api/src/*\"] } } }\n",
    );
    write(
        &spa.join("src/features/Profile.tsx"),
        "import { UserService } from \"@module/api/services/UserService\";\nexport const Profile = () => UserService;\n",
    );

    let outcome = boundaries::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("server code would ship to the browser"))
    );
}

#[test]
fn the_runtime_of_a_module_decides_how_bad_a_crossing_is() {
    // Crossing the runtime is an error; the architectural rules only warn.
    assert!(matches!(
        boundaries::verdict(Some("spa"), Some("microservice")),
        Some((true, _))
    ));
    assert!(matches!(
        boundaries::verdict(Some("api"), Some("design")),
        Some((true, _))
    ));
    assert!(matches!(
        boundaries::verdict(Some("design"), Some("spa")),
        Some((false, _))
    ));
    // A browser module reaching the server through the sdk is the way it works.
    assert_eq!(boundaries::verdict(Some("spa"), Some("sdk")), None);
    assert_eq!(boundaries::verdict(Some("spa"), Some("design")), None);
}

// ---------------------------------------------------------------------------
// Restricted
// ---------------------------------------------------------------------------

#[test]
fn a_server_runtime_in_a_browser_module_fails() {
    let (_guard, root) = root();
    let dir = workspace(&root, "spa", "spa");
    write(
        &dir.join("src/features/Config.ts"),
        "import { readFile } from \"node:fs/promises\";\nexport const load = () => readFile;\n",
    );

    let outcome = restricted::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("does not exist in a browser"))
    );
}

#[test]
fn a_replaced_package_is_reported_with_what_answers_it() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(
        &dir.join("src/services/DateService.ts"),
        "import moment from \"moment\";\nexport class DateService {}\n",
    );

    let outcome = restricted::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("@talosjs/hour-utils"))
    );
}

#[test]
fn a_server_runtime_prefix_is_recognised_but_a_package_is_not() {
    assert_eq!(restricted::server_runtime("node:fs"), Some("node:"));
    assert_eq!(restricted::server_runtime("bun:sqlite"), Some("bun:"));
    assert_eq!(restricted::server_runtime("react"), None);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

#[test]
fn a_typed_field_with_no_assertion_is_unvalidated() {
    let contract = validation::parse(
        "export type ReadRouteType = {\n  params: {\n    id: string,\n  },\n  payload: {\n    email: string,\n  },\n  queries: {},\n};\n\n@Route.post(\"/users/:id\", {\n  name: \"user.read\",\n  params: {\n    id: Assert(\"string\"),\n  },\n  payload: Assert({\n  }),\n  queries: Assert({}),\n})\nexport class ReadController {}\n",
    )
    .expect("a contract");

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    validation::inspect("controller.ts", &contract, &mut errors, &mut warnings);

    assert_eq!(
        errors,
        vec!["controller.ts: `payload.email` is typed but never validated".to_string()]
    );
    assert!(warnings.is_empty());
}

#[test]
fn a_commented_out_assertion_does_not_count_as_one() {
    let keys = validation::keys(&validation::strip_comments(
        "\n  // id: Assert(\"string\"),\n  email: Assert(\"string\"),\n",
    ));

    assert_eq!(keys, ["email".to_string()].into_iter().collect());
}

#[test]
fn a_nested_shape_is_one_field_rather_than_its_parts() {
    let keys = validation::keys("address: { street: string, city: string }, email: string");

    assert_eq!(
        keys,
        ["address".to_string(), "email".to_string()]
            .into_iter()
            .collect()
    );
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

#[test]
fn a_route_guarding_on_an_undeclared_role_fails() {
    let (_guard, root) = root();
    let dir = workspace(&root, "app", "api");
    write(
        &dir.join("roles.yml"),
        "roles:\n  USER: ROLE_USER\nhierarchy:\n  ROLE_USER:\n    description: Standard user\n",
    );
    controller(
        &dir,
        "Read",
        "get",
        "/users",
        "  roles: [\"ROLE_ADMIN\"],\n",
    );

    let outcome = roles::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("guards on `ROLE_ADMIN`"))
    );
}

#[test]
fn a_declared_role_no_route_guards_passes() {
    let (_guard, root) = root();
    let dir = workspace(&root, "app", "api");
    write(
        &dir.join("roles.yml"),
        "roles:\n  USER: ROLE_USER\n  ADMIN: ROLE_ADMIN\nhierarchy:\n  ROLE_USER:\n    description: Standard user\n  ROLE_ADMIN:\n    description: Administrator\n",
    );
    controller(&dir, "Read", "get", "/users", "  roles: [\"ROLE_USER\"],\n");

    let outcome = roles::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Passed);
    assert!(
        !outcome
            .details
            .iter()
            .any(|detail| detail.contains("ROLE_ADMIN"))
    );
}

#[test]
fn a_hierarchy_inheriting_an_unknown_role_fails() {
    let roles = roles::parse(
        "roles:\n  USER: ROLE_USER\nhierarchy:\n  ROLE_USER:\n    inherits:\n      - ROLE_GHOST\n",
    )
    .expect("a roles file");

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    roles::inspect("roles.yml", &roles, &mut errors, &mut warnings);

    assert!(
        errors
            .iter()
            .any(|error| error.contains("inherits `ROLE_GHOST`"))
    );
    assert!(warnings.is_empty());
}

#[test]
fn an_inheritance_loop_is_reported() {
    let roles = roles::parse(
        "roles:\n  A: ROLE_A\n  B: ROLE_B\nhierarchy:\n  ROLE_A:\n    inherits:\n      - ROLE_B\n  ROLE_B:\n    inherits:\n      - ROLE_A\n",
    )
    .expect("a roles file");

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    roles::inspect("roles.yml", &roles, &mut errors, &mut warnings);

    assert!(errors.iter().any(|error| error.contains("hierarchy loops")));
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

#[test]
fn a_value_interpolated_into_a_query_fails() {
    let (_guard, root) = root();
    let dir = workspace(&root, "user", "module");
    write(
        &dir.join("src/repositories/UserRepository.ts"),
        "export class UserRepository {\n  public async find(email: string) {\n    return this.database.query(`SELECT * FROM users WHERE email = '${email}'`);\n  }\n}\n",
    );

    let outcome = sql::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("`${email}` is interpolated into a query"))
    );
}

#[test]
fn a_constant_table_name_is_not_an_injection() {
    assert!(sql::is_value("email"));
    assert!(sql::is_value("criteria.id"));
    // A name the code owns, written as a constant.
    assert!(!sql::is_value("TABLE_NAME"));
    assert!(!sql::is_value("SCHEMA_2"));
}

#[test]
fn only_a_line_that_reads_as_sql_is_scanned() {
    assert!(sql::is_query("await runner.query(`ALTER TABLE users`)"));
    assert!(!sql::is_query("logger.info(`user ${id} created`)"));
}

// ---------------------------------------------------------------------------
// Async
// ---------------------------------------------------------------------------

#[test]
fn an_await_inside_a_loop_is_reported_once() {
    let findings = asynchrony::scan(
        "export const load = async (ids: string[]) => {\n  for (const id of ids) {\n    await repository.findOne(id);\n  }\n};\n",
    );

    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "async.serial");
}

#[test]
fn an_async_iterator_is_serial_by_design() {
    let findings = asynchrony::scan(
        "export const read = async (stream) => {\n  for await (const chunk of stream) {\n    await sink.write(chunk);\n  }\n};\n",
    );

    assert!(findings.is_empty());
}

#[test]
fn a_promise_nobody_awaits_is_reported() {
    let floating = asynchrony::scan("items.forEach(async (item) => { await save(item); });\n");
    assert!(
        floating
            .iter()
            .any(|serial| serial.rule == "async.floating")
    );

    let awaited = asynchrony::scan(
        "const saved = await Promise.all(\n  items.map(async (item) => await save(item)),\n);\n",
    );
    assert!(
        !awaited
            .iter()
            .any(|serial| serial.rule == "async.unawaited")
    );
}

// ---------------------------------------------------------------------------
// Contrast
// ---------------------------------------------------------------------------

#[test]
fn black_on_white_is_the_maximum_ratio() {
    let white = contrast::parse_color("oklch(1 0 0)").expect("white");
    let black = contrast::parse_color("#000000").expect("black");

    assert!((contrast::ratio(black, white) - 21.0).abs() < 0.1);
    assert!((contrast::ratio(white, white) - 1.0).abs() < 0.001);
}

#[test]
fn a_token_pair_under_the_floor_is_reported() {
    let tokens = contrast::declarations(
        ":root {\n  --card: oklch(1 0 0);\n  --card-foreground: oklch(0.6 0 0);\n  --muted: oklch(0.95 0 0);\n  --muted-foreground: oklch(0.75 0 0);\n  --background: oklch(1 0 0);\n  --foreground: oklch(0.2 0 0);\n}\n",
    );

    let (errors, warnings) = contrast::inspect("light.css", &tokens);

    // Grey on grey lands under the large-text floor: nothing on that surface
    // is legible, so it fails rather than warns.
    assert!(
        errors
            .iter()
            .any(|error| error.contains("`--muted-foreground` on `--muted`"))
    );
    // This one still carries headings and icons, so it only warns.
    assert!(
        warnings
            .iter()
            .any(|warning| warning.contains("`--card-foreground` on `--card`"))
    );
    // The body pair is far above the floor and is not reported at all.
    assert!(
        !errors
            .iter()
            .chain(warnings.iter())
            .any(|line| line.contains("`--foreground` on `--background`"))
    );
}

#[test]
fn an_aliased_token_is_followed_to_the_colour_it_paints() {
    let tokens = contrast::declarations(
        ":root {\n  --light: oklch(1 0 0);\n  --primary: oklch(0.5 0 0);\n  --primary-foreground: var(--light);\n}\n",
    );

    assert_eq!(
        contrast::resolve(&tokens, "--primary-foreground"),
        Some("oklch(1 0 0)")
    );
    assert_eq!(
        contrast::surface_of("--primary-foreground"),
        Some("--primary".to_string())
    );
    assert_eq!(contrast::surface_of("--primary"), None);
}

// ---------------------------------------------------------------------------
// E2E coverage
// ---------------------------------------------------------------------------

#[test]
fn an_application_without_a_spec_is_reported() {
    let (_guard, root) = root();
    workspace(&root, "spa", "spa");

    let outcome = e2e_coverage::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Warned);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("serves an application and has no end-to-end spec"))
    );
}

#[test]
fn a_spec_that_no_script_runs_fails() {
    let (_guard, root) = root();
    let dir = workspace(&root, "spa", "spa");
    write(
        &dir.join("e2e/home.spec.ts"),
        "test(\"home\", async () => {});\n",
    );
    write(&dir.join("playwright.config.ts"), "export default {};\n");

    let outcome = e2e_coverage::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(
        outcome
            .details
            .iter()
            .any(|detail| detail.contains("no `e2e` script runs"))
    );
}

#[test]
fn a_backend_module_is_not_a_browser_suite_target() {
    assert_eq!(e2e_coverage::serves(Some("api")), None);
    assert_eq!(e2e_coverage::serves(Some("microservice")), None);
    assert_eq!(e2e_coverage::serves(None), None);
    assert_eq!(
        e2e_coverage::serves(Some("spa")),
        Some("an application".to_string())
    );
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

#[test]
fn an_issue_id_is_read_out_of_a_branch_name() {
    assert_eq!(
        branches::issue_of("feat/OON-123456-add-billing"),
        Some("OON-123456".to_string())
    );
    assert_eq!(branches::issue_of("main"), None);
    assert_eq!(branches::issue_of("feat/no-id-here"), None);
}

#[test]
fn an_issue_in_review_whose_branch_is_gone_fails() {
    let issues = vec![branches::Issue {
        id: "OON-123456".to_string(),
        state: "In Review".to_string(),
        branch: Some("feat/OON-123456-billing".to_string()),
        file: "modules/user/issues/OON-123456.yml".to_string(),
    }];
    let existing: BTreeSet<String> = ["main".to_string()].into_iter().collect();

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    branches::inspect(&issues, &existing, &mut errors, &mut warnings);

    assert!(
        errors
            .iter()
            .any(|error| error.contains("exists neither locally nor on a remote"))
    );
}

#[test]
fn a_branch_no_issue_declares_is_reported() {
    let issues = vec![branches::Issue {
        id: "OON-123456".to_string(),
        state: "Done".to_string(),
        branch: Some("feat/OON-123456-billing".to_string()),
        file: "modules/user/issues/OON-123456.yml".to_string(),
    }];
    let existing: BTreeSet<String> = [
        "main".to_string(),
        "feat/OON-123456-billing".to_string(),
        "fix/OON-999999-orphan".to_string(),
    ]
    .into_iter()
    .collect();

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    branches::inspect(&issues, &existing, &mut errors, &mut warnings);

    assert!(errors.is_empty());
    // The finished issue still carries its branch, and the stray one names an
    // issue that does not exist.
    assert!(
        warnings
            .iter()
            .any(|warning| warning.contains("still exists"))
    );
    assert!(
        warnings
            .iter()
            .any(|warning| warning.contains("OON-999999, which no issue file declares"))
    );
}
