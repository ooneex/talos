//! Writing the build's results to `var/outputs/talos_build.{md,json}` — the
//! same report the terminal draws, in the shape an agent is handed to fix
//! what it lists.
//!
//! What the console truncates, this keeps: a build that failed did so for a
//! reason buried in its output, and the agent reading this file has no
//! terminal to scroll back in. See [`crate::utils::AgentReport`] for the
//! shape every command's report shares.

use crate::utils::{
    AgentReport, ReportEntry, ReportSection, ReportStatus, SummaryRow, report_logs,
};

use super::{BuildArgs, BuildStatus, TargetBuild};

/// How the file is named, before `--output` picks its extension.
pub const FILE_STEM: &str = "talos_build";

/// Rebuild the command that produced this report, so the file can tell the
/// agent how to check its own work.
///
/// `--output` is deliberately dropped: the agent re-runs the build to see
/// whether it is green, not to overwrite the file it is reading.
pub fn command_line(args: &BuildArgs) -> String {
    let mut parts = vec!["talos build".to_string()];
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

/// Gather what the build found into the report an agent works from.
pub fn report(
    args: &BuildArgs,
    results: &[TargetBuild],
    elapsed_ms: u64,
    ran: usize,
    cached: usize,
) -> AgentReport {
    let broken: Vec<&TargetBuild> = results
        .iter()
        .filter(|result| result.status == BuildStatus::Failed)
        .collect();

    let found = format!(
        "{ran} target{} built · {cached} cached · {} failing",
        if ran == 1 { "" } else { "s" },
        broken.len()
    );

    AgentReport {
        tool: "talos build".to_string(),
        stem: FILE_STEM.to_string(),
        command: command_line(args),
        elapsed_ms,
        passed: broken.is_empty(),
        summary: vec![SummaryRow {
            label: "Build".to_string(),
            key: "build".to_string(),
            status: if broken.is_empty() {
                ReportStatus::Pass
            } else {
                ReportStatus::Fail
            },
            found,
        }],
        sections: vec![ReportSection {
            title: "Build failures".to_string(),
            key: "buildFailures".to_string(),
            blurb: "each target below failed its build script, and everything that \
                    depends on it never got to build at all"
                .to_string(),
            entries: broken.iter().map(|result| entry(result)).collect(),
        }],
    }
}

fn entry(result: &TargetBuild) -> ReportEntry {
    ReportEntry {
        name: result.name.clone(),
        path: result.key.clone(),
        reason: "the build script exited non-zero — the output below says why".to_string(),
        rerun: format!("talos build {} --logs", result.selector),
        details: Vec::new(),
        logs: report_logs(&result.output),
    }
}
