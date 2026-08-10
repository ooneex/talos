// `performance:check` — score every function, method and class in the
// workspace on what it will cost when the data grows.
//
// A slow function is not a broken one. It type-checks, it lints, its tests
// pass on the ten rows the fixture holds, and it is only ever wrong in
// production: the `await` inside the loop that turns a batch into a queue of
// round trips, the `.find()` inside a `for` that walks the whole list again
// per item, the effect with no dependency array that re-runs after every
// render. Nothing in the toolchain has an opinion about any of it, because
// none of it is a defect until there is enough data to make it one.
//
// So this command reads the shape of the code rather than running it. Each
// module's `src/` is split into the symbols it declares — see [`symbols`] —
// and every one of them is scored against the rules in [`rules`]: a symbol
// starts at 100 and loses points for the costs it carries, weighted by how
// much each one actually costs. A class is not scored on its own lines; it is
// the mean of its methods, which is what a class costs.
//
// Nothing here runs a benchmark. A rule fires on a shape that is expensive at
// scale, not on a measurement, which is why the report ranks and never
// asserts: `--strict` is what turns a module under the threshold into a
// non-zero exit, and until it is passed the command reports and gets out of
// the way.

mod issues;
mod report;
pub mod rules;
mod runner;
pub mod symbols;

use std::path::{Path, PathBuf};
use std::time::Instant;

use clap::Args;

use issues::create_issues;
pub use report::{group, print_report};
use rules::{Finding, Severity};
use runner::{collect_targets, scan_modules, workspace};
use symbols::SymbolKind;

use crate::utils::{Loader, LoaderGroup, Spinner};

/// The score a module is expected to reach when `--threshold` says nothing
/// else.
const DEFAULT_THRESHOLD: f64 = 90.0;

/// How many hotspot symbols a module names before the rest are counted.
pub(super) const MAX_HOTSPOTS: usize = 8;

/// How many rules a hotspot names before the rest are counted.
pub(super) const MAX_FINDINGS: usize = 4;

/// What a selection matching no readable module is told.
const NO_MODULE: &str = "No module found to score — a module needs a src/ directory";

#[derive(Args, Debug)]
pub struct PerformanceCheckArgs {
    /// Create a YAML issue per module under the threshold instead of printing
    /// the report.
    #[arg(long, default_value_t = false)]
    pub issues: bool,

    /// Only score modules whose directory name matches (comma-separated).
    #[arg(long)]
    pub modules: Option<String>,

    /// Alias for --modules (comma-separated).
    #[arg(long)]
    pub packages: Option<String>,

    /// Minimum score a module must reach, out of 100.
    #[arg(long)]
    pub threshold: Option<f64>,

    /// Minimum severity to report (low, moderate, high, critical).
    #[arg(long = "min-severity")]
    pub min_severity: Option<String>,

    /// Print every hotspot and every rule, each with what to do about it.
    #[arg(long, default_value_t = false)]
    pub logs: bool,

    /// Report every module under the threshold as a failure, and exit with a
    /// non-zero status.
    #[arg(long, default_value_t = false)]
    pub strict: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

/// Whether a module was read at all, and why it was not.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ScanStatus {
    Scored,
    Skipped(String),
}

/// One function, method or class, and what it will cost.
#[derive(Clone, Debug)]
pub struct SymbolPerformance {
    pub kind: SymbolKind,
    /// `UserService.syncAll`, `loadUser` — how the symbol is named in a report.
    pub name: String,
    /// The file it is declared in, relative to the project root.
    pub file: String,
    /// 1-based line the declaration opens on.
    pub line: usize,
    /// How many lines the declaration spans.
    pub span: usize,
    /// Every rule it trips. Always empty for a class.
    pub findings: Vec<Finding>,
    /// Out of 100 — for a class, the mean of its methods.
    pub score: f64,
}

impl SymbolPerformance {
    /// Whether the symbol carries lines of its own, and so a score it earned
    /// rather than inherited from its members.
    pub fn is_leaf(&self) -> bool {
        self.kind != SymbolKind::Class
    }

    /// The worst thing it trips, when it trips anything.
    pub fn worst(&self) -> Option<Severity> {
        self.findings
            .iter()
            .map(|finding| finding.rule.severity)
            .max()
    }
}

/// One module's sources, scored.
#[derive(Clone, Debug)]
pub struct ModulePerformance {
    pub name: String,
    /// `modules/user`, `packages/color` — how the module is named internally.
    pub label: String,
    pub dir: PathBuf,
    pub status: ScanStatus,
    pub symbols: Vec<SymbolPerformance>,
    pub files: usize,
    pub duration_ms: u64,
}

impl ModulePerformance {
    /// The symbols scored on their own lines — every function and method, but
    /// not the classes, whose score is the mean of the methods already here.
    pub fn leaves(&self) -> impl Iterator<Item = &SymbolPerformance> {
        self.symbols.iter().filter(|symbol| symbol.is_leaf())
    }

    /// What the module scores: the mean of its symbols. A module that
    /// declares nothing scores full marks, because there is nothing in it to
    /// be slow.
    pub fn score(&self) -> f64 {
        mean(self.leaves().map(|symbol| symbol.score))
    }

    /// The symbols that miss the threshold, worst first.
    pub fn hotspots(&self, threshold: f64) -> Vec<&SymbolPerformance> {
        let mut hotspots: Vec<&SymbolPerformance> = self
            .leaves()
            .filter(|symbol| symbol.score < threshold)
            .collect();
        hotspots.sort_by(|a, b| {
            a.score
                .total_cmp(&b.score)
                .then_with(|| b.findings.len().cmp(&a.findings.len()))
                .then_with(|| a.name.cmp(&b.name))
        });
        hotspots
    }

    pub fn findings(&self) -> usize {
        self.leaves().map(|symbol| symbol.findings.len()).sum()
    }

    /// How many findings of one severity the module carries.
    pub fn count(&self, severity: Severity) -> usize {
        self.leaves()
            .flat_map(|symbol| symbol.findings.iter())
            .filter(|finding| finding.rule.severity == severity)
            .count()
    }
}

/// Outcome of a run, kept free of process exits and printing so it can be
/// embedded in aggregated reports.
#[derive(Clone, Debug, Default)]
pub struct PerformanceAudit {
    pub modules: Vec<ModulePerformance>,
    pub threshold: f64,
}

impl PerformanceAudit {
    /// The modules that were actually read.
    pub fn scanned(&self) -> Vec<&ModulePerformance> {
        self.modules
            .iter()
            .filter(|module| module.status == ScanStatus::Scored)
            .collect()
    }

    pub fn skipped(&self) -> usize {
        self.modules
            .iter()
            .filter(|module| matches!(module.status, ScanStatus::Skipped(_)))
            .count()
    }

    /// The modules that stayed under the threshold.
    pub fn under(&self) -> Vec<&ModulePerformance> {
        self.scanned()
            .into_iter()
            .filter(|module| module.score() < self.threshold)
            .collect()
    }

    /// How many functions and methods were scored.
    pub fn symbols(&self) -> usize {
        self.scanned()
            .iter()
            .map(|module| module.leaves().count())
            .sum()
    }

    pub fn findings(&self) -> usize {
        self.scanned().iter().map(|module| module.findings()).sum()
    }

    pub fn count(&self, severity: Severity) -> usize {
        self.scanned()
            .iter()
            .map(|module| module.count(severity))
            .sum()
    }

    /// Mean score across the modules that were read.
    pub fn score(&self) -> f64 {
        mean(self.scanned().iter().map(|module| module.score()))
    }

    /// Whether the run should end in a non-zero status.
    ///
    /// A rule fires on a shape, not on a measurement, so a finding is a thing
    /// worth looking at rather than a thing that is definitely wrong — which
    /// is why nothing here fails a run on its own. `--strict` is the caller
    /// saying they want the threshold enforced anyway.
    pub fn is_failure(&self, strict: bool) -> bool {
        strict && !self.under().is_empty()
    }
}

/// The mean of a sequence, or 100 when it is empty — nothing scored is
/// nothing wrong.
fn mean(values: impl Iterator<Item = f64>) -> f64 {
    let values: Vec<f64> = values.collect();
    if values.is_empty() {
        return 100.0;
    }
    values.iter().sum::<f64>() / values.len() as f64
}

/// Score every selected module and return the audit instead of printing it.
///
/// This is the whole of the command bar the report it prints, so an embedded
/// run can never score differently from the command: same modules, same
/// symbols, same rules. `quiet` is for a caller that owns stdout and only
/// silences the spinner and the loader.
pub fn audit(
    root: &Path,
    modules: Option<&str>,
    packages: Option<&str>,
    threshold: Option<f64>,
    min_severity: Option<&str>,
    quiet: bool,
) -> Result<PerformanceAudit, String> {
    let floor = match min_severity {
        Some(label) => Some(Severity::from_label(label).ok_or_else(|| {
            format!("Unknown severity \"{label}\" — use low, moderate, high or critical")
        })?),
        None => None,
    };

    // Discovery walks the whole workspace before a single line is read, and
    // it is the one stretch before the loader where nothing is printed, so it
    // gets a spinner of its own — same as lint's workspace fingerprint.
    let spinner = (!quiet).then(|| Spinner::start("Discovering the workspace..."));
    let members = workspace(root, modules, packages);
    let targets = collect_targets(&members);
    drop(spinner);

    if targets.is_empty() {
        return Err(NO_MODULE.to_string());
    }

    let readable = targets
        .iter()
        .filter(|target| target.skip.is_none())
        .count();
    let loader = if readable > 0 && !quiet {
        Loader::start(vec![LoaderGroup::new("Symbols", readable)])
    } else {
        Loader::hidden()
    };
    let scored = scan_modules(root, targets, floor, &loader);
    loader.stop();

    Ok(PerformanceAudit {
        modules: scored,
        threshold: threshold.unwrap_or(DEFAULT_THRESHOLD),
    })
}

pub fn run(args: &PerformanceCheckArgs) {
    if !execute(args) {
        std::process::exit(1);
    }
}

/// Score every selected module and print the report, returning whether the
/// run succeeded — so a caller that owns the process exit decides the status
/// once rather than the command exiting from under it.
pub fn execute(args: &PerformanceCheckArgs) -> bool {
    let root = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(crate::utils::current_dir);
    let started = Instant::now();

    let audit = match audit(
        &root,
        args.modules.as_deref(),
        args.packages.as_deref(),
        args.threshold,
        args.min_severity.as_deref(),
        false,
    ) {
        Ok(audit) => audit,
        Err(message) => {
            crate::utils::error(message);
            return false;
        }
    };

    if args.issues {
        create_issues(&audit);
        return true;
    }

    print_report(
        &audit,
        args.logs,
        args.strict,
        started.elapsed().as_millis() as u64,
        false,
    );
    !audit.is_failure(args.strict)
}

#[cfg(test)]
mod tests {
    use super::rules::RULES;
    use super::*;

    fn symbol(
        kind: SymbolKind,
        name: &str,
        score: f64,
        findings: Vec<Finding>,
    ) -> SymbolPerformance {
        SymbolPerformance {
            kind,
            name: name.to_string(),
            file: "modules/user/src/user.service.ts".to_string(),
            line: 12,
            span: 30,
            findings,
            score,
        }
    }

    fn module(name: &str, symbols: Vec<SymbolPerformance>) -> ModulePerformance {
        ModulePerformance {
            name: name.to_string(),
            label: format!("modules/{name}"),
            dir: PathBuf::from("modules").join(name),
            status: ScanStatus::Scored,
            symbols,
            files: 1,
            duration_ms: 5,
        }
    }

    fn finding(id: &str, line: usize) -> Finding {
        Finding {
            rule: *RULES.iter().find(|rule| rule.id == id).expect("declared"),
            line,
        }
    }

    #[test]
    fn a_module_scores_the_mean_of_its_functions_and_methods_only() {
        let module = module(
            "user",
            vec![
                symbol(SymbolKind::Class, "UserService", 50.0, Vec::new()),
                symbol(SymbolKind::Method, "UserService.syncAll", 40.0, Vec::new()),
                symbol(SymbolKind::Method, "UserService.toDto", 60.0, Vec::new()),
            ],
        );

        // The class would drag the mean toward itself if it were counted, and
        // it is already the mean of the two methods below it.
        assert_eq!(module.score(), 50.0);
        assert_eq!(module.leaves().count(), 2);
    }

    #[test]
    fn a_module_that_declares_nothing_scores_full_marks() {
        assert_eq!(module("empty", Vec::new()).score(), 100.0);
    }

    #[test]
    fn hotspots_are_the_symbols_under_the_threshold_worst_first() {
        let module = module(
            "user",
            vec![
                symbol(SymbolKind::Method, "b", 80.0, Vec::new()),
                symbol(SymbolKind::Method, "a", 20.0, Vec::new()),
                symbol(SymbolKind::Method, "c", 95.0, Vec::new()),
            ],
        );

        let names: Vec<&str> = module
            .hotspots(90.0)
            .iter()
            .map(|symbol| symbol.name.as_str())
            .collect();

        assert_eq!(names, vec!["a", "b"]);
    }

    #[test]
    fn an_audit_counts_findings_by_severity_across_its_modules() {
        let audit = PerformanceAudit {
            modules: vec![
                module(
                    "user",
                    vec![symbol(
                        SymbolKind::Method,
                        "syncAll",
                        38.0,
                        vec![
                            finding("perf.query-in-loop", 4),
                            finding("perf.await-in-loop", 4),
                        ],
                    )],
                ),
                module(
                    "billing",
                    vec![symbol(
                        SymbolKind::Function,
                        "charge",
                        96.0,
                        vec![finding("perf.long-body", 1)],
                    )],
                ),
            ],
            threshold: 90.0,
        };

        assert_eq!(audit.count(Severity::Critical), 1);
        assert_eq!(audit.count(Severity::High), 1);
        assert_eq!(audit.count(Severity::Low), 1);
        assert_eq!(audit.findings(), 3);
        assert_eq!(audit.symbols(), 2);
        assert_eq!(audit.score(), 67.0);
    }

    #[test]
    fn only_strict_turns_a_module_under_the_threshold_into_a_failure() {
        let audit = PerformanceAudit {
            modules: vec![module(
                "user",
                vec![symbol(SymbolKind::Method, "syncAll", 38.0, Vec::new())],
            )],
            threshold: 90.0,
        };

        assert_eq!(audit.under().len(), 1);
        assert!(!audit.is_failure(false));
        assert!(audit.is_failure(true));
    }

    #[test]
    fn a_skipped_module_is_neither_scored_nor_counted_against_the_run() {
        let audit = PerformanceAudit {
            modules: vec![ModulePerformance {
                status: ScanStatus::Skipped("rust module".to_string()),
                ..module("cli", Vec::new())
            }],
            threshold: 90.0,
        };

        assert!(audit.scanned().is_empty());
        assert_eq!(audit.skipped(), 1);
        assert!(!audit.is_failure(true));
    }

    #[test]
    fn the_worst_severity_of_a_symbol_is_the_one_it_is_ranked_by() {
        let mixed = symbol(
            SymbolKind::Method,
            "syncAll",
            38.0,
            vec![
                finding("perf.long-body", 1),
                finding("perf.query-in-loop", 4),
            ],
        );

        assert_eq!(mixed.worst(), Some(Severity::Critical));
        assert_eq!(
            symbol(SymbolKind::Method, "clean", 100.0, Vec::new()).worst(),
            None
        );
    }

    #[test]
    fn an_unknown_severity_is_reported_rather_than_ignored() {
        let root = std::env::temp_dir();
        let error = audit(&root, None, None, None, Some("severe"), true)
            .expect_err("the severity is rejected");

        assert!(error.contains("severe"));
    }
}
