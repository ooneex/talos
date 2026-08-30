//! Writing the lint audit to `var/outputs/talos_lint.{md,json}` — the same
//! report the terminal draws, in the shape an agent is handed to fix what it
//! lists.
//!
//! The console report shows the tail of a failing lint as a reminder of
//! something already scrolling past; here it is the whole of the evidence, so
//! the file keeps far more of it. See [`crate::utils::AgentReport`] for the
//! shape every command's report shares.

use crate::utils::{
    AgentReport, ReportEntry, ReportSection, ReportStatus, SummaryRow, report_logs,
};

use super::{LintArgs, LintAudit, LintStatus, ModuleLint};

/// How the file is named, before `--output` picks its extension.
pub const FILE_STEM: &str = "talos_lint";

/// Rebuild the command that produced this report, so the file can tell the
/// agent how to check its own work.
///
/// `--output` is deliberately dropped: the agent re-runs the lint to see
/// whether it is green, not to overwrite the file it is reading.
pub fn command_line(args: &LintArgs) -> String {
    let mut parts = vec!["talos lint".to_string()];
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

/// Gather what the lint found into the report an agent works from.
pub fn report(args: &LintArgs, audit: &LintAudit, elapsed_ms: u64) -> AgentReport {
    let broken = audit.broken();
    let ran = audit.ran().len();

    AgentReport {
        tool: "talos lint".to_string(),
        stem: FILE_STEM.to_string(),
        command: command_line(args),
        elapsed_ms,
        passed: broken.is_empty(),
        summary: vec![SummaryRow {
            label: "Lint".to_string(),
            key: "lint".to_string(),
            status: if broken.is_empty() {
                ReportStatus::Pass
            } else {
                ReportStatus::Fail
            },
            found: format!(
                "{ran} module{} linted · {} failing · {} cached",
                if ran == 1 { "" } else { "s" },
                broken.len(),
                audit.cached()
            ),
        }],
        sections: vec![ReportSection {
            title: "Lint failures".to_string(),
            key: "lintFailures".to_string(),
            blurb: "each module below failed `tsc --noEmit` or biome, or could not run its \
                    lint script at all"
                .to_string(),
            entries: broken.iter().map(|module| entry(module)).collect(),
        }],
    }
}

fn entry(module: &ModuleLint) -> ReportEntry {
    let reason = match &module.status {
        LintStatus::Errored(reason) => format!("the lint script could not run: {reason}"),
        _ => "`tsc --noEmit` or biome reported the errors below".to_string(),
    };

    ReportEntry {
        name: module.name.clone(),
        path: module.label.clone(),
        reason,
        rerun: format!("talos lint --modules={} --logs", module.name),
        details: Vec::new(),
        logs: report_logs(&module.output),
    }
}
