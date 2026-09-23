//! Writing the update run's results to `var/outputs/talos_update.{md,json}` —
//! the same report the terminal draws, in the shape an agent is handed to fix
//! what it lists.
//!
//! See [`crate::utils::AgentReport`] for the shape every command's report
//! shares.

use crate::commands::security_check::{SecurityAudit, SecurityFinding};
use crate::utils::{
    AgentReport, ReportEntry, ReportSection, ReportStatus, SummaryRow, report_logs,
};

use super::{CommandStep, UpdateArgs, UpdateResult};

/// How the file is named, before `--output` picks its extension.
pub const FILE_STEM: &str = "talos_update";

/// Rebuild the command that produced this report, so the file can tell the
/// agent how to check its own work.
///
/// `--output` is deliberately dropped: the agent re-runs the update to see
/// whether it is green, not to overwrite the file it is reading.
pub fn command_line(args: &UpdateArgs) -> String {
    let mut parts = vec!["talos update".to_string()];
    if let Some(deps) = &args.deps {
        parts.push(format!("--deps={deps}"));
    }
    if args.latest {
        parts.push("--latest".to_string());
    }
    if args.force {
        parts.push("--force".to_string());
    }
    if let Some(level) = &args.audit_level {
        parts.push(format!("--audit-level={level}"));
    }
    if args.skip_audit {
        parts.push("--skip-audit".to_string());
    }
    if args.no_cache {
        parts.push("--no-cache".to_string());
    }
    if args.logs {
        parts.push("--logs".to_string());
    }
    parts.join(" ")
}

/// Gather what the update found into the report an agent works from.
pub fn report(args: &UpdateArgs, result: &UpdateResult, elapsed_ms: u64) -> AgentReport {
    let findings = findings_of(result);
    let failures = command_failures(args, result);

    AgentReport {
        tool: "talos update".to_string(),
        stem: FILE_STEM.to_string(),
        command: command_line(args),
        elapsed_ms,
        passed: result.passed(),
        summary: vec![
            resolve_row(result),
            audit_row(args, result),
            apply_row(args, result),
        ],
        sections: vec![
            ReportSection {
                title: "Vulnerable dependencies".to_string(),
                key: "vulnerabilities".to_string(),
                blurb: "each dependency below has a known vulnerability at the version the \
                        update would install"
                    .to_string(),
                entries: findings.into_iter().map(finding_entry).collect(),
            },
            ReportSection {
                title: "Update failures".to_string(),
                key: "updateFailures".to_string(),
                blurb: "each step below could not finish — bun printed the errors below"
                    .to_string(),
                entries: failures,
            },
        ],
    }
}

fn findings_of(result: &UpdateResult) -> Vec<&SecurityFinding> {
    match &result.audit {
        Some(Ok(audit)) => audit.findings.iter().collect(),
        _ => Vec::new(),
    }
}

fn resolve_row(result: &UpdateResult) -> SummaryRow {
    let (status, found) = if !result.resolve.ran {
        (ReportStatus::Pass, "skipped — --skip-audit".to_string())
    } else if result.resolve.passed {
        (ReportStatus::Pass, "dependency graph resolved".to_string())
    } else {
        (
            ReportStatus::Fail,
            "could not resolve updated dependencies".to_string(),
        )
    };

    SummaryRow {
        label: "Resolve".to_string(),
        key: "resolve".to_string(),
        status,
        found,
    }
}

fn audit_row(args: &UpdateArgs, result: &UpdateResult) -> SummaryRow {
    let (status, found) = match &result.audit {
        None if args.skip_audit => (ReportStatus::Pass, "skipped — --skip-audit".to_string()),
        None => (ReportStatus::Errored, "audit did not run".to_string()),
        Some(Err(message)) => (
            ReportStatus::Errored,
            format!("audit could not run: {message}"),
        ),
        Some(Ok(audit)) if audit.findings.is_empty() => (
            ReportStatus::Pass,
            scanned(audit, "no known vulnerabilities"),
        ),
        Some(Ok(audit)) if result.blocked => (
            ReportStatus::Fail,
            scanned(
                audit,
                &format!(
                    "{} vulnerabilit{} — update blocked",
                    audit.findings.len(),
                    if audit.findings.len() == 1 {
                        "y"
                    } else {
                        "ies"
                    }
                ),
            ),
        ),
        Some(Ok(audit)) if result.forced => (
            ReportStatus::Fail,
            scanned(
                audit,
                &format!(
                    "{} vulnerabilit{} — updated anyway (--force)",
                    audit.findings.len(),
                    if audit.findings.len() == 1 {
                        "y"
                    } else {
                        "ies"
                    }
                ),
            ),
        ),
        Some(Ok(audit)) => (
            ReportStatus::Fail,
            scanned(
                audit,
                &format!(
                    "{} vulnerabilit{} found",
                    audit.findings.len(),
                    if audit.findings.len() == 1 {
                        "y"
                    } else {
                        "ies"
                    }
                ),
            ),
        ),
    };

    SummaryRow {
        label: "Audit".to_string(),
        key: "audit".to_string(),
        status,
        found,
    }
}

fn scanned(audit: &SecurityAudit, detail: &str) -> String {
    format!(
        "{} module{} · {} dependenc{} scanned · {detail}",
        audit.modules,
        if audit.modules == 1 { "" } else { "s" },
        audit.dependencies,
        if audit.dependencies == 1 { "y" } else { "ies" }
    )
}

fn apply_row(args: &UpdateArgs, result: &UpdateResult) -> SummaryRow {
    let program = if args.skip_audit {
        "bun update"
    } else {
        "bun install"
    };
    let (status, found) = if result.apply.passed {
        (ReportStatus::Pass, "dependencies updated".to_string())
    } else if result.blocked {
        (
            ReportStatus::Fail,
            "not installed — update blocked".to_string(),
        )
    } else if result.resolve.ran && !result.resolve.passed {
        (
            ReportStatus::Fail,
            "not installed — resolve failed".to_string(),
        )
    } else if !result.apply.ran {
        (
            ReportStatus::Fail,
            "not installed — audit could not complete".to_string(),
        )
    } else {
        (ReportStatus::Fail, format!("{program} failed"))
    };

    SummaryRow {
        label: "Update".to_string(),
        key: "update".to_string(),
        status,
        found,
    }
}

fn finding_entry(finding: &SecurityFinding) -> ReportEntry {
    let mut details = vec![format!("Severity: {}", finding.severity)];
    if !finding.version.is_empty() {
        details.push(format!("Version: {}", finding.version));
    }
    if !finding.remediation.is_empty() {
        details.push(format!("Patched: {}", finding.remediation));
    }
    if !finding.url.is_empty() {
        details.push(format!("Advisory: {}", finding.url));
    }

    let subject = if finding.version.is_empty() {
        finding.subject.clone()
    } else {
        format!("{}@{}", finding.subject, finding.version)
    };

    ReportEntry {
        name: finding.subject.clone(),
        path: finding.module.clone(),
        reason: format!("{subject} — {}", finding.title),
        rerun: format!("talos update --deps={} --logs", finding.subject),
        details,
        logs: String::new(),
    }
}

fn command_failures(args: &UpdateArgs, result: &UpdateResult) -> Vec<ReportEntry> {
    let mut entries = Vec::new();
    if result.resolve.ran && !result.resolve.passed {
        entries.push(command_entry(
            "resolve",
            "bun update --lockfile-only failed — the output below says why",
            &result.resolve,
            args,
        ));
    }
    if result.apply.ran && !result.apply.passed {
        let program = if args.skip_audit {
            "bun update"
        } else {
            "bun install"
        };
        entries.push(command_entry(
            if args.skip_audit { "update" } else { "install" },
            &format!("{program} failed — the output below says why"),
            &result.apply,
            args,
        ));
    }
    entries
}

fn command_entry(name: &str, reason: &str, step: &CommandStep, args: &UpdateArgs) -> ReportEntry {
    let mut rerun = command_line(args);
    if !args.logs {
        rerun.push_str(" --logs");
    }

    ReportEntry {
        name: name.to_string(),
        path: "package.json".to_string(),
        reason: reason.to_string(),
        rerun,
        details: step
            .error
            .as_ref()
            .map(|message| vec![message.clone()])
            .unwrap_or_default(),
        logs: report_logs(&step.output),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::security_check::SecurityFinding;

    fn args() -> UpdateArgs {
        UpdateArgs {
            deps: None,
            latest: false,
            force: false,
            audit_level: None,
            skip_audit: false,
            no_cache: false,
            logs: false,
            output: None,
            cwd: None,
        }
    }

    fn finding() -> SecurityFinding {
        SecurityFinding {
            module: "root".to_string(),
            source: "npm".to_string(),
            subject: "lodash".to_string(),
            version: "4.17.20".to_string(),
            severity: "HIGH".to_string(),
            id: "GHSA-xxxx".to_string(),
            title: "Prototype pollution".to_string(),
            url: "https://example.test/lodash".to_string(),
            remediation: "4.17.21".to_string(),
        }
    }

    #[test]
    fn the_command_line_is_the_update_without_its_own_output_flag() {
        let mut args = args();
        args.deps = Some("lodash,zod".to_string());
        args.latest = true;
        args.force = true;
        args.audit_level = Some("critical".to_string());
        args.skip_audit = true;
        args.no_cache = true;
        args.logs = true;
        args.output = Some(crate::utils::OutputFormat::Md);
        args.cwd = Some("./here".to_string());

        assert_eq!(
            command_line(&args),
            "talos update --deps=lodash,zod --latest --force --audit-level=critical --skip-audit --no-cache --logs"
        );
    }

    #[test]
    fn the_command_line_of_a_bare_update_is_bare() {
        assert_eq!(command_line(&args()), "talos update");
    }

    #[test]
    fn a_green_update_carries_no_work() {
        let result = UpdateResult {
            resolve: CommandStep {
                ran: true,
                passed: true,
                ..CommandStep::default()
            },
            audit: Some(Ok(SecurityAudit {
                modules: 1,
                dependencies: 12,
                ..SecurityAudit::default()
            })),
            apply: CommandStep {
                ran: true,
                passed: true,
                ..CommandStep::default()
            },
            ..UpdateResult::default()
        };

        let report = report(&args(), &result, 40);

        assert!(report.passed);
        assert_eq!(report.stem, "talos_update");
        assert_eq!(report.summary[0].found, "dependency graph resolved");
        assert!(report.summary[1].found.contains("no known vulnerabilities"));
        assert_eq!(report.summary[2].found, "dependencies updated");
        assert!(
            report
                .sections
                .iter()
                .all(|section| section.entries.is_empty())
        );
    }

    #[test]
    fn a_blocked_update_lists_each_vulnerable_dependency() {
        let result = UpdateResult {
            resolve: CommandStep {
                ran: true,
                passed: true,
                ..CommandStep::default()
            },
            audit: Some(Ok(SecurityAudit {
                findings: vec![finding()],
                modules: 1,
                dependencies: 12,
                llm_files: 0,
            })),
            blocked: true,
            ..UpdateResult::default()
        };

        let report = report(&args(), &result, 40);
        let entry = &report.sections[0].entries[0];

        assert!(!report.passed);
        assert_eq!(report.summary[1].status.slug(), "fail");
        assert!(report.summary[1].found.contains("update blocked"));
        assert_eq!(report.summary[2].found, "not installed — update blocked");
        assert_eq!(entry.name, "lodash");
        assert_eq!(entry.path, "root");
        assert_eq!(entry.rerun, "talos update --deps=lodash --logs");
        assert!(entry.reason.contains("Prototype pollution"));
        assert!(entry.details.iter().any(|line| line.contains("4.17.21")));
    }

    #[test]
    fn a_failed_bun_step_carries_its_output_and_a_rerun_with_logs() {
        let result = UpdateResult {
            apply: CommandStep {
                ran: true,
                passed: false,
                output: "error: failed to resolve".to_string(),
                error: Some("exit code: 1".to_string()),
            },
            ..UpdateResult::default()
        };
        let mut args = args();
        args.skip_audit = true;

        let report = report(&args, &result, 12);
        let entry = &report.sections[1].entries[0];

        assert!(!report.passed);
        assert_eq!(report.summary[2].found, "bun update failed");
        assert_eq!(entry.name, "update");
        assert_eq!(entry.path, "package.json");
        assert_eq!(entry.rerun, "talos update --skip-audit --logs");
        assert_eq!(entry.logs, "error: failed to resolve");
        assert_eq!(entry.details, vec!["exit code: 1"]);
    }
}
