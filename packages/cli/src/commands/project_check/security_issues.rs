//! Security and issue conventions checks: dependency vulnerability audit
//! (delegating to `security:check`) and issue YAML conventions (delegating
//! to `issue:check`).

use std::path::Path;

use crate::commands::issue_check::{self, CheckOptions};
use crate::commands::security_check;

use super::types::CheckId;
use super::{CheckOutcome, CheckStatus, ProjectCheckArgs, split_csv};

// ---------------------------------------------------------------------------
// Security — dependency audit
// ---------------------------------------------------------------------------

pub(super) fn check_security(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let audit = match security_check::audit(
        root,
        args.modules.as_deref(),
        args.packages.as_deref(),
        args.audit_level.as_deref(),
    ) {
        Ok(audit) => audit,
        Err(message) if message.is_empty() => {
            return CheckOutcome::new(
                CheckId::Security,
                CheckStatus::Skipped,
                "no lockfile found to audit",
            );
        }
        Err(message) => {
            return CheckOutcome::new(
                CheckId::Security,
                CheckStatus::Skipped,
                "dependency audit unavailable",
            )
            .with_details(vec![message])
            .with_hint("The audit needs network access to https://osv.dev");
        }
    };

    let scope = security_audit_scope(&audit);

    if audit.findings.is_empty() {
        return CheckOutcome::new(
            CheckId::Security,
            CheckStatus::Passed,
            format!("{scope} · no known vulnerability"),
        );
    }

    security_findings_outcome(&audit, &scope)
}

/// Summarizes how many dependencies (and, if any, assistant files) the
/// security audit scanned.
fn security_audit_scope(audit: &security_check::SecurityAudit) -> String {
    let mut scope = format!(
        "{} dependenc{} scanned",
        audit.dependencies,
        if audit.dependencies == 1 { "y" } else { "ies" }
    );
    if audit.llm_files > 0 {
        scope.push_str(&format!(
            " · {} assistant file{} scanned",
            audit.llm_files,
            if audit.llm_files == 1 { "" } else { "s" }
        ));
    }
    scope
}

/// Builds the failed/warned outcome for a security audit that found at least
/// one vulnerability: a severity breakdown in the summary and one detail line
/// per finding.
fn security_findings_outcome(audit: &security_check::SecurityAudit, scope: &str) -> CheckOutcome {
    let breakdown: Vec<String> = ["CRITICAL", "HIGH", "MODERATE", "LOW", "UNKNOWN"]
        .into_iter()
        .filter_map(|severity| {
            let count = audit.count(severity);
            (count > 0).then(|| format!("{count} {}", severity.to_lowercase()))
        })
        .collect();

    let blocking = audit.count("CRITICAL") + audit.count("HIGH");
    let status = if blocking > 0 {
        CheckStatus::Failed
    } else {
        CheckStatus::Warned
    };

    let details = audit
        .findings
        .iter()
        .map(|finding| {
            let subject = if finding.version.is_empty() {
                finding.subject.clone()
            } else {
                format!("{}@{}", finding.subject, finding.version)
            };
            let remediation = if finding.remediation.is_empty() {
                "no patch published".to_string()
            } else if finding.version.is_empty() {
                finding.remediation.clone()
            } else {
                format!("patched {}", finding.remediation)
            };
            format!(
                "{}  {} · {}  {}  {}",
                finding.severity, finding.module, subject, finding.id, remediation
            )
        })
        .collect();

    CheckOutcome::new(
        CheckId::Security,
        status,
        format!(
            "{scope} · {} vulnerabilit{} ({})",
            audit.findings.len(),
            if audit.findings.len() == 1 {
                "y"
            } else {
                "ies"
            },
            breakdown.join(", ")
        ),
    )
    .with_details(details)
    .with_hint("Inspect with `talos security:check` or file them with `--issues`")
}

// ---------------------------------------------------------------------------
// Issues — issue YAML conventions
// ---------------------------------------------------------------------------

pub(super) fn check_issues(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<String> = split_csv(args.modules.as_deref())
        .into_iter()
        .chain(split_csv(args.packages.as_deref()))
        .collect();

    let report = issue_check::execute(
        root,
        &CheckOptions {
            modules,
            ids: Vec::new(),
        },
    );

    if report.files == 0 && report.diagnostics.is_empty() {
        return CheckOutcome::new(CheckId::Issues, CheckStatus::Skipped, "no issue file found");
    }

    let errors = report.errors();
    let warnings = report.warnings();
    let status = if errors > 0 {
        CheckStatus::Failed
    } else if warnings > 0 {
        CheckStatus::Warned
    } else {
        CheckStatus::Passed
    };

    let scope = format!(
        "{} issue{} · {} module{}",
        report.files,
        if report.files == 1 { "" } else { "s" },
        report.modules,
        if report.modules == 1 { "" } else { "s" }
    );
    let summary = if errors == 0 && warnings == 0 {
        format!("{scope} · no problem")
    } else {
        format!(
            "{scope} · {errors} error{} · {warnings} warning{}",
            if errors == 1 { "" } else { "s" },
            if warnings == 1 { "" } else { "s" }
        )
    };

    let mut diagnostics = report.diagnostics.clone();
    diagnostics.sort_by_key(|diagnostic| std::cmp::Reverse(diagnostic.severity));
    let details = diagnostics
        .iter()
        .map(|diagnostic| {
            let line = diagnostic
                .line
                .map(|line| format!(":{line}"))
                .unwrap_or_default();
            format!(
                "{}  {}{}  {}  {}",
                diagnostic.severity.label(),
                diagnostic.file,
                line,
                diagnostic.rule,
                diagnostic.message
            )
        })
        .collect();

    let mut outcome = CheckOutcome::new(CheckId::Issues, status, summary).with_details(details);
    if status != CheckStatus::Passed {
        outcome = outcome.with_hint("Inspect with `talos issue:check` or fix with `issue-improve`");
    }
    outcome
}
