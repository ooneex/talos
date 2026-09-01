//! Writing the gate's install, lint and optional test verdicts to
//! `var/outputs/talos_check.{md,json}` — the same run the terminal draws, in a
//! shape an agent can act on.
//!
//! The console report is written for someone watching it: it colours, ranks,
//! truncates and gets out of the way. A file handed to an AI agent is read
//! once, with no terminal to scroll back in and no workspace knowledge beyond
//! what it says, so this one keeps what the console drops — every failing
//! module's log — and names each one by a path relative to the workspace
//! root, so a fix is one open away.
//!
//! The markdown is what a coding agent is handed directly; the JSON is the
//! same report for something that parses before it reads. Both carry the
//! command that produced them, so the agent can re-run the gate and check its
//! own work.

use std::path::{Path, PathBuf};

use console::strip_ansi_codes;
use serde_json::{Value, json};

use super::WorkspaceCheckArgs;
use crate::commands::coverage::tail;
use crate::commands::lint::{LintAudit, LintStatus};
use crate::utils::{OutputFormat, write_report_file};

/// How the file is named, before `--output` picks its extension.
pub const FILE_STEM: &str = "talos_check";

/// How much of a failing lint's output the report carries.
///
/// Three times what the console report shows: there the log is a reminder of
/// something already scrolling past, here it is the whole of the evidence.
const LOG_TAIL_LINES: usize = 120;

/// What the gate found, gathered in one place so a report can be rendered
/// from it without re-running anything.
///
/// The audit is kept as the `Result` the step returned rather than unwrapped:
/// a step that could not run at all is a thing the agent has to fix too, and
/// dropping it here would leave the file quietly claiming the section passed.
pub struct CheckReport<'a> {
    pub install_passed: bool,
    pub lint: &'a Result<LintAudit, String>,
    /// `None` for `workspace:check`; `Some` when the full `check` command also
    /// ran the test suites.
    pub tests_passed: Option<bool>,
    pub elapsed_ms: u64,
    /// Whether the gate passed — the same verdict the process exits with.
    pub passed: bool,
    /// The command that produced this report, for the agent to re-run.
    pub command: String,
}

/// How a section of the report ended.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Status {
    Pass,
    Fail,
    /// The step itself could not run.
    Errored,
}

impl Status {
    fn slug(self) -> &'static str {
        match self {
            Status::Pass => "pass",
            Status::Fail => "fail",
            Status::Errored => "error",
        }
    }
}

/// Rebuild the command that produced this report, so the file can tell the
/// agent how to check its own work.
///
/// `--output` is deliberately dropped: the agent re-runs the gate to see
/// whether it is green, not to overwrite the file it is reading.
pub fn command_line(args: &WorkspaceCheckArgs) -> String {
    let mut parts = vec!["talos check".to_string()];
    if let Some(packages) = &args.packages {
        parts.push(format!("--packages={packages}"));
    }
    if let Some(modules) = &args.modules {
        parts.push(format!("--modules={modules}"));
    }
    if args.logs {
        parts.push("--logs".to_string());
    }
    if args.no_cache {
        parts.push("--no-cache".to_string());
    }
    parts.join(" ")
}

/// Render the report and write it under `var/outputs`, returning where it
/// landed.
pub fn write(root: &Path, format: OutputFormat, report: &CheckReport) -> Result<PathBuf, String> {
    write_report_file(root, FILE_STEM, format, &render(format, report))
}

pub fn render(format: OutputFormat, report: &CheckReport) -> String {
    match format {
        OutputFormat::Md => render_markdown(report),
        OutputFormat::Json => render_json(report),
    }
}

// ---------------------------------------------------------------------------
// Shared reading of the audit
// ---------------------------------------------------------------------------

fn lint_status(lint: &Result<LintAudit, String>) -> Status {
    match lint {
        Err(_) => Status::Errored,
        Ok(audit) if audit.is_failure() => Status::Fail,
        Ok(_) => Status::Pass,
    }
}

/// `s` when there is anything other than one of something.
fn plural(count: usize) -> &'static str {
    if count == 1 { "" } else { "s" }
}

/// The captured output of a run, stripped of the colours a terminal wanted
/// and cut to its tail — the end of a failing log is the part that says why.
fn logs(output: &str) -> String {
    let plain = strip_ansi_codes(output).to_string();
    let lines = tail(&plain, LOG_TAIL_LINES);
    if lines.is_empty() {
        return "(no output captured)".to_string();
    }
    lines.join("\n")
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

fn render_markdown(report: &CheckReport) -> String {
    let mut out = String::new();
    out.push_str(&markdown_header(report));
    out.push_str(&markdown_instructions(report));
    out.push_str(&markdown_summary(report));
    out.push_str(&markdown_lint(report));
    out
}

fn markdown_header(report: &CheckReport) -> String {
    let verdict = if report.passed {
        "PASSED — every section is green"
    } else {
        "FAILED — the sections below are what broke it"
    };

    format!(
        "# talos check report\n\n\
         - **Verdict:** {verdict}\n\
         - **Command:** `{}`\n\
         - **Generated:** {}\n\
         - **Duration:** {}\n\n",
        report.command,
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
        crate::utils::format_duration(report.elapsed_ms)
    )
}

fn markdown_instructions(report: &CheckReport) -> String {
    let mut out = String::from(
        "## How to use this file\n\n\
         You are fixing a workspace that failed its gate. This file is the whole \
         of the evidence — every path is relative to the workspace root, and every \
         section below is work.\n\n\
         1. Fix the source the report points at, never the report's verdict — do \
         not delete or skip a test, weaken an assertion, or add a lint or \
         `talos-ignore` suppression to make a line go away.\n\
         2. Keep every public signature and every passing test working.\n",
    );
    out.push_str(&format!(
        "3. Re-run `{}` when you are done, and keep going until it is green.\n\n",
        report.command
    ));
    out
}

fn markdown_summary(report: &CheckReport) -> String {
    let mut out =
        String::from("## Summary\n\n| Section | Status | What it found |\n| --- | --- | --- |\n");

    out.push_str(&format!(
        "| Install | {} | dependencies {} |\n",
        if report.install_passed {
            "pass"
        } else {
            "fail"
        },
        if report.install_passed {
            "installed"
        } else {
            "could not be installed"
        }
    ));
    out.push_str(&format!(
        "| Lint | {} | {} |\n",
        lint_status(report.lint).slug(),
        match report.lint {
            Ok(audit) => format!(
                "{} module{} linted · {} failing",
                audit.ran().len(),
                plural(audit.ran().len()),
                audit.broken().len()
            ),
            Err(message) => format!("lint could not run: {message}"),
        }
    ));

    if let Some(tests_passed) = report.tests_passed {
        out.push_str(&format!(
            "| Test | {} | {} |\n",
            if tests_passed { "pass" } else { "fail" },
            if tests_passed {
                "every selected suite passed"
            } else {
                "one or more selected suites failed; re-run `talos test --logs`"
            }
        ));
    }
    out.push('\n');

    out
}

fn markdown_lint(report: &CheckReport) -> String {
    let Ok(audit) = report.lint else {
        return String::new();
    };
    let broken = audit.broken();
    if broken.is_empty() {
        return String::new();
    }

    let mut out = format!("## Lint failures ({})\n\n", broken.len());
    for module in broken {
        let why = match &module.status {
            LintStatus::Errored(reason) => format!("the lint script could not run: {reason}"),
            _ => "`tsc --noEmit` or biome reported the errors below".to_string(),
        };
        out.push_str(&format!(
            "### `{}`\n\n- Why: {why}\n- Re-run: `talos lint --modules={} --logs`\n\n```text\n{}\n```\n\n",
            module.label,
            module.name,
            logs(&module.output)
        ));
    }
    out
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

fn render_json(report: &CheckReport) -> String {
    let value = json!({
        "tool": "talos check",
        "cliVersion": env!("CARGO_PKG_VERSION"),
        "generatedAt": chrono::Local::now().to_rfc3339(),
        "command": report.command,
        "durationMs": report.elapsed_ms,
        "passed": report.passed,
        "instructions": [
            "Every path is relative to the workspace root.",
            "Fix the source each entry points at, never the verdict: do not delete or skip a test, weaken an assertion, or add a lint or talos-ignore suppression.",
            "Work through lintFailures top to bottom.",
            format!("Re-run `{}` until it passes.", report.command),
        ],
        "summary": {
            "install": {
                "status": if report.install_passed { "pass" } else { "fail" },
            },
            "lint": lint_summary_json(report),
            "test": report.tests_passed.map(|passed| json!({
                "status": if passed { "pass" } else { "fail" },
                "rerun": "talos test --logs",
            })),
        },
        "lintFailures": lint_failures_json(report),
    });

    format!(
        "{}\n",
        serde_json::to_string_pretty(&value).unwrap_or_default()
    )
}

fn lint_summary_json(report: &CheckReport) -> Value {
    let status = lint_status(report.lint).slug();
    match report.lint {
        Ok(audit) => json!({
            "status": status,
            "modules": audit.ran().len(),
            "failing": audit.broken().len(),
        }),
        Err(message) => json!({ "status": status, "error": message }),
    }
}

fn lint_failures_json(report: &CheckReport) -> Value {
    let Ok(audit) = report.lint else {
        return json!([]);
    };
    let failures: Vec<Value> = audit
        .broken()
        .iter()
        .map(|module| {
            json!({
                "module": module.name,
                "path": module.label,
                "reason": match &module.status {
                    LintStatus::Errored(reason) => format!("the lint script could not run: {reason}"),
                    _ => "tsc or biome reported errors".to_string(),
                },
                "rerun": format!("talos lint --modules={} --logs", module.name),
                "logs": logs(&module.output),
            })
        })
        .collect();
    json!(failures)
}
