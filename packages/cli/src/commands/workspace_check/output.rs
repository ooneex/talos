//! Writing the gate's three audits to `var/outputs/talos_check.{md,json}` —
//! the same report the terminal draws, in a shape an agent can act on.
//!
//! The console report is written for someone watching it: it colours, ranks,
//! truncates and gets out of the way. A file handed to an AI agent is read
//! once, with no terminal to scroll back in and no workspace knowledge beyond
//! what it says, so this one keeps what the console drops — every failing
//! suite's log, every under-covered file with its uncovered ranges, every
//! hotspot with the rule it trips and what to do about it — and names each
//! one by a path relative to the workspace root, so a fix is one open away.
//!
//! The markdown is what a coding agent is handed directly; the JSON is the
//! same report for something that parses before it reads. Both carry the
//! command that produced them, so the agent can re-run the gate and check its
//! own work.

use std::path::{Path, PathBuf};

use console::strip_ansi_codes;
use serde_json::{Value, json};

use super::WorkspaceCheckArgs;
use crate::commands::coverage::{CoverageAudit, ModuleCoverage, RunStatus, tail, trim_percent};
use crate::commands::lint::{LintAudit, LintStatus};
use crate::commands::performance_check::{ModulePerformance, PerformanceAudit};
use crate::utils::{OutputFormat, write_report_file};

/// How the file is named, before `--output` picks its extension.
pub const FILE_STEM: &str = "talos_check";

/// How much of a failing suite's or lint's output the report carries.
///
/// Three times what the console report shows: there the log is a reminder of
/// something already scrolling past, here it is the whole of the evidence.
const LOG_TAIL_LINES: usize = 120;

/// How many hotspots a module names before the rest are counted — enough for
/// a session's worth of work, short of pasting the whole module in.
const MAX_HOTSPOTS: usize = 15;

/// What the gate found, gathered in one place so a report can be rendered
/// from it without re-running anything.
///
/// Each audit is kept as the `Result` the step returned rather than unwrapped:
/// a step that could not run at all is a thing the agent has to fix too, and
/// dropping it here would leave the file quietly claiming the section passed.
pub struct CheckReport<'a> {
    pub coverage: &'a Result<CoverageAudit, String>,
    pub lint: &'a Result<LintAudit, String>,
    pub performance: &'a Result<PerformanceAudit, String>,
    /// The gate's `--strict`, which decides whether a module under the
    /// threshold is a failure or a warning.
    pub strict: bool,
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
    /// Something to fix that does not fail the gate — an under-covered module
    /// without `--strict`, a hotspot the score survived.
    Warn,
    Fail,
    /// The step itself could not run.
    Errored,
}

impl Status {
    fn slug(self) -> &'static str {
        match self {
            Status::Pass => "pass",
            Status::Warn => "warn",
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
    if let Some(threshold) = args.threshold {
        parts.push(format!("--threshold={}", trim_percent(threshold)));
    }
    if let Some(concurrency) = args.concurrency {
        parts.push(format!("--concurrency={concurrency}"));
    }
    if args.strict {
        parts.push("--strict".to_string());
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
// Shared reading of the audits
// ---------------------------------------------------------------------------

fn coverage_status(coverage: &Result<CoverageAudit, String>, strict: bool) -> Status {
    match coverage {
        Err(_) => Status::Errored,
        Ok(audit) if !audit.broken().is_empty() => Status::Fail,
        Ok(audit) if audit.under().is_empty() => Status::Pass,
        Ok(_) if strict => Status::Fail,
        Ok(_) => Status::Warn,
    }
}

fn lint_status(lint: &Result<LintAudit, String>) -> Status {
    match lint {
        Err(_) => Status::Errored,
        Ok(audit) if audit.is_failure() => Status::Fail,
        Ok(_) => Status::Pass,
    }
}

fn performance_status(performance: &Result<PerformanceAudit, String>, strict: bool) -> Status {
    match performance {
        // A workspace with nothing to score is an absence, not a verdict —
        // the same way the console report warns where the others error.
        Err(_) => Status::Warn,
        Ok(audit) if audit.under().is_empty() => Status::Pass,
        Ok(_) if strict => Status::Fail,
        Ok(_) => Status::Warn,
    }
}

/// `s` when there is anything other than one of something.
fn plural(count: usize) -> &'static str {
    if count == 1 { "" } else { "s" }
}

/// The path a coverage file is named by in the report — module-relative as
/// bun reports it, prefixed with the module so it opens from the root.
fn file_path(module: &ModuleCoverage, path: &str) -> String {
    format!("{}/{}", module.label, path.trim_start_matches("./"))
}

/// What a module's suite failed with, in one line.
fn suite_reason(module: &ModuleCoverage) -> String {
    match &module.status {
        RunStatus::Failed => format!("{} test{} failed", module.failed, plural(module.failed)),
        RunStatus::Errored(reason) => format!("the suite could not run: {reason}"),
        _ => "the suite passed".to_string(),
    }
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
    out.push_str(&markdown_failing_suites(report));
    out.push_str(&markdown_lint(report));
    out.push_str(&markdown_coverage(report));
    out.push_str(&markdown_performance(report));
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
         1. Work top to bottom: a failing suite hides whatever the coverage under \
         it would have said, and a module that does not lint may not even build.\n\
         2. Fix the source the report points at, never the report's verdict — do \
         not lower a threshold, delete or skip a test, weaken an assertion, or add \
         a lint or `talos-ignore` suppression to make a line go away.\n\
         3. Keep every public signature and every passing test working.\n",
    );
    out.push_str(&format!(
        "4. Re-run `{}` when you are done, and keep going until it is green.\n\n",
        report.command
    ));
    out
}

fn markdown_summary(report: &CheckReport) -> String {
    let mut out =
        String::from("## Summary\n\n| Section | Status | What it found |\n| --- | --- | --- |\n");

    out.push_str(&format!(
        "| Tests & coverage | {} | {} |\n",
        coverage_status(report.coverage, report.strict).slug(),
        match report.coverage {
            Ok(audit) => format!(
                "{} module{} · {} test{} · {}% lines · {}% functions · threshold {}% · {} failing suite{} · {} under threshold",
                audit.ran().len(),
                plural(audit.ran().len()),
                audit.tests(),
                plural(audit.tests()),
                trim_percent(audit.lines()),
                trim_percent(audit.functions()),
                trim_percent(audit.threshold),
                audit.broken().len(),
                plural(audit.broken().len()),
                audit.under().len()
            ),
            Err(message) => format!("coverage could not run: {message}"),
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

    out.push_str(&format!(
        "| Performance | {} | {} |\n\n",
        performance_status(report.performance, report.strict).slug(),
        match report.performance {
            Ok(audit) => format!(
                "score {} / 100 · threshold {} · {} symbol{} · {} finding{} · {} module{} under threshold",
                trim_percent(audit.score()),
                trim_percent(audit.threshold),
                audit.symbols(),
                plural(audit.symbols()),
                audit.findings(),
                plural(audit.findings()),
                audit.under().len(),
                plural(audit.under().len())
            ),
            Err(message) => format!("nothing was scored: {message}"),
        }
    ));

    out
}

fn markdown_failing_suites(report: &CheckReport) -> String {
    let Ok(audit) = report.coverage else {
        return String::new();
    };
    let broken = audit.broken();
    if broken.is_empty() {
        return String::new();
    }

    let mut out = format!(
        "## Failing test suites ({}) — fix these first\n\n",
        broken.len()
    );
    for module in broken {
        out.push_str(&format!(
            "### `{}`\n\n- Why: {}\n- Tests: {} passed, {} failed\n- Re-run: `talos coverage --modules={} --logs`\n\n```text\n{}\n```\n\n",
            module.label,
            suite_reason(module),
            module.passed,
            module.failed,
            module.name,
            logs(&module.output)
        ));
    }
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

fn markdown_coverage(report: &CheckReport) -> String {
    let Ok(audit) = report.coverage else {
        return String::new();
    };
    let under = audit.under();
    if under.is_empty() {
        return String::new();
    }

    let mut out = format!(
        "## Coverage gaps ({} module{} under {}%)\n\n\
         Write real tests for the uncovered lines — behaviour, edge cases and error paths, \
         not calls made only to raise the number.\n\n",
        under.len(),
        plural(under.len()),
        trim_percent(audit.threshold)
    );

    for module in under {
        out.push_str(&format!(
            "### `{}` — {}% lines · {}% functions\n\n- Tests: {} passed\n- Suite: `bun test --coverage` in `{}`\n\n",
            module.label,
            trim_percent(module.lines),
            trim_percent(module.functions),
            module.passed,
            module.label
        ));

        let files = module.low_files(audit.threshold);
        if files.is_empty() {
            out.push_str(
                "Every file clears the threshold on its own — the module average does not, so raise the thinnest files.\n\n",
            );
            continue;
        }

        out.push_str("| File | Lines | Functions | Uncovered lines |\n| --- | --- | --- | --- |\n");
        for file in files {
            out.push_str(&format!(
                "| `{}` | {}% | {}% | {} |\n",
                file_path(module, &file.path),
                trim_percent(file.lines),
                trim_percent(file.functions),
                if file.uncovered.is_empty() {
                    "—".to_string()
                } else {
                    file.uncovered.join(", ")
                }
            ));
        }
        out.push('\n');
    }
    out
}

fn markdown_performance(report: &CheckReport) -> String {
    let Ok(audit) = report.performance else {
        return String::new();
    };
    let under = audit.under();
    if under.is_empty() {
        return String::new();
    }

    let mut out = format!(
        "## Performance hotspots ({} module{} under {})\n\n\
         Each rule fires on a shape that costs more as the data grows, not on a measurement. \
         Rewrite the symbol so the cost stops scaling with the input; keep the behaviour identical.\n\n",
        under.len(),
        plural(under.len()),
        trim_percent(audit.threshold)
    );

    for module in under {
        out.push_str(&format!(
            "### `{}` — score {} / 100\n\n",
            module.label,
            trim_percent(module.score())
        ));

        let hotspots = module.hotspots(audit.threshold);
        for symbol in hotspots.iter().take(MAX_HOTSPOTS) {
            out.push_str(&format!(
                "- `{}` ({}, score {}) — `{}:{}`\n",
                symbol.name,
                symbol.kind.label(),
                trim_percent(symbol.score),
                symbol.file,
                symbol.line
            ));
            for finding in &symbol.findings {
                out.push_str(&format!(
                    "  - **{}** `{}` at line {} — {}. Fix: {}.\n",
                    finding.rule.severity.label(),
                    finding.rule.id,
                    finding.line,
                    finding.rule.cost,
                    finding.rule.hint
                ));
            }
        }
        if hotspots.len() > MAX_HOTSPOTS {
            out.push_str(&format!(
                "- … and {} more symbol{} under the threshold — run `talos performance:check --modules={} --logs` for the rest\n",
                hotspots.len() - MAX_HOTSPOTS,
                plural(hotspots.len() - MAX_HOTSPOTS),
                module.name
            ));
        }
        out.push('\n');
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
        "strict": report.strict,
        "durationMs": report.elapsed_ms,
        "passed": report.passed,
        "instructions": [
            "Every path is relative to the workspace root.",
            "Fix the source each entry points at, never the verdict: do not lower a threshold, delete or skip a test, weaken an assertion, or add a lint or talos-ignore suppression.",
            "Fix failingSuites first, then lintFailures, then coverageGaps, then performanceHotspots.",
            format!("Re-run `{}` until it passes.", report.command),
        ],
        "summary": {
            "coverage": coverage_summary_json(report),
            "lint": lint_summary_json(report),
            "performance": performance_summary_json(report),
        },
        "failingSuites": failing_suites_json(report),
        "lintFailures": lint_failures_json(report),
        "coverageGaps": coverage_gaps_json(report),
        "performanceHotspots": performance_hotspots_json(report),
    });

    format!(
        "{}\n",
        serde_json::to_string_pretty(&value).unwrap_or_default()
    )
}

fn coverage_summary_json(report: &CheckReport) -> Value {
    let status = coverage_status(report.coverage, report.strict).slug();
    match report.coverage {
        Ok(audit) => json!({
            "status": status,
            "modules": audit.ran().len(),
            "tests": audit.tests(),
            "lines": audit.lines(),
            "functions": audit.functions(),
            "threshold": audit.threshold,
            "failingSuites": audit.broken().len(),
            "underThreshold": audit.under().len(),
        }),
        Err(message) => json!({ "status": status, "error": message }),
    }
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

fn performance_summary_json(report: &CheckReport) -> Value {
    let status = performance_status(report.performance, report.strict).slug();
    match report.performance {
        Ok(audit) => json!({
            "status": status,
            "score": audit.score(),
            "threshold": audit.threshold,
            "symbols": audit.symbols(),
            "findings": audit.findings(),
            "underThreshold": audit.under().len(),
        }),
        Err(message) => json!({ "status": status, "error": message }),
    }
}

fn failing_suites_json(report: &CheckReport) -> Value {
    let Ok(audit) = report.coverage else {
        return json!([]);
    };
    let suites: Vec<Value> = audit
        .broken()
        .iter()
        .map(|module| {
            json!({
                "module": module.name,
                "path": module.label,
                "reason": suite_reason(module),
                "passed": module.passed,
                "failed": module.failed,
                "rerun": format!("talos coverage --modules={} --logs", module.name),
                "logs": logs(&module.output),
            })
        })
        .collect();
    json!(suites)
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

fn coverage_gaps_json(report: &CheckReport) -> Value {
    let Ok(audit) = report.coverage else {
        return json!([]);
    };
    let gaps: Vec<Value> = audit
        .under()
        .iter()
        .map(|module| {
            let files: Vec<Value> = module
                .low_files(audit.threshold)
                .iter()
                .map(|file| {
                    json!({
                        "file": file_path(module, &file.path),
                        "lines": file.lines,
                        "functions": file.functions,
                        "uncovered": file.uncovered,
                    })
                })
                .collect();

            json!({
                "module": module.name,
                "path": module.label,
                "lines": module.lines,
                "functions": module.functions,
                "threshold": audit.threshold,
                "rerun": format!("talos coverage --modules={}", module.name),
                "files": files,
            })
        })
        .collect();
    json!(gaps)
}

fn performance_hotspots_json(report: &CheckReport) -> Value {
    let Ok(audit) = report.performance else {
        return json!([]);
    };
    let modules: Vec<Value> = audit
        .under()
        .iter()
        .map(|module| hotspots_json(module, audit.threshold))
        .collect();
    json!(modules)
}

fn hotspots_json(module: &ModulePerformance, threshold: f64) -> Value {
    let hotspots = module.hotspots(threshold);
    let symbols: Vec<Value> = hotspots
        .iter()
        .take(MAX_HOTSPOTS)
        .map(|symbol| {
            let findings: Vec<Value> = symbol
                .findings
                .iter()
                .map(|finding| {
                    json!({
                        "rule": finding.rule.id,
                        "severity": finding.rule.severity.label(),
                        "line": finding.line,
                        "cost": finding.rule.cost,
                        "hint": finding.rule.hint,
                    })
                })
                .collect();

            json!({
                "symbol": symbol.name,
                "kind": symbol.kind.label(),
                "file": symbol.file,
                "line": symbol.line,
                "score": symbol.score,
                "findings": findings,
            })
        })
        .collect();

    json!({
        "module": module.name,
        "path": module.label,
        "score": module.score(),
        "threshold": threshold,
        "hidden": hotspots.len().saturating_sub(MAX_HOTSPOTS),
        "rerun": format!("talos performance:check --modules={} --logs", module.name),
        "symbols": symbols,
    })
}
