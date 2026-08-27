//! Rendering the aggregate report as either the human-readable console
//! output or JSON, shared by the `--json` flag and every consumer that
//! wants the same summary.

use std::collections::BTreeSet;

use console::style;
use serde_json::{Value, json};

use crate::utils::format_duration;

use super::types::Category;
use super::{CheckOutcome, CheckStatus, ProjectReport};

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/// Render the human report. Returns a string so the layout stays testable.
pub fn render_report(report: &ProjectReport) -> String {
    let mut out = String::new();
    out.push_str(&render_header(report));
    out.push_str(&render_summary_table(report));
    out.push_str(&render_details(report));
    out.push_str(&render_verdict(report));
    out
}

/// Renders the "▸ Project check" banner line with the check count and root.
fn render_header(report: &ProjectReport) -> String {
    format!(
        "\n{}{}\n\n",
        style("▸ Project check").magenta().bold(),
        style(format!(
            "  {} check{} · {}",
            report.outcomes.len(),
            if report.outcomes.len() == 1 { "" } else { "s" },
            report.root
        ))
        .dim()
    )
}

/// Renders the one-line-per-check summary table, grouped by category when
/// more than one category is present in the report.
fn render_summary_table(report: &ProjectReport) -> String {
    let width = report
        .outcomes
        .iter()
        .map(|outcome| outcome.id.title().len())
        .max()
        .unwrap_or(0);
    // Keep the durations in one column without letting a long summary push
    // them off screen.
    let summary_width = report
        .outcomes
        .iter()
        .map(|outcome| outcome.summary.chars().count())
        .max()
        .unwrap_or(0)
        .min(64);

    // Sixty rows in one block is a wall. Grouping them under the dimension they
    // belong to is what makes the table skimmable again, and a run narrowed to
    // a single category reads exactly as it did before.
    let grouped = report
        .outcomes
        .iter()
        .map(|outcome| outcome.id.category())
        .collect::<BTreeSet<_>>()
        .len()
        > 1;

    let mut out = String::new();
    for category in Category::ALL {
        let outcomes: Vec<&CheckOutcome> = report
            .outcomes
            .iter()
            .filter(|outcome| outcome.id.category() == category)
            .collect();
        if outcomes.is_empty() {
            continue;
        }

        if grouped {
            out.push_str(&format!("  {}\n", style(category.title()).dim().bold()));
        }
        for outcome in outcomes {
            out.push_str(&format!(
                "  {}  {}  {}  {}\n",
                outcome.status.icon(),
                style(format!("{:<width$}", outcome.id.title())).bold(),
                outcome
                    .status
                    .paint(&format!("{:<summary_width$}", outcome.summary)),
                style(if outcome.cached {
                    "cached".to_string()
                } else {
                    format_duration(outcome.duration_ms)
                })
                .dim(),
            ));
        }
        if grouped {
            out.push('\n');
        }
    }
    out
}

/// Renders the details/hints block for every non-passing check that has
/// something to say.
fn render_details(report: &ProjectReport) -> String {
    let mut out = String::new();
    for outcome in &report.outcomes {
        if outcome.details.is_empty() && outcome.hints.is_empty() {
            continue;
        }
        if outcome.status == CheckStatus::Passed {
            continue;
        }
        out.push('\n');
        out.push_str(&format!(
            "  {}\n",
            style(outcome.id.title()).bold().underlined()
        ));
        for detail in &outcome.details {
            out.push_str(&format!("    {} {}\n", style("·").dim(), detail));
        }
        for hint in &outcome.hints {
            out.push_str(&format!("    {}\n", style(format!("→ {hint}")).dim()));
        }
    }
    out
}

/// Renders the final one-line verdict (failed/warned/passed/skipped/cached
/// counts, colored by overall status, with the total duration).
fn render_verdict(report: &ProjectReport) -> String {
    let failed = report.count(CheckStatus::Failed);
    let warned = report.count(CheckStatus::Warned);
    let passed = report.count(CheckStatus::Passed);
    let skipped = report.count(CheckStatus::Skipped);

    let mut parts = vec![
        format!("{failed} failed"),
        format!("{warned} warning{}", if warned == 1 { "" } else { "s" }),
        format!("{passed} passed"),
    ];
    if skipped > 0 {
        parts.push(format!("{skipped} skipped"));
    }
    let cached = report
        .outcomes
        .iter()
        .filter(|outcome| outcome.cached)
        .count();
    if cached > 0 {
        parts.push(format!("{cached} cached"));
    }

    let (icon, summary) = if failed > 0 {
        (
            style("✖").red().bold().to_string(),
            style(parts.join(" · ")).red().to_string(),
        )
    } else if warned > 0 {
        (
            style("⚠").yellow().bold().to_string(),
            style(parts.join(" · ")).yellow().to_string(),
        )
    } else {
        (
            style("✔").green().bold().to_string(),
            style(parts.join(" · ")).green().to_string(),
        )
    };

    format!(
        "\n  {icon} {summary}{}\n",
        style(format!("  in {}", format_duration(report.duration_ms))).dim()
    )
}

/// Render the report as plain, uncolored text meant to be pasted into an LLM
/// conversation — no ANSI codes, no column truncation, and every detail and
/// hint spelled out under the check that raised it. `--logs` asks for this in
/// place of the human report so a check run can be handed straight to an
/// assistant (`pr-review`, `project-fix`) without it having to strip styling
/// or guess what a summary was cut short of.
pub fn render_llm(report: &ProjectReport) -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "# Project check — {} check{} · {}\n\n",
        report.outcomes.len(),
        if report.outcomes.len() == 1 { "" } else { "s" },
        report.root
    ));

    out.push_str("## Summary\n\n");
    out.push_str(&format!(
        "- failed: {}\n",
        report.count(CheckStatus::Failed)
    ));
    out.push_str(&format!(
        "- warnings: {}\n",
        report.count(CheckStatus::Warned)
    ));
    out.push_str(&format!(
        "- passed: {}\n",
        report.count(CheckStatus::Passed)
    ));
    out.push_str(&format!(
        "- skipped: {}\n",
        report.count(CheckStatus::Skipped)
    ));
    out.push_str(&format!(
        "- duration: {}\n\n",
        format_duration(report.duration_ms)
    ));

    out.push_str("## Results\n\n");
    for category in Category::ALL {
        let outcomes: Vec<&CheckOutcome> = report
            .outcomes
            .iter()
            .filter(|outcome| outcome.id.category() == category)
            .collect();
        if outcomes.is_empty() {
            continue;
        }
        for outcome in outcomes {
            out.push_str(&format!(
                "- [{}] {} — {}{}\n",
                llm_status_label(outcome.status),
                outcome.id.title(),
                outcome.summary,
                if outcome.cached {
                    " (cached)".to_string()
                } else {
                    format!(" ({})", format_duration(outcome.duration_ms))
                },
            ));
        }
    }

    let detailed: Vec<&CheckOutcome> = report
        .outcomes
        .iter()
        .filter(|outcome| outcome.status != CheckStatus::Passed)
        .filter(|outcome| !outcome.details.is_empty() || !outcome.hints.is_empty())
        .collect();
    if !detailed.is_empty() {
        out.push_str("\n## Details\n");
        for outcome in detailed {
            out.push_str(&format!("\n### {}\n\n", outcome.id.title()));
            for detail in &outcome.details {
                out.push_str(&format!("- {detail}\n"));
            }
            for hint in &outcome.hints {
                out.push_str(&format!("- hint: {hint}\n"));
            }
        }
    }

    out.push('\n');
    out
}

fn llm_status_label(status: CheckStatus) -> &'static str {
    match status {
        CheckStatus::Passed => "PASS",
        CheckStatus::Skipped => "SKIP",
        CheckStatus::Warned => "WARN",
        CheckStatus::Failed => "FAIL",
    }
}

/// One check, as both the CI report and the `--output=json` file spell it out.
pub(super) fn check_value(outcome: &CheckOutcome) -> Value {
    json!({
        "id": outcome.id.key(),
        "title": outcome.id.title(),
        "category": outcome.id.category().key(),
        "status": outcome.status.label(),
        "cached": outcome.cached,
        "summary": outcome.summary,
        "details": outcome.details,
        "hints": outcome.hints,
        "durationMs": outcome.duration_ms,
    })
}

/// Render the machine-readable report used by CI.
pub fn render_json(report: &ProjectReport) -> String {
    let payload = json!({
        "root": report.root,
        "durationMs": report.duration_ms,
        "failed": report.count(CheckStatus::Failed),
        "warnings": report.count(CheckStatus::Warned),
        "passed": report.count(CheckStatus::Passed),
        "skipped": report.count(CheckStatus::Skipped),
        "checks": report.outcomes.iter().map(check_value).collect::<Vec<_>>(),
    });
    serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".to_string())
}
