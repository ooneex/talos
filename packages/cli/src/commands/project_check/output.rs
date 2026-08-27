//! Writing the aggregate report to `var/outputs/talos_project_check.{md,json}`
//! — the same run the terminal draws, in a shape an agent can act on.
//!
//! The console report is written for someone watching it: sixty rows ranked
//! and coloured, details capped so the table stays readable, and the whole
//! thing gone as soon as the terminal scrolls. A file handed to an AI agent is
//! read once, with no run to watch and no workspace knowledge beyond what it
//! says, so this one reads the other way round: the checks that need work
//! first, each with what it verifies, everything it found, the hints it gave,
//! and the command that re-runs that one check on its own.
//!
//! `--logs` already prints a plain-text report for pasting into a
//! conversation; this is that report as a file, with the instructions and the
//! per-check commands an agent needs to actually fix and re-verify the run.

use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use super::render::check_value;
use super::{CheckOutcome, CheckStatus, ProjectCheckArgs, ProjectReport};
use crate::utils::{OutputFormat, format_duration, write_report_file};

/// How the file is named, before `--output` picks its extension.
pub const FILE_STEM: &str = "talos_project_check";

/// Rebuild the command that produced this report, so the file can tell the
/// agent how to check its own work.
///
/// `--output` and `--json` are both dropped: the agent re-runs the checks to
/// see whether they are green, not to overwrite or reformat the file it is
/// reading.
pub fn command_line(args: &ProjectCheckArgs) -> String {
    let mut parts = vec!["talos project:check".to_string()];
    if let Some(only) = &args.only {
        parts.push(format!("--only={only}"));
    }
    if let Some(skip) = &args.skip {
        parts.push(format!("--skip={skip}"));
    }
    if let Some(packages) = &args.packages {
        parts.push(format!("--packages={packages}"));
    }
    if let Some(modules) = &args.modules {
        parts.push(format!("--modules={modules}"));
    }
    if let Some(level) = &args.audit_level {
        parts.push(format!("--audit-level={level}"));
    }
    if let Some(threshold) = args.threshold {
        parts.push(format!("--threshold={threshold}"));
    }
    if let Some(concurrency) = args.concurrency {
        parts.push(format!("--concurrency={concurrency}"));
    }
    if args.e2e {
        parts.push("--e2e".to_string());
    }
    if args.outdated {
        parts.push("--outdated".to_string());
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
pub fn write(
    root: &Path,
    format: OutputFormat,
    report: &ProjectReport,
    args: &ProjectCheckArgs,
) -> Result<PathBuf, String> {
    write_report_file(root, FILE_STEM, format, &render(format, report, args))
}

pub fn render(format: OutputFormat, report: &ProjectReport, args: &ProjectCheckArgs) -> String {
    match format {
        OutputFormat::Md => render_markdown(report, args),
        OutputFormat::Json => render_json(report, args),
    }
}

/// The checks that need work, failures before warnings and each group in the
/// order the run reported it — which is the order they are worth fixing in: a
/// failure blocks, a warning is a finding the run did not stop for.
fn work(report: &ProjectReport) -> Vec<&CheckOutcome> {
    let mut work: Vec<&CheckOutcome> = report
        .outcomes
        .iter()
        .filter(|outcome| outcome.status == CheckStatus::Failed)
        .collect();
    work.extend(
        report
            .outcomes
            .iter()
            .filter(|outcome| outcome.status == CheckStatus::Warned),
    );
    work
}

fn with_status(report: &ProjectReport, status: CheckStatus) -> Vec<&CheckOutcome> {
    report
        .outcomes
        .iter()
        .filter(|outcome| outcome.status == status)
        .collect()
}

/// How a single check is re-run once its findings are fixed.
fn rerun(outcome: &CheckOutcome, args: &ProjectCheckArgs) -> String {
    let mut command = format!("talos project:check --only={}", outcome.id.key());
    if let Some(modules) = &args.modules {
        command.push_str(&format!(" --modules={modules}"));
    }
    if let Some(packages) = &args.packages {
        command.push_str(&format!(" --packages={packages}"));
    }
    if args.strict {
        command.push_str(" --strict");
    }
    command
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

fn render_markdown(report: &ProjectReport, args: &ProjectCheckArgs) -> String {
    let mut out = String::new();
    out.push_str(&markdown_header(report, args));
    out.push_str(&markdown_instructions(args));
    out.push_str(&markdown_summary(report));
    out.push_str(&markdown_work(report, args));
    out.push_str(&markdown_rest(report));
    out
}

fn markdown_header(report: &ProjectReport, args: &ProjectCheckArgs) -> String {
    let failed = report.count(CheckStatus::Failed);
    let warned = report.count(CheckStatus::Warned);
    let verdict = match (failed, warned) {
        (0, 0) => "PASSED — every check is green".to_string(),
        (0, warned) => format!(
            "PASSED with {warned} warning{} — nothing blocking, but the warnings below are real findings",
            plural(warned)
        ),
        (failed, 0) => format!("FAILED — {failed} check{} failed", plural(failed)),
        (failed, warned) => format!(
            "FAILED — {failed} check{} failed and {warned} warned",
            plural(failed)
        ),
    };

    format!(
        "# talos project:check report\n\n\
         - **Verdict:** {verdict}\n\
         - **Command:** `{}`\n\
         - **Workspace:** {}\n\
         - **Generated:** {}\n\
         - **Duration:** {}\n\n",
        command_line(args),
        report.root,
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
        format_duration(report.duration_ms)
    )
}

fn markdown_instructions(args: &ProjectCheckArgs) -> String {
    format!(
        "## How to use this file\n\n\
         You are fixing a project that did not pass its health checks. Every section under \
         \"Work to do\" is one check: what it verifies, everything it found, and the command \
         that re-runs it alone.\n\n\
         1. Failures first, then warnings — a warning is a real finding the run did not stop for.\n\
         2. Each finding line starts with `error` or `warn` and names the file or module it came \
         from. Fix the source it points at.\n\
         3. Never make a check pass by weakening it: do not lower a threshold, delete or skip a \
         test, loosen a rule's configuration, or add a suppression to silence a line.\n\
         4. Fix one check at a time and re-run it with its own command; the findings are capped \
         per check, so a check can still have more to say once the listed ones are gone.\n\
         5. Re-run `{}` when you are done, and keep going until it is green.\n\n",
        command_line(args)
    )
}

fn markdown_summary(report: &ProjectReport) -> String {
    let mut out = format!(
        "## Summary\n\n\
         - checks run: {}\n\
         - failed: {}\n\
         - warnings: {}\n\
         - passed: {}\n\
         - skipped: {}\n\n",
        report.outcomes.len(),
        report.count(CheckStatus::Failed),
        report.count(CheckStatus::Warned),
        report.count(CheckStatus::Passed),
        report.count(CheckStatus::Skipped)
    );

    let work = work(report);
    if work.is_empty() {
        return out;
    }

    out.push_str("| Check | Category | Status | What it found |\n| --- | --- | --- | --- |\n");
    for outcome in work {
        out.push_str(&format!(
            "| {} | {} | {} | {} |\n",
            outcome.id.title(),
            outcome.id.category().title(),
            outcome.status.label(),
            outcome.summary
        ));
    }
    out.push('\n');
    out
}

fn markdown_work(report: &ProjectReport, args: &ProjectCheckArgs) -> String {
    let work = work(report);
    if work.is_empty() {
        return String::new();
    }

    let mut out = format!("## Work to do ({})\n\n", work.len());
    for outcome in work {
        out.push_str(&format!(
            "### {} — {}\n\n- Category: {}\n- Verifies: {}\n- Result: {}\n- Re-run: `{}`\n",
            outcome.id.title(),
            outcome.status.label(),
            outcome.id.category().title(),
            outcome.id.description(),
            outcome.summary,
            rerun(outcome, args)
        ));

        if !outcome.details.is_empty() {
            out.push_str("\nFindings:\n\n");
            for detail in &outcome.details {
                out.push_str(&format!("- {}\n", detail.trim_end()));
            }
        }
        if !outcome.hints.is_empty() {
            out.push_str("\nHow to fix it:\n\n");
            for hint in &outcome.hints {
                out.push_str(&format!("- {hint}\n"));
            }
        }
        // A check with nothing under it said everything in its summary — the
        // heading and the re-run command are the whole of the entry.
        out.push('\n');
    }
    out
}

/// What the run has nothing to ask of: the checks that passed, and the ones
/// that never ran. Named rather than counted, so an agent can tell a check
/// that is green from one that was skipped and might still be hiding work.
fn markdown_rest(report: &ProjectReport) -> String {
    let mut out = String::new();

    let passed = with_status(report, CheckStatus::Passed);
    if !passed.is_empty() {
        out.push_str(&format!(
            "## Passing checks ({})\n\n{}\n\n",
            passed.len(),
            passed
                .iter()
                .map(|outcome| format!("`{}`", outcome.id.key()))
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }

    let skipped = with_status(report, CheckStatus::Skipped);
    if !skipped.is_empty() {
        out.push_str(&format!("## Skipped checks ({})\n\n", skipped.len()));
        for outcome in skipped {
            out.push_str(&format!("- `{}` — {}\n", outcome.id.key(), outcome.summary));
        }
        out.push('\n');
    }

    out
}

fn plural(count: usize) -> &'static str {
    if count == 1 { "" } else { "s" }
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

fn render_json(report: &ProjectReport, args: &ProjectCheckArgs) -> String {
    let command = command_line(args);
    let checks: Vec<Value> = report
        .outcomes
        .iter()
        .map(|outcome| {
            let mut value = check_value(outcome);
            if let Some(object) = value.as_object_mut() {
                object.insert("verifies".to_string(), json!(outcome.id.description()));
                object.insert("rerun".to_string(), json!(rerun(outcome, args)));
            }
            value
        })
        .collect();

    let payload = json!({
        "tool": "talos project:check",
        "cliVersion": env!("CARGO_PKG_VERSION"),
        "generatedAt": chrono::Local::now().to_rfc3339(),
        "command": command,
        "strict": args.strict,
        "root": report.root,
        "durationMs": report.duration_ms,
        "passed": !report.is_failure(args.strict),
        "instructions": [
            "Every section is one check: `verifies` is what it asserts, `details` is what it found, `rerun` is how to check your fix.",
            "Fix the failed checks first, then the warned ones — a warning is a real finding the run did not stop for.",
            "Never make a check pass by weakening it: do not lower a threshold, delete or skip a test, loosen a rule's configuration, or add a suppression.",
            "`details` is capped per check, so a check can still have more to say once the listed findings are gone.",
            format!("Re-run `{command}` until it passes."),
        ],
        "counts": {
            "checks": report.outcomes.len(),
            "failed": report.count(CheckStatus::Failed),
            "warnings": report.count(CheckStatus::Warned),
            "passed": report.count(CheckStatus::Passed),
            "skipped": report.count(CheckStatus::Skipped),
        },
        "work": work(report)
            .iter()
            .map(|outcome| outcome.id.key())
            .collect::<Vec<_>>(),
        "checks": checks,
    });

    format!(
        "{}\n",
        serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".to_string())
    )
}
