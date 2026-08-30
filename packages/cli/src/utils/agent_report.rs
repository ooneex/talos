//! `--output` — the report a command leaves behind for an AI agent to work
//! from, in the shape `check` established.
//!
//! A console report is written for someone watching it: it colours, ranks,
//! truncates and gets out of the way. A file handed to an agent is read once,
//! with no terminal to scroll back in and no workspace knowledge beyond what
//! it says, so this one keeps what the console drops — every failing target's
//! log — and names each one by a path relative to the workspace root.
//!
//! `build`, `fmt`, `lint` and `coverage` all leave the same kind of file
//! behind: a verdict, a summary of what each section found, and the entries
//! that need work with their evidence attached. Only the entries differ, so
//! only the entries are each command's own — the rendering lives here, and a
//! command builds an [`AgentReport`] instead of a markdown string.

use std::path::{Path, PathBuf};

use console::strip_ansi_codes;
use serde_json::{Value, json};

use super::report_output::{OutputFormat, write_report_file};
use super::style::info;
use super::workspace_task::format_duration;

/// How much of a failing run's output a report carries.
///
/// Three times what a console report shows: there the log is a reminder of
/// something already scrolling past, here it is the whole of the evidence.
pub const LOG_TAIL_LINES: usize = 120;

/// How a section of the report ended.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ReportStatus {
    Pass,
    Fail,
    /// The step itself could not run.
    Errored,
}

impl ReportStatus {
    pub fn slug(self) -> &'static str {
        match self {
            ReportStatus::Pass => "pass",
            ReportStatus::Fail => "fail",
            ReportStatus::Errored => "error",
        }
    }
}

/// One line of the summary table, and the same line's entry in the JSON
/// `summary` object.
pub struct SummaryRow {
    /// How the row is titled in the markdown table — `Lint`.
    pub label: String,
    /// How the row is keyed in the JSON summary — `lint`.
    pub key: String,
    pub status: ReportStatus,
    /// What the section found, in one sentence — `18 modules linted · 2
    /// failing`.
    pub found: String,
}

/// One thing the agent has to fix, with everything it needs to fix it.
pub struct ReportEntry {
    /// `color` — the module or package name, for the re-run selector.
    pub name: String,
    /// `packages/color` — where it lives, relative to the workspace root.
    pub path: String,
    /// Why it is in the report, in the agent's terms.
    pub reason: String,
    /// The command that re-runs this entry alone.
    pub rerun: String,
    /// Anything else worth stating outright — a coverage rate, the files
    /// under it. Rendered as bullets, carried in JSON as a list.
    pub details: Vec<String>,
    /// The captured output, already tailed. Empty when there was none.
    pub logs: String,
}

/// A group of entries that failed the same way.
pub struct ReportSection {
    /// `Lint failures` — the markdown heading.
    pub title: String,
    /// `lintFailures` — the JSON key its entries are carried under.
    pub key: String,
    /// What the section is, for an agent that has never seen this file before.
    pub blurb: String,
    pub entries: Vec<ReportEntry>,
}

/// What a command found, gathered in one place so a report can be rendered
/// from it without re-running anything.
pub struct AgentReport {
    /// `talos lint` — the command this report speaks for.
    pub tool: String,
    /// `talos_lint` — how the file is named, before `--output` picks its
    /// extension.
    pub stem: String,
    /// The exact command that produced this report, for the agent to re-run.
    pub command: String,
    pub elapsed_ms: u64,
    /// Whether the run passed — the same verdict the process exits with.
    pub passed: bool,
    pub summary: Vec<SummaryRow>,
    pub sections: Vec<ReportSection>,
}

impl AgentReport {
    /// The sections that actually carry work, so an empty one never opens a
    /// heading over nothing.
    fn worked(&self) -> Vec<&ReportSection> {
        self.sections
            .iter()
            .filter(|section| !section.entries.is_empty())
            .collect()
    }
}

/// Render the report and write it under `var/outputs`, returning where it
/// landed.
pub fn write_agent_report(
    root: &Path,
    format: OutputFormat,
    report: &AgentReport,
) -> Result<PathBuf, String> {
    write_report_file(root, &report.stem, format, &render(format, report))
}

pub fn render(format: OutputFormat, report: &AgentReport) -> String {
    match format {
        OutputFormat::Md => render_markdown(report),
        OutputFormat::Json => render_json(report),
    }
}

/// The captured output of a run, stripped of the colours a terminal wanted
/// and cut to its tail — the end of a failing log is the part that says why.
pub fn logs(output: &str) -> String {
    let plain = strip_ansi_codes(output).to_string();
    let lines: Vec<&str> = plain
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    let start = lines.len().saturating_sub(LOG_TAIL_LINES);
    if lines.is_empty() {
        return "(no output captured)".to_string();
    }
    lines[start..].join("\n")
}

/// Say where the report landed, or why it could not be written.
///
/// A report that could not be written is a warning rather than a failure: the
/// verdict is about the workspace, not about a file the run was asked to leave
/// behind, and the console has already carried every finding.
pub fn announce(written: Result<PathBuf, String>) {
    match written {
        Ok(path) => {
            println!();
            super::style::success(format!("Report written to {}", path.display()));
            info("Hand this file to an AI agent to fix what it lists");
        }
        Err(message) => super::style::warn(message),
    }
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

fn render_markdown(report: &AgentReport) -> String {
    let mut out = String::new();
    out.push_str(&markdown_header(report));
    out.push_str(&markdown_instructions(report));
    out.push_str(&markdown_summary(report));
    for section in report.worked() {
        out.push_str(&markdown_section(section));
    }
    out
}

fn markdown_header(report: &AgentReport) -> String {
    let verdict = if report.passed {
        "PASSED — nothing below needs work"
    } else {
        "FAILED — the sections below are what broke it"
    };

    format!(
        "# {} report\n\n\
         - **Verdict:** {verdict}\n\
         - **Command:** `{}`\n\
         - **Generated:** {}\n\
         - **Duration:** {}\n\n",
        report.tool,
        report.command,
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
        format_duration(report.elapsed_ms)
    )
}

fn markdown_instructions(report: &AgentReport) -> String {
    format!(
        "## How to use this file\n\n\
         This file is the whole of the evidence — every path is relative to the \
         workspace root, and every section below is work.\n\n\
         1. Fix the source the report points at, never the report's verdict — do \
         not delete or skip a test, weaken an assertion, or add a lint or \
         `talos-ignore` suppression to make a line go away.\n\
         2. Keep every public signature and every passing test working.\n\
         3. Re-run `{}` when you are done, and keep going until it is green.\n\n",
        report.command
    )
}

fn markdown_summary(report: &AgentReport) -> String {
    let mut out =
        String::from("## Summary\n\n| Section | Status | What it found |\n| --- | --- | --- |\n");
    for row in &report.summary {
        out.push_str(&format!(
            "| {} | {} | {} |\n",
            row.label,
            row.status.slug(),
            row.found
        ));
    }
    out.push('\n');
    out
}

fn markdown_section(section: &ReportSection) -> String {
    let mut out = format!(
        "## {} ({})\n\n{}\n\n",
        section.title,
        section.entries.len(),
        section.blurb
    );

    for entry in &section.entries {
        out.push_str(&format!(
            "### `{}`\n\n- Why: {}\n",
            entry.path, entry.reason
        ));
        for detail in &entry.details {
            out.push_str(&format!("- {detail}\n"));
        }
        out.push_str(&format!("- Re-run: `{}`\n\n", entry.rerun));
        if !entry.logs.is_empty() {
            out.push_str(&format!("```text\n{}\n```\n\n", entry.logs));
        }
    }

    out
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

fn render_json(report: &AgentReport) -> String {
    let mut value = json!({
        "tool": report.tool,
        "cliVersion": env!("CARGO_PKG_VERSION"),
        "generatedAt": chrono::Local::now().to_rfc3339(),
        "command": report.command,
        "durationMs": report.elapsed_ms,
        "passed": report.passed,
        "instructions": instructions_json(report),
        "summary": summary_json(report),
    });

    // Every section is keyed at the top level rather than nested under one
    // `sections` array, so a consumer reads `lintFailures` by name instead of
    // searching for it.
    for section in &report.sections {
        value[section.key.clone()] = entries_json(&section.entries);
    }

    format!(
        "{}\n",
        serde_json::to_string_pretty(&value).unwrap_or_default()
    )
}

fn instructions_json(report: &AgentReport) -> Value {
    let mut lines = vec![
        "Every path is relative to the workspace root.".to_string(),
        "Fix the source each entry points at, never the verdict: do not delete or skip a test, \
         weaken an assertion, or add a lint or talos-ignore suppression."
            .to_string(),
    ];
    for section in report.worked() {
        lines.push(format!(
            "Work through {} top to bottom — {}.",
            section.key,
            section.blurb.trim_end_matches('.')
        ));
    }
    lines.push(format!("Re-run `{}` until it passes.", report.command));
    json!(lines)
}

fn summary_json(report: &AgentReport) -> Value {
    let mut summary = serde_json::Map::new();
    for row in &report.summary {
        summary.insert(
            row.key.clone(),
            json!({ "status": row.status.slug(), "found": row.found }),
        );
    }
    Value::Object(summary)
}

fn entries_json(entries: &[ReportEntry]) -> Value {
    let rendered: Vec<Value> = entries
        .iter()
        .map(|entry| {
            json!({
                "name": entry.name,
                "path": entry.path,
                "reason": entry.reason,
                "details": entry.details,
                "rerun": entry.rerun,
                "logs": entry.logs,
            })
        })
        .collect();
    json!(rendered)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry() -> ReportEntry {
        ReportEntry {
            name: "color".to_string(),
            path: "packages/color".to_string(),
            reason: "the lint script failed".to_string(),
            rerun: "talos lint --packages=color --logs".to_string(),
            details: vec!["Lines: 41%".to_string()],
            logs: "boom".to_string(),
        }
    }

    fn report(entries: Vec<ReportEntry>) -> AgentReport {
        AgentReport {
            tool: "talos lint".to_string(),
            stem: "talos_lint".to_string(),
            command: "talos lint".to_string(),
            elapsed_ms: 1200,
            passed: entries.is_empty(),
            summary: vec![SummaryRow {
                label: "Lint".to_string(),
                key: "lint".to_string(),
                status: if entries.is_empty() {
                    ReportStatus::Pass
                } else {
                    ReportStatus::Fail
                },
                found: "1 module linted".to_string(),
            }],
            sections: vec![ReportSection {
                title: "Lint failures".to_string(),
                key: "lintFailures".to_string(),
                blurb: "each module below failed its lint script".to_string(),
                entries,
            }],
        }
    }

    #[test]
    fn logs_tails_the_output_and_drops_its_colours_and_blank_lines() {
        let mut lines: Vec<String> = (1..=200).map(|n| format!("line-{n}")).collect();
        lines.insert(5, String::new());
        lines.insert(9, "\u{1b}[31mred\u{1b}[0m".to_string());

        let tailed = logs(&lines.join("\n"));
        let kept: Vec<&str> = tailed.lines().collect();

        assert_eq!(kept.len(), LOG_TAIL_LINES);
        assert_eq!(kept.last(), Some(&"line-200"));
        assert!(!tailed.contains('\u{1b}'));
        assert!(kept.iter().all(|line| !line.trim().is_empty()));
    }

    #[test]
    fn logs_says_so_when_a_run_captured_nothing() {
        assert_eq!(logs("   \n\n"), "(no output captured)");
    }

    #[test]
    fn markdown_carries_the_verdict_the_summary_and_every_entry() {
        let rendered = render(OutputFormat::Md, &report(vec![entry()]));

        assert!(rendered.contains("# talos lint report"));
        assert!(rendered.contains("FAILED"));
        assert!(rendered.contains("| Lint | fail | 1 module linted |"));
        assert!(rendered.contains("## Lint failures (1)"));
        assert!(rendered.contains("### `packages/color`"));
        assert!(rendered.contains("- Lines: 41%"));
        assert!(rendered.contains("talos lint --packages=color --logs"));
        assert!(rendered.contains("```text\nboom\n```"));
    }

    #[test]
    fn markdown_opens_no_heading_over_a_section_with_nothing_in_it() {
        let rendered = render(OutputFormat::Md, &report(Vec::new()));

        assert!(rendered.contains("PASSED"));
        assert!(!rendered.contains("## Lint failures"));
    }

    #[test]
    fn json_keys_every_section_at_the_top_level() {
        let rendered = render(OutputFormat::Json, &report(vec![entry()]));
        let value: Value = serde_json::from_str(&rendered).expect("valid json");

        assert_eq!(value["tool"], json!("talos lint"));
        assert_eq!(value["passed"], json!(false));
        assert_eq!(value["summary"]["lint"]["status"], json!("fail"));
        assert_eq!(value["lintFailures"][0]["path"], json!("packages/color"));
        assert_eq!(value["lintFailures"][0]["details"][0], json!("Lines: 41%"));
        assert!(
            value["instructions"]
                .as_array()
                .expect("a list")
                .iter()
                .any(|line| line.as_str().unwrap_or_default().contains("lintFailures"))
        );
    }

    #[test]
    fn json_carries_an_empty_section_as_an_empty_list() {
        let rendered = render(OutputFormat::Json, &report(Vec::new()));
        let value: Value = serde_json::from_str(&rendered).expect("valid json");

        assert_eq!(value["lintFailures"], json!([]));
        assert_eq!(value["summary"]["lint"]["status"], json!("pass"));
    }
}
