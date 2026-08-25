// Audit check — the installed tree against Bun's advisory database.
//
// The security check asks OSV.dev what it knows about the versions the
// lockfile pins. This one asks the other half of the ecosystem: `bun audit`
// posts the installed tree to the npm advisory endpoint, which is where a
// GitHub advisory lands first and where `bun audit fix` reads its remedy from.
// The two databases disagree often enough — on what is published, on how it is
// scored, on when it arrived — that running only one of them is a choice
// rather than a saving.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::process::Command;

use serde::Deserialize;

use crate::commands::project_check::{CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs};
use crate::commands::security_check::Severity;

/// One advisory, as the npm bulk endpoint returns it through `bun audit
/// --json`: an object keyed by package name, each holding every advisory that
/// matches the installed version.
#[derive(Debug, Deserialize)]
struct Advisory {
    #[serde(default)]
    title: String,
    #[serde(default)]
    severity: String,
    #[serde(default)]
    vulnerable_versions: String,
    #[serde(default)]
    url: String,
}

impl Advisory {
    /// The advisory's severity on the same ladder `security:check` sorts and
    /// filters by, so `--audit-level` means one thing across both checks.
    fn severity(&self) -> Severity {
        Severity::from_label(&self.severity)
    }

    /// The advisory identifier, which is the last segment of its URL —
    /// `GHSA-35jh-r3h4-6jhm` rather than the whole github.com link.
    fn id(&self) -> &str {
        match self.url.rsplit('/').next() {
            Some(id) if !id.is_empty() => id,
            _ => "advisory",
        }
    }

    fn detail(&self, package: &str) -> String {
        let range = if self.vulnerable_versions.is_empty() {
            "every version"
        } else {
            &self.vulnerable_versions
        };
        format!(
            "{}  {package} {range}  {}  {}",
            self.severity().label(),
            self.id(),
            self.title
        )
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    if !root.join("package.json").is_file() {
        return CheckOutcome::new(
            CheckId::Audit,
            CheckStatus::Skipped,
            "no root manifest to audit",
        );
    }

    let output = match command(root).output() {
        Ok(output) => output,
        Err(err) => return unavailable(err.to_string()),
    };

    // The report is the JSON on stdout; a missing lockfile, a registry that
    // will not answer and a Bun too old to know the subcommand all end up as
    // something that does not parse, with the reason on stderr.
    let stdout = String::from_utf8_lossy(&output.stdout);
    let Ok(report) = serde_json::from_str::<BTreeMap<String, Vec<Advisory>>>(stdout.trim()) else {
        return unavailable(reason(&String::from_utf8_lossy(&output.stderr)));
    };

    // `--audit-level` is applied here rather than passed to Bun: the flag only
    // reaches its text renderer, and `--json` reports every severity whatever
    // it is set to.
    let floor = args
        .audit_level
        .as_deref()
        .map(Severity::from_label)
        .unwrap_or(Severity::Unknown);
    let advisories: Vec<(&String, &Advisory)> = report
        .iter()
        .flat_map(|(package, entries)| entries.iter().map(move |advisory| (package, advisory)))
        .filter(|(_, advisory)| advisory.severity() >= floor)
        .collect();

    if advisories.is_empty() {
        return CheckOutcome::new(CheckId::Audit, CheckStatus::Passed, clean(floor));
    }

    findings_outcome(&advisories)
}

/// The `bun audit` invocation. It reads the lockfile, so it runs from the root
/// whether or not anything is installed there.
fn command(root: &Path) -> Command {
    let mut command = Command::new("bun");
    command.arg("audit").arg("--json").current_dir(root);
    command
}

/// What a clean audit says, which depends on how much of it was asked for.
fn clean(floor: Severity) -> String {
    match floor {
        Severity::Unknown => "no advisory published against the installed tree".to_string(),
        floor => format!(
            "no advisory at {} or above against the installed tree",
            floor.label().to_lowercase()
        ),
    }
}

/// Builds the failed/warned outcome for an audit that returned at least one
/// advisory: a severity breakdown in the summary, one detail line per
/// advisory, worst first.
fn findings_outcome(advisories: &[(&String, &Advisory)]) -> CheckOutcome {
    let counts = |severity: Severity| {
        advisories
            .iter()
            .filter(|(_, advisory)| advisory.severity() == severity)
            .count()
    };

    let breakdown: Vec<String> = [
        Severity::Critical,
        Severity::High,
        Severity::Moderate,
        Severity::Low,
        Severity::Unknown,
    ]
    .into_iter()
    .filter_map(|severity| {
        let count = counts(severity);
        (count > 0).then(|| format!("{count} {}", severity.label().to_lowercase()))
    })
    .collect();

    // The same line `security:check` draws: a critical or high advisory fails
    // the run, anything below it warns.
    let status = if counts(Severity::Critical) + counts(Severity::High) > 0 {
        CheckStatus::Failed
    } else {
        CheckStatus::Warned
    };

    // Worst first, so the twelve details the report keeps are the twelve worth
    // reading.
    let mut details: Vec<(Severity, String)> = advisories
        .iter()
        .map(|(package, advisory)| (advisory.severity(), advisory.detail(package)))
        .collect();
    details.sort_by(|left, right| right.0.cmp(&left.0).then_with(|| left.1.cmp(&right.1)));

    let packages = advisories
        .iter()
        .map(|(package, _)| *package)
        .collect::<BTreeSet<_>>()
        .len();

    CheckOutcome::new(
        CheckId::Audit,
        status,
        format!(
            "{} advisor{} across {packages} package{} ({})",
            advisories.len(),
            if advisories.len() == 1 { "y" } else { "ies" },
            if packages == 1 { "" } else { "s" },
            breakdown.join(", ")
        ),
    )
    .with_details(details.into_iter().map(|(_, detail)| detail).collect())
    .with_hint("Upgrade them with `bun audit fix`, or cross majors with `bun audit fix --latest`")
}

/// An audit that could not run is skipped rather than failed: no advisory was
/// read, so there is nothing to report either way.
fn unavailable(detail: String) -> CheckOutcome {
    CheckOutcome::new(
        CheckId::Audit,
        CheckStatus::Skipped,
        "advisory database unavailable",
    )
    .with_details(if detail.is_empty() {
        Vec::new()
    } else {
        vec![detail]
    })
    .with_hint("`bun audit` needs Bun on the PATH and access to the npm registry")
}

/// Why the audit did not produce a report, taken from what Bun printed. The
/// version banner is stripped — it says nothing about the failure.
fn reason(stderr: &str) -> String {
    stderr
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with("bun audit v"))
        .unwrap_or("`bun audit` returned no report")
        .to_string()
}
