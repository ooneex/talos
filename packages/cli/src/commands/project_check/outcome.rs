//! The result model every check reports through: `CheckStatus`, a single
//! check's `CheckOutcome`, the aggregate `ProjectReport`, and the small
//! helpers (`harden`, `select_checks`, `parse_ids`, `cap_details`,
//! `split_csv`, `static_outcome`) shared by the checks and the orchestrator.

use std::collections::BTreeSet;

use console::style;

use super::MAX_DETAILS;
use super::types::{Category, CheckId};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum CheckStatus {
    Passed,
    Skipped,
    Warned,
    Failed,
}

impl CheckStatus {
    pub fn label(self) -> &'static str {
        match self {
            CheckStatus::Passed => "passed",
            CheckStatus::Skipped => "skipped",
            CheckStatus::Warned => "warning",
            CheckStatus::Failed => "failed",
        }
    }

    /// Read a status back out of a cache entry.
    pub fn from_label(label: &str) -> Option<Self> {
        match label {
            "passed" => Some(CheckStatus::Passed),
            "skipped" => Some(CheckStatus::Skipped),
            "warning" => Some(CheckStatus::Warned),
            "failed" => Some(CheckStatus::Failed),
            _ => None,
        }
    }

    pub(super) fn icon(self) -> String {
        match self {
            CheckStatus::Passed => style("✔").green().bold().to_string(),
            CheckStatus::Skipped => style("–").dim().to_string(),
            CheckStatus::Warned => style("⚠").yellow().bold().to_string(),
            CheckStatus::Failed => style("✖").red().bold().to_string(),
        }
    }

    pub(super) fn paint(self, text: &str) -> String {
        match self {
            CheckStatus::Passed => style(text).green().to_string(),
            CheckStatus::Skipped => style(text).dim().to_string(),
            CheckStatus::Warned => style(text).yellow().to_string(),
            CheckStatus::Failed => style(text).red().to_string(),
        }
    }
}

/// The result of a single check — never exits the process so it stays testable.
#[derive(Clone, Debug)]
pub struct CheckOutcome {
    pub id: CheckId,
    pub status: CheckStatus,
    pub summary: String,
    pub details: Vec<String>,
    pub hints: Vec<String>,
    pub duration_ms: u64,
    /// Whether the outcome was replayed from `var/cache/project` rather than
    /// computed. It is the duration column that says so in the report.
    pub cached: bool,
}

impl CheckOutcome {
    pub fn new(id: CheckId, status: CheckStatus, summary: impl Into<String>) -> Self {
        Self {
            id,
            status,
            summary: summary.into(),
            details: Vec::new(),
            hints: Vec::new(),
            duration_ms: 0,
            cached: false,
        }
    }

    pub fn with_details(mut self, details: Vec<String>) -> Self {
        self.details = cap_details(details);
        self
    }

    pub fn with_hint(mut self, hint: impl Into<String>) -> Self {
        self.hints.push(hint.into());
        self
    }
}

#[derive(Clone, Debug, Default)]
pub struct ProjectReport {
    pub root: String,
    pub outcomes: Vec<CheckOutcome>,
    pub duration_ms: u64,
}

impl ProjectReport {
    pub fn count(&self, status: CheckStatus) -> usize {
        self.outcomes
            .iter()
            .filter(|outcome| outcome.status == status)
            .count()
    }

    pub fn failed(&self) -> bool {
        self.count(CheckStatus::Failed) > 0
    }

    pub fn warned(&self) -> bool {
        self.count(CheckStatus::Warned) > 0
    }

    /// Whether the run should fail the process, honouring `--strict`.
    ///
    /// `execute` has already turned every warning into a failure under
    /// `--strict`, so the second arm only matters to a report built by hand.
    pub fn is_failure(&self, strict: bool) -> bool {
        self.failed() || (strict && self.warned())
    }
}

/// Under `--strict` a warning is a failure — not just at the exit code, but
/// everywhere the run is read: the icon in the terminal, the counts in the
/// summary, the status in the JSON, and the word in front of the line that
/// earned it. A check that reports `warn` under a red cross is the run
/// contradicting itself, so the details are relabelled with the status.
pub fn harden(outcome: CheckOutcome) -> CheckOutcome {
    let details = outcome
        .details
        .into_iter()
        .map(|detail| match detail.strip_prefix(WARN_DETAIL) {
            Some(message) => format!("{ERROR_DETAIL}{message}"),
            None => detail,
        })
        .collect();

    CheckOutcome {
        status: match outcome.status {
            CheckStatus::Warned => CheckStatus::Failed,
            status => status,
        },
        details,
        ..outcome
    }
}

/// Resolve which checks to run from `--only` / `--skip`, plus any opt-in check
/// that was requested through its own flag.
pub fn select_checks(
    only: Option<&str>,
    skip: Option<&str>,
    extra: &[CheckId],
) -> Result<Vec<CheckId>, String> {
    let mut selected: Vec<CheckId> = match parse_ids(only)? {
        Some(ids) if !ids.is_empty() => CheckId::ALL
            .into_iter()
            .filter(|id| ids.contains(id))
            .collect(),
        _ => CheckId::ALL
            .into_iter()
            .filter(|id| CheckId::DEFAULT.contains(id) || extra.contains(id))
            .collect(),
    };

    if let Some(skipped) = parse_ids(skip)? {
        selected.retain(|id| !skipped.contains(id));
    }

    if selected.is_empty() {
        return Err("No check left to run — relax --only/--skip".to_string());
    }
    Ok(selected)
}

pub fn parse_ids(value: Option<&str>) -> Result<Option<BTreeSet<CheckId>>, String> {
    let Some(value) = value else {
        return Ok(None);
    };

    let mut ids = BTreeSet::new();
    for name in value.split(',').map(str::trim).filter(|s| !s.is_empty()) {
        // A category stands for every check it holds, so `--only=frontend` is
        // the eight front-end checks without naming any of them.
        if let Some(category) = Category::from_key(name) {
            ids.extend(category.checks());
            continue;
        }
        let Some(id) = CheckId::from_key(name) else {
            return Err(format!(
                "Unknown check \"{name}\" — expected a category ({}) or one of: {}",
                Category::ALL
                    .iter()
                    .map(|category| category.key())
                    .collect::<Vec<_>>()
                    .join(", "),
                CheckId::ALL
                    .iter()
                    .map(|id| id.key())
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        };
        ids.insert(id);
    }
    Ok(Some(ids))
}

pub fn cap_details(details: Vec<String>) -> Vec<String> {
    if details.len() <= MAX_DETAILS {
        return details;
    }
    let hidden = details.len() - MAX_DETAILS;
    let mut capped: Vec<String> = details.into_iter().take(MAX_DETAILS).collect();
    capped.push(format!("… and {hidden} more"));
    capped
}

pub fn split_csv(value: Option<&str>) -> Vec<String> {
    value
        .map(|value| {
            value
                .split(',')
                .map(str::trim)
                .filter(|part| !part.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// How a detail line says which of the two it is. Both are the same width, so
/// the messages line up under each other.
pub const ERROR_DETAIL: &str = "error  ";
pub const WARN_DETAIL: &str = "warn   ";

/// Build the outcome of a check that only reads the repository.
///
/// Errors fail the check, warnings only warn, and the details keep the errors
/// first so the most important line is never the one that gets capped.
pub fn static_outcome(
    id: CheckId,
    scope: &str,
    clean: &str,
    errors: Vec<String>,
    warnings: Vec<String>,
) -> CheckOutcome {
    if errors.is_empty() && warnings.is_empty() {
        return CheckOutcome::new(id, CheckStatus::Passed, format!("{scope} · {clean}"));
    }

    let status = if errors.is_empty() {
        CheckStatus::Warned
    } else {
        CheckStatus::Failed
    };
    let summary = match (errors.len(), warnings.len()) {
        (0, warned) => format!(
            "{scope} · {warned} warning{}",
            if warned == 1 { "" } else { "s" }
        ),
        (failed, 0) => format!(
            "{scope} · {failed} error{}",
            if failed == 1 { "" } else { "s" }
        ),
        (failed, warned) => format!(
            "{scope} · {failed} error{} · {warned} warning{}",
            if failed == 1 { "" } else { "s" },
            if warned == 1 { "" } else { "s" }
        ),
    };

    let details = errors
        .into_iter()
        .map(|message| format!("{ERROR_DETAIL}{message}"))
        .chain(
            warnings
                .into_iter()
                .map(|message| format!("{WARN_DETAIL}{message}")),
        )
        .collect();

    CheckOutcome::new(id, status, summary).with_details(details)
}
