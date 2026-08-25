// Dedupe check — duplicate versions the lockfile is still carrying.
//
// One dependency resolved to two versions is two copies installed, two copies
// bundled, and two copies of whatever the module keeps at its top level: a
// singleton registry, a React instance, a class every `instanceof` is written
// against. Most of them are removable without touching a declared range —
// another version already in the lockfile satisfies every dependent — which is
// exactly what `bun dedupe --check` answers, reading `bun.lock` and writing
// nothing.

use std::path::Path;
use std::process::Command;

use crate::commands::project_check::{CheckId, CheckOutcome, CheckStatus};

/// The lockfile the check reads. Only Bun's own is deduplicated here; a
/// project installing with something else is reported by `lockfile`.
const LOCKFILE: &str = "bun.lock";

/// One dependency the lockfile resolves twice, and the version the second
/// resolution collapses onto.
struct Duplicate {
    name: String,
    from: String,
    to: String,
}

impl Duplicate {
    /// Reads one `~ name 1.2.3 -> 1.2.4` line, which is how `bun dedupe`
    /// reports a removable duplicate. Anything else — the banner, the summary,
    /// the hint — is not one.
    fn parse(line: &str) -> Option<Self> {
        let fields: Vec<&str> = line.trim().strip_prefix('~')?.split_whitespace().collect();
        match fields.as_slice() {
            [name, from, "->", to] => Some(Self {
                name: (*name).to_string(),
                from: (*from).to_string(),
                to: (*to).to_string(),
            }),
            _ => None,
        }
    }

    fn detail(&self) -> String {
        format!(
            "{}  {} · already resolved at {}",
            self.name, self.from, self.to
        )
    }
}

pub fn run(root: &Path) -> CheckOutcome {
    if !root.join(LOCKFILE).is_file() {
        return CheckOutcome::new(
            CheckId::Dedupe,
            CheckStatus::Skipped,
            format!("no {LOCKFILE} to deduplicate"),
        );
    }

    let output = match Command::new("bun")
        .arg("dedupe")
        .arg("--check")
        .current_dir(root)
        .output()
    {
        Ok(output) => output,
        Err(err) => return unavailable(err.to_string()),
    };

    // Bun splits the run across both streams depending on which one it is
    // talking to, so the report is read from the pair rather than from
    // whichever one happened to carry it.
    let report = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let duplicates: Vec<Duplicate> = report.lines().filter_map(Duplicate::parse).collect();

    // `--check` exits non-zero precisely because it found duplicates. A
    // non-zero exit with none of them listed is the command failing — an
    // unreadable lockfile, a Bun too old to know the flag — and that is not an
    // answer to report as a clean one.
    if duplicates.is_empty() && !output.status.success() {
        return unavailable(reason(&report));
    }

    let scope = scope(&report);
    if duplicates.is_empty() {
        return CheckOutcome::new(
            CheckId::Dedupe,
            CheckStatus::Passed,
            format!("{scope} · every one resolves to a single version"),
        );
    }

    CheckOutcome::new(
        CheckId::Dedupe,
        CheckStatus::Warned,
        format!(
            "{scope} · {} duplicate version{} can be removed",
            duplicates.len(),
            if duplicates.len() == 1 { "" } else { "s" }
        ),
    )
    .with_details(duplicates.iter().map(Duplicate::detail).collect())
    .with_hint("Collapse them with `bun dedupe`, which rewrites the lockfile and reinstalls")
}

/// How much of the lockfile was examined, taken from the `checked N packages`
/// Bun prints in both the clean and the duplicated report.
fn scope(report: &str) -> String {
    let packages = report
        .split("checked ")
        .nth(1)
        .and_then(|rest| rest.split_whitespace().next())
        .and_then(|count| count.parse::<usize>().ok());

    match packages {
        Some(packages) => format!(
            "{packages} package{} in {LOCKFILE}",
            if packages == 1 { "" } else { "s" }
        ),
        None => LOCKFILE.to_string(),
    }
}

/// A dedupe that could not run is skipped rather than failed: the lockfile was
/// never read, so nothing is known about it either way.
fn unavailable(detail: String) -> CheckOutcome {
    CheckOutcome::new(
        CheckId::Dedupe,
        CheckStatus::Skipped,
        "duplicate check unavailable",
    )
    .with_details(if detail.is_empty() {
        Vec::new()
    } else {
        vec![detail]
    })
    .with_hint("`bun dedupe --check` needs Bun on the PATH")
}

/// Why the dedupe did not produce a report, taken from what Bun printed. The
/// version banner is stripped — it says nothing about the failure.
fn reason(report: &str) -> String {
    report
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with("bun dedupe v"))
        .unwrap_or("`bun dedupe --check` returned no report")
        .to_string()
}
