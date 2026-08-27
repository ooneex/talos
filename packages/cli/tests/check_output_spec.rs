use std::path::PathBuf;

use cli::commands::lint::{LintAudit, LintStatus, ModuleLint};
use cli::commands::workspace_check::WorkspaceCheckArgs;
use cli::commands::workspace_check::output::{CheckReport, command_line, render, write};
use cli::utils::{OUTPUT_DIR, OutputFormat};

fn failing_lint() -> LintAudit {
    LintAudit {
        modules: vec![ModuleLint {
            name: "user".to_string(),
            label: "modules/user".to_string(),
            dir: PathBuf::from("modules/user"),
            status: LintStatus::Failed,
            duration_ms: 1200,
            output: "\u{1b}[31msrc/user.service.ts(12,5): error TS2322\u{1b}[0m: Type 'string' is not assignable"
                .to_string(),
            cached: false,
        }],
    }
}

fn report(lint: &Result<LintAudit, String>, passed: bool) -> CheckReport<'_> {
    CheckReport {
        lint,
        elapsed_ms: 64_000,
        passed,
        command: "talos check --logs".to_string(),
    }
}

#[test]
fn markdown_names_every_section_that_needs_work() {
    let lint = Ok(failing_lint());
    let markdown = render(OutputFormat::Md, &report(&lint, false));

    assert!(markdown.starts_with("# talos check report"));
    assert!(markdown.contains("**Verdict:** FAILED"));
    assert!(markdown.contains("`talos check --logs`"));
    assert!(markdown.contains("## How to use this file"));

    assert!(markdown.contains("| Lint | fail | 1 module linted · 1 failing |"));
    assert!(markdown.contains("## Lint failures (1)"));
    assert!(markdown.contains("error TS2322"));
    assert!(markdown.contains("talos lint --modules=user --logs"));
}

#[test]
fn markdown_of_a_green_gate_carries_no_work() {
    let lint = Ok(LintAudit::default());
    let markdown = render(OutputFormat::Md, &report(&lint, true));

    assert!(markdown.contains("**Verdict:** PASSED"));
    assert!(!markdown.contains("## Lint failures"));
}

#[test]
fn markdown_says_when_a_step_could_not_run_at_all() {
    let lint: Result<LintAudit, String> = Err("no lintable module".to_string());
    let markdown = render(OutputFormat::Md, &report(&lint, false));

    assert!(markdown.contains("| Lint | error | lint could not run: no lintable module |"));
    assert!(!markdown.contains("## Lint failures"));
}

#[test]
fn json_carries_the_same_report_in_a_parsable_shape() {
    let lint = Ok(failing_lint());
    let json = render(OutputFormat::Json, &report(&lint, false));
    let value: serde_json::Value = serde_json::from_str(&json).expect("valid JSON");

    assert_eq!(value["tool"], "talos check");
    assert_eq!(value["passed"], false);
    assert_eq!(value["command"], "talos check --logs");
    assert_eq!(value["summary"]["lint"]["status"], "fail");
    assert_eq!(value["summary"]["lint"]["failing"], 1);

    assert_eq!(value["lintFailures"][0]["module"], "user");
    assert_eq!(value["lintFailures"][0]["path"], "modules/user");
    // The captured log is stripped of the colours a terminal wanted.
    let logs = value["lintFailures"][0]["logs"]
        .as_str()
        .expect("logs are a string");
    assert!(logs.contains("error TS2322"));
    assert!(!logs.contains('\u{1b}'));

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
    let lint = Ok(failing_lint());
    let report = report(&lint, false);

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

    // Only what the gate itself takes: the fields left for `measure` and
    // `score` are not flags of it, so re-running with them would fail.
    assert_eq!(
        command_line(&args),
        "talos check --packages=core --modules=user --logs --no-cache"
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
