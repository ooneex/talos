//! Writing the coverage audit to `var/outputs/talos_coverage.{md,json}` — the
//! same report the terminal draws, in the shape an agent is handed to fix what
//! it lists.
//!
//! A coverage report is two different pieces of work, so it is two sections: a
//! suite that failed has to be made to pass before its numbers mean anything,
//! and a module that merely stayed under the threshold needs tests written.
//! Each under-covered module names the files that pull it down and the lines
//! they leave uncovered, so the agent knows what to test without measuring
//! again. See [`crate::utils::AgentReport`] for the shape every command's
//! report shares.

use crate::utils::{
    AgentReport, ReportEntry, ReportSection, ReportStatus, SummaryRow, report_logs,
};

use super::report::trim_percent;
use super::{CoverageArgs, CoverageAudit, MAX_LOW_FILES, ModuleCoverage, RunStatus};

/// How the file is named, before `--output` picks its extension.
pub const FILE_STEM: &str = "talos_coverage";

/// Rebuild the command that produced this report, so the file can tell the
/// agent how to check its own work.
///
/// `--output` is deliberately dropped: the agent re-runs the measurement to
/// see whether it is green, not to overwrite the file it is reading.
pub fn command_line(args: &CoverageArgs) -> String {
    let mut parts = vec!["talos coverage".to_string()];
    if let Some(packages) = &args.packages {
        parts.push(format!("--packages={packages}"));
    }
    if let Some(modules) = &args.modules {
        parts.push(format!("--modules={modules}"));
    }
    if let Some(threshold) = args.threshold {
        parts.push(format!("--threshold={}", trim_percent(threshold)));
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

/// Gather what the measurement found into the report an agent works from.
pub fn report(args: &CoverageArgs, audit: &CoverageAudit, elapsed_ms: u64) -> AgentReport {
    let broken = audit.broken();
    let under = audit.under();
    let threshold = audit.threshold;

    // `--strict` is what decides whether an under-covered module is a
    // failure, so it is what decides the verdict this file carries — the same
    // one the process exits with.
    let passed = !audit.is_failure(args.strict);

    AgentReport {
        tool: "talos coverage".to_string(),
        stem: FILE_STEM.to_string(),
        command: command_line(args),
        elapsed_ms,
        passed,
        summary: vec![
            SummaryRow {
                label: "Suites".to_string(),
                key: "suites".to_string(),
                status: if broken.is_empty() {
                    ReportStatus::Pass
                } else {
                    ReportStatus::Fail
                },
                found: format!(
                    "{} module{} ran · {} test{} · {} failing",
                    audit.ran().len(),
                    if audit.ran().len() == 1 { "" } else { "s" },
                    audit.tests(),
                    if audit.tests() == 1 { "" } else { "s" },
                    broken.len()
                ),
            },
            SummaryRow {
                label: "Coverage".to_string(),
                key: "coverage".to_string(),
                status: if under.is_empty() {
                    ReportStatus::Pass
                } else if args.strict {
                    ReportStatus::Fail
                } else {
                    ReportStatus::Errored
                },
                found: format!(
                    "{}% lines · {}% functions · {} module{} under the {}% threshold",
                    trim_percent(audit.lines()),
                    trim_percent(audit.functions()),
                    under.len(),
                    if under.len() == 1 { "" } else { "s" },
                    trim_percent(threshold)
                ),
            },
        ],
        sections: vec![
            ReportSection {
                title: "Failing suites".to_string(),
                key: "failingSuites".to_string(),
                blurb: "each module below has a failing or unrunnable test suite — its \
                        coverage means nothing until the suite is green again"
                    .to_string(),
                entries: broken.iter().map(|module| failure(module)).collect(),
            },
            ReportSection {
                title: "Under-covered modules".to_string(),
                key: "underCovered".to_string(),
                blurb: format!(
                    "each module below passes its suite but stays under the {}% threshold — \
                     the files named are the ones pulling it down",
                    trim_percent(threshold)
                ),
                entries: under
                    .iter()
                    .map(|module| under_covered(module, threshold))
                    .collect(),
            },
        ],
    }
}

fn failure(module: &ModuleCoverage) -> ReportEntry {
    let reason = match &module.status {
        RunStatus::Errored(reason) => format!("the test suite could not run: {reason}"),
        _ => format!(
            "{} of {} test{} failed — the output below says why",
            module.failed,
            module.passed + module.failed,
            if module.passed + module.failed == 1 {
                ""
            } else {
                "s"
            }
        ),
    };

    ReportEntry {
        name: module.name.clone(),
        path: module.label.clone(),
        reason,
        rerun: format!("talos coverage --modules={} --logs", module.name),
        details: Vec::new(),
        logs: report_logs(&module.output),
    }
}

fn under_covered(module: &ModuleCoverage, threshold: f64) -> ReportEntry {
    let low = module.low_files(threshold);
    let mut details = vec![format!(
        "Covers {}% of lines and {}% of functions, against a {}% threshold",
        trim_percent(module.lines),
        trim_percent(module.functions),
        trim_percent(threshold)
    )];

    // The console report names the worst handful and counts the rest; so does
    // this, for the same reason — a hundred file names is not a work list.
    for file in low.iter().take(MAX_LOW_FILES) {
        let uncovered = if file.uncovered.is_empty() {
            String::new()
        } else {
            format!(" — uncovered lines {}", file.uncovered.join(", "))
        };
        details.push(format!(
            "`{}`: {}% lines, {}% functions{uncovered}",
            file.path,
            trim_percent(file.lines),
            trim_percent(file.functions)
        ));
    }
    if low.len() > MAX_LOW_FILES {
        details.push(format!(
            "…and {} more file{} under the threshold",
            low.len() - MAX_LOW_FILES,
            if low.len() - MAX_LOW_FILES == 1 {
                ""
            } else {
                "s"
            }
        ));
    }

    ReportEntry {
        name: module.name.clone(),
        path: module.label.clone(),
        reason: "the suite passes but leaves too much untested — write tests for the files \
                 below, do not lower the threshold"
            .to_string(),
        rerun: format!("talos coverage --modules={}", module.name),
        details,
        // A passing suite's output is noise: what needs fixing is named above.
        logs: String::new(),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::commands::coverage::FileCoverage;

    fn args() -> CoverageArgs {
        CoverageArgs {
            issues: false,
            modules: None,
            packages: None,
            threshold: None,
            logs: false,
            concurrency: None,
            no_cache: false,
            strict: false,
            output: None,
            cwd: None,
        }
    }

    fn module(name: &str, status: RunStatus, lines: f64) -> ModuleCoverage {
        ModuleCoverage {
            name: name.to_string(),
            label: format!("modules/{name}"),
            dir: PathBuf::from("."),
            status,
            passed: 3,
            failed: 1,
            lines,
            functions: lines,
            files: Vec::new(),
            duration_ms: 10,
            output: "boom".to_string(),
            cached: false,
        }
    }

    #[test]
    fn a_failing_suite_carries_its_output_and_a_rerun() {
        let entry = failure(&module("user", RunStatus::Failed, 80.0));

        assert_eq!(entry.path, "modules/user");
        assert!(entry.reason.contains("1 of 4 tests failed"));
        assert_eq!(entry.rerun, "talos coverage --modules=user --logs");
        assert_eq!(entry.logs, "boom");
    }

    #[test]
    fn an_unrunnable_suite_says_why_it_could_not_run() {
        let status = RunStatus::Errored("could not run bun".to_string());
        assert!(
            failure(&module("user", status, 0.0))
                .reason
                .contains("could not run bun")
        );
    }

    #[test]
    fn an_under_covered_module_names_its_worst_files_and_counts_the_rest() {
        let mut low = module("user", RunStatus::Passed, 62.0);
        low.files = (0..MAX_LOW_FILES + 2)
            .map(|index| FileCoverage {
                path: format!("src/file-{index}.ts"),
                lines: 10.0 + index as f64,
                functions: 20.0,
                uncovered: vec!["4-9".to_string()],
            })
            .collect();

        let entry = under_covered(&low, 90.0);

        assert!(entry.details[0].contains("62% of lines"));
        assert!(entry.details[1].contains("src/file-0.ts"));
        assert!(entry.details[1].contains("uncovered lines 4-9"));
        assert_eq!(entry.details.len(), MAX_LOW_FILES + 2);
        assert!(
            entry
                .details
                .last()
                .expect("a tail")
                .contains("2 more files")
        );
        // Nothing failed, so there is no log worth carrying.
        assert!(entry.logs.is_empty());
    }

    #[test]
    fn the_verdict_follows_strict_when_only_the_threshold_was_missed() {
        let audit = CoverageAudit {
            modules: vec![module("user", RunStatus::Passed, 62.0)],
            threshold: 90.0,
        };

        assert!(report(&args(), &audit, 20).passed);

        let strict = CoverageArgs {
            strict: true,
            ..args()
        };
        let report = report(&strict, &audit, 20);
        assert!(!report.passed);
        assert_eq!(report.sections[1].entries.len(), 1);
        assert!(report.summary[1].found.contains("1 module under"));
    }

    #[test]
    fn the_command_line_carries_the_flags_that_change_the_verdict() {
        let args = CoverageArgs {
            modules: Some("user".to_string()),
            threshold: Some(85.0),
            strict: true,
            ..args()
        };

        assert_eq!(
            command_line(&args),
            "talos coverage --modules=user --threshold=85 --strict"
        );
    }
}
