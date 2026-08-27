use std::path::PathBuf;

use cli::commands::coverage::{CoverageAudit, FileCoverage, ModuleCoverage, RunStatus};
use cli::commands::lint::{LintAudit, LintStatus, ModuleLint};
use cli::commands::performance_check::rules::{Finding, RULES};
use cli::commands::performance_check::symbols::SymbolKind;
use cli::commands::performance_check::{
    ModulePerformance, PerformanceAudit, ScanStatus, SymbolPerformance,
};
use cli::commands::workspace_check::WorkspaceCheckArgs;
use cli::commands::workspace_check::output::{CheckReport, command_line, render, write};
use cli::utils::{OUTPUT_DIR, OutputFormat};

fn failing_coverage() -> CoverageAudit {
    CoverageAudit {
        threshold: 90.0,
        modules: vec![
            ModuleCoverage {
                name: "user".to_string(),
                label: "modules/user".to_string(),
                dir: PathBuf::from("modules/user"),
                status: RunStatus::Failed,
                passed: 12,
                failed: 3,
                lines: 71.5,
                functions: 64.0,
                files: vec![],
                duration_ms: 4200,
                output:
                    "\u{1b}[31merror\u{1b}[0m: expected 2 to be 3\n  at user.service.spec.ts:41"
                        .to_string(),
                cached: false,
            },
            ModuleCoverage {
                name: "color".to_string(),
                label: "packages/color".to_string(),
                dir: PathBuf::from("packages/color"),
                status: RunStatus::Passed,
                passed: 40,
                failed: 0,
                lines: 80.0,
                functions: 75.0,
                files: vec![
                    FileCoverage {
                        path: "src/color.ts".to_string(),
                        lines: 55.0,
                        functions: 50.0,
                        uncovered: vec!["41-47".to_string(), "66".to_string()],
                    },
                    FileCoverage {
                        path: "src/index.ts".to_string(),
                        lines: 100.0,
                        functions: 100.0,
                        uncovered: vec![],
                    },
                ],
                duration_ms: 900,
                output: String::new(),
                cached: true,
            },
        ],
    }
}

fn failing_lint() -> LintAudit {
    LintAudit {
        modules: vec![ModuleLint {
            name: "user".to_string(),
            label: "modules/user".to_string(),
            dir: PathBuf::from("modules/user"),
            status: LintStatus::Failed,
            duration_ms: 1200,
            output: "src/user.service.ts(12,5): error TS2322: Type 'string' is not assignable"
                .to_string(),
            cached: false,
        }],
    }
}

fn failing_performance() -> PerformanceAudit {
    let rule = *RULES
        .iter()
        .find(|rule| rule.id == "perf.query-in-loop")
        .expect("the rule exists");

    PerformanceAudit {
        threshold: 90.0,
        modules: vec![ModulePerformance {
            name: "user".to_string(),
            label: "modules/user".to_string(),
            dir: PathBuf::from("modules/user"),
            status: ScanStatus::Scored,
            symbols: vec![SymbolPerformance {
                kind: SymbolKind::Method,
                name: "UserService.syncAll".to_string(),
                file: "modules/user/src/user.service.ts".to_string(),
                line: 14,
                span: 9,
                findings: vec![Finding { rule, line: 17 }],
                suppressed: 0,
                score: 60.0,
            }],
            files: 1,
            duration_ms: 30,
        }],
    }
}

fn report<'a>(
    coverage: &'a Result<CoverageAudit, String>,
    lint: &'a Result<LintAudit, String>,
    performance: &'a Result<PerformanceAudit, String>,
    passed: bool,
) -> CheckReport<'a> {
    CheckReport {
        coverage,
        lint,
        performance,
        strict: true,
        elapsed_ms: 64_000,
        passed,
        command: "talos check --strict".to_string(),
    }
}

#[test]
fn markdown_names_every_section_that_needs_work() {
    let coverage = Ok(failing_coverage());
    let lint = Ok(failing_lint());
    let performance = Ok(failing_performance());
    let markdown = render(
        OutputFormat::Md,
        &report(&coverage, &lint, &performance, false),
    );

    assert!(markdown.starts_with("# talos check report"));
    assert!(markdown.contains("**Verdict:** FAILED"));
    assert!(markdown.contains("`talos check --strict`"));
    assert!(markdown.contains("## How to use this file"));

    // The failing suite, with its log and the command that replays it.
    assert!(markdown.contains("## Failing test suites (1)"));
    assert!(markdown.contains("3 tests failed"));
    assert!(markdown.contains("expected 2 to be 3"));
    assert!(markdown.contains("talos coverage --modules=user --logs"));

    assert!(markdown.contains("## Lint failures (1)"));
    assert!(markdown.contains("error TS2322"));

    // The under-covered module names its thin files, root-relative, with the
    // lines that were never run.
    assert!(markdown.contains("## Coverage gaps (1 module under 90%)"));
    assert!(markdown.contains("`packages/color/src/color.ts`"));
    assert!(markdown.contains("41-47, 66"));
    assert!(!markdown.contains("src/index.ts"));

    assert!(markdown.contains("## Performance hotspots (1 module under 90)"));
    assert!(markdown.contains("`UserService.syncAll`"));
    assert!(markdown.contains("`modules/user/src/user.service.ts:14`"));
    assert!(markdown.contains("perf.query-in-loop"));
    assert!(markdown.contains("load the whole set in one query"));
}

#[test]
fn markdown_of_a_green_gate_carries_no_work() {
    let coverage = Ok(CoverageAudit {
        threshold: 90.0,
        modules: vec![],
    });
    let lint = Ok(LintAudit::default());
    let performance = Ok(PerformanceAudit {
        threshold: 90.0,
        modules: vec![],
    });
    let markdown = render(
        OutputFormat::Md,
        &report(&coverage, &lint, &performance, true),
    );

    assert!(markdown.contains("**Verdict:** PASSED"));
    assert!(!markdown.contains("## Failing test suites"));
    assert!(!markdown.contains("## Lint failures"));
    assert!(!markdown.contains("## Coverage gaps"));
    assert!(!markdown.contains("## Performance hotspots"));
}

#[test]
fn markdown_says_when_a_step_could_not_run_at_all() {
    let coverage: Result<CoverageAudit, String> = Err("coverage panicked".to_string());
    let lint: Result<LintAudit, String> = Err("no lintable module".to_string());
    let performance = Ok(failing_performance());
    let markdown = render(
        OutputFormat::Md,
        &report(&coverage, &lint, &performance, false),
    );

    assert!(
        markdown
            .contains("| Tests & coverage | error | coverage could not run: coverage panicked |")
    );
    assert!(markdown.contains("| Lint | error | lint could not run: no lintable module |"));
}

#[test]
fn json_carries_the_same_report_in_a_parsable_shape() {
    let coverage = Ok(failing_coverage());
    let lint = Ok(failing_lint());
    let performance = Ok(failing_performance());
    let json = render(
        OutputFormat::Json,
        &report(&coverage, &lint, &performance, false),
    );
    let value: serde_json::Value = serde_json::from_str(&json).expect("valid JSON");

    assert_eq!(value["tool"], "talos check");
    assert_eq!(value["passed"], false);
    assert_eq!(value["command"], "talos check --strict");
    assert_eq!(value["summary"]["coverage"]["status"], "fail");
    assert_eq!(value["summary"]["coverage"]["failingSuites"], 1);
    assert_eq!(value["summary"]["lint"]["status"], "fail");
    assert_eq!(value["summary"]["performance"]["status"], "fail");

    assert_eq!(value["failingSuites"][0]["module"], "user");
    assert_eq!(value["failingSuites"][0]["failed"], 3);
    // The captured log is stripped of the colours a terminal wanted.
    let logs = value["failingSuites"][0]["logs"]
        .as_str()
        .expect("logs are a string");
    assert!(logs.contains("error: expected 2 to be 3"));
    assert!(!logs.contains('\u{1b}'));

    assert_eq!(value["lintFailures"][0]["path"], "modules/user");
    assert_eq!(
        value["coverageGaps"][0]["files"][0]["file"],
        "packages/color/src/color.ts"
    );
    assert_eq!(
        value["performanceHotspots"][0]["symbols"][0]["findings"][0]["rule"],
        "perf.query-in-loop"
    );
    assert!(
        value["instructions"]
            .as_array()
            .expect("instructions")
            .len()
            >= 4
    );
}

#[test]
fn a_report_is_written_under_var_outputs() {
    let dir = tempfile::tempdir().expect("tempdir");
    let coverage = Ok(failing_coverage());
    let lint = Ok(failing_lint());
    let performance = Ok(failing_performance());
    let report = report(&coverage, &lint, &performance, false);

    let markdown = write(dir.path(), OutputFormat::Md, &report).expect("the markdown is written");
    let json = write(dir.path(), OutputFormat::Json, &report).expect("the json is written");

    assert_eq!(markdown, dir.path().join(OUTPUT_DIR).join("talos_check.md"));
    assert_eq!(json, dir.path().join(OUTPUT_DIR).join("talos_check.json"));
    assert!(
        std::fs::read_to_string(&markdown)
            .expect("markdown")
            .contains("# talos check report")
    );
    assert!(
        serde_json::from_str::<serde_json::Value>(&std::fs::read_to_string(&json).expect("json"))
            .is_ok()
    );
}

#[test]
fn the_command_line_is_the_gate_without_its_own_output_flag() {
    let args = WorkspaceCheckArgs {
        packages: Some("core".to_string()),
        modules: Some("user".to_string()),
        logs: true,
        no_cache: true,
        threshold: Some(85.0),
        concurrency: Some(4),
        strict: true,
        output: Some(OutputFormat::Md),
        cwd: Some("./here".to_string()),
    };

    assert_eq!(
        command_line(&args),
        "talos check --packages=core --modules=user --threshold=85 --concurrency=4 --strict --logs --no-cache"
    );
}

#[test]
fn the_command_line_of_a_bare_gate_is_bare() {
    let args = WorkspaceCheckArgs {
        packages: None,
        modules: None,
        logs: false,
        no_cache: false,
        threshold: None,
        concurrency: None,
        strict: false,
        output: None,
        cwd: None,
    };

    assert_eq!(command_line(&args), "talos check");
}
