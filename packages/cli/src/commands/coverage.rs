// `coverage` — run every module's test suite with coverage collection on,
// then report what each module covers and which files pull it down.
//
// Bun already enforces `[test] coverageThreshold` from a module's `bunfig.toml`,
// but only for the module it is run in: a workspace is audited one suite at a
// time and the numbers never sit side by side. This command runs each suite,
// reads the coverage table bun prints (falling back to the `lcov.info` a module
// configures), and renders one report — modules ranked worst first, the files
// under the threshold named with their uncovered lines, and the failing suites
// called out separately from the merely under-covered ones.
//
// Running suites is expensive, so a report a module's sources have not moved
// since is replayed from [`cache`] rather than measured again, and `--no-cache`
// turns that off. A failing suite always ends the run in a non-zero status;
// `--strict` extends that to the modules that merely stayed under the
// threshold, which is what makes the command usable as a gate.

#[path = "coverage/cache.rs"]
pub mod cache;
mod issues;
mod parsing;
mod report;
mod runner;

use issues::create_issues;
pub use issues::{build_issue_description, build_issue_title, label, priority};
pub use parsing::{collapse_ranges, mean, parse_counts, parse_lcov, parse_table, percent};
pub use report::{bar, print_report, rate, tail, trim_percent, truncate};
use runner::{Cache, collect_targets, run_suites, workspace};
pub use runner::{
    Runner, coverage_dir, rank, resolve_concurrency, runner, skip_reason, sort_modules,
};

use std::path::{Path, PathBuf};
use std::time::Instant;

use clap::Args;

use crate::commands::project_check::cache::FileHashes;
use crate::utils::{Loader, LoaderGroup, Spinner, warn};

/// Coverage a module is expected to reach, in percent, when `--threshold` says
/// nothing else.
const DEFAULT_THRESHOLD: f64 = 90.0;

/// How many under-covered files are named per module before the rest are
/// counted instead.
pub(super) const MAX_LOW_FILES: usize = 8;

/// How much of a failing suite's output is echoed under `--logs`.
pub(super) const LOG_TAIL_LINES: usize = 40;

/// Where bun writes its coverage files when `bunfig.toml` names no directory.
pub(super) const DEFAULT_COVERAGE_DIR: &str = "coverage";

/// How many suites run at once when `--concurrency` says nothing else.
pub(super) const MAX_CONCURRENCY: usize = 8;

/// What a selection matching no measurable module is told.
const NO_MODULE: &str =
    "No module found to run — a module needs a tests/ directory and a package.json";

#[derive(Args, Debug)]
pub struct CoverageArgs {
    /// Create a YAML issue per under-covered module instead of printing the report.
    #[arg(long, default_value_t = false)]
    pub issues: bool,

    /// Only run modules whose directory name matches (comma-separated).
    #[arg(long)]
    pub modules: Option<String>,

    /// Alias for --modules (comma-separated).
    #[arg(long)]
    pub packages: Option<String>,

    /// Minimum line and function coverage a module must reach, in percent.
    #[arg(long)]
    pub threshold: Option<f64>,

    /// Print the output of every suite that fails.
    #[arg(long, default_value_t = false)]
    pub logs: bool,

    /// How many suites run at once (defaults to the core count, capped at 8).
    #[arg(long)]
    pub concurrency: Option<usize>,

    /// Skip reading and writing the coverage cache.
    #[arg(long, default_value_t = false)]
    pub no_cache: bool,

    /// Report every module under the threshold as a failure, and exit with a
    /// non-zero status.
    #[arg(long, default_value_t = false)]
    pub strict: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

/// How a module's suite ended.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RunStatus {
    /// Every test passed and coverage was collected.
    Passed,
    /// At least one test failed.
    Failed,
    /// The suite passed but bun measured no code — a module exporting only
    /// types has nothing to cover.
    Unmeasured,
    /// The suite could not be run at all.
    Errored(String),
    /// The module was never run — it carries no bun test suite.
    Skipped(String),
}

impl RunStatus {
    /// Whether the run produced coverage worth averaging.
    pub fn is_measured(&self) -> bool {
        matches!(self, RunStatus::Passed | RunStatus::Failed)
    }

    /// Whether the suite ran, whatever it measured.
    pub fn is_run(&self) -> bool {
        self.is_measured() || *self == RunStatus::Unmeasured
    }
}

/// One source file of a module, as the coverage report saw it.
#[derive(Clone, Debug)]
pub struct FileCoverage {
    /// Path relative to the module directory, as reported by bun.
    pub path: String,
    pub lines: f64,
    pub functions: f64,
    /// Uncovered line numbers, already collapsed into ranges (`41-47`, `66`).
    pub uncovered: Vec<String>,
}

impl FileCoverage {
    /// Whether the file misses either threshold.
    pub fn is_low(&self, threshold: f64) -> bool {
        self.lines < threshold || self.functions < threshold
    }
}

/// One module's suite: how it ended, what it covers, and what it printed.
#[derive(Clone, Debug)]
pub struct ModuleCoverage {
    pub name: String,
    /// `modules/user`, `packages/color` — how the module is named in a report.
    pub label: String,
    pub dir: PathBuf,
    pub status: RunStatus,
    pub passed: usize,
    pub failed: usize,
    pub lines: f64,
    pub functions: f64,
    pub files: Vec<FileCoverage>,
    pub duration_ms: u64,
    /// Combined stdout and stderr, kept for `--logs`.
    pub output: String,
    /// Whether the suite was replayed from the cache rather than run.
    pub cached: bool,
}

impl ModuleCoverage {
    /// Whether the module reached both thresholds. A suite that failed or never
    /// ran is never considered covered.
    pub fn is_covered(&self, threshold: f64) -> bool {
        self.status == RunStatus::Passed && self.lines >= threshold && self.functions >= threshold
    }

    /// The files that miss either threshold, worst line coverage first.
    pub fn low_files(&self, threshold: f64) -> Vec<&FileCoverage> {
        let mut files: Vec<&FileCoverage> = self
            .files
            .iter()
            .filter(|file| file.is_low(threshold))
            .collect();
        files.sort_by(|a, b| {
            a.lines
                .total_cmp(&b.lines)
                .then_with(|| a.functions.total_cmp(&b.functions))
                .then_with(|| a.path.cmp(&b.path))
        });
        files
    }
}

/// Outcome of a run, kept free of process exits and printing so it can be
/// embedded in aggregated reports.
#[derive(Clone, Debug, Default)]
pub struct CoverageAudit {
    pub modules: Vec<ModuleCoverage>,
    pub threshold: f64,
}

impl CoverageAudit {
    /// The modules whose suite produced coverage, and so carry a rate.
    pub fn measured(&self) -> Vec<&ModuleCoverage> {
        self.modules
            .iter()
            .filter(|module| module.status.is_measured())
            .collect()
    }

    /// The modules whose suite ran, whatever it measured.
    pub fn ran(&self) -> Vec<&ModuleCoverage> {
        self.modules
            .iter()
            .filter(|module| module.status.is_run())
            .collect()
    }

    /// The modules whose suite failed or could not be run.
    pub fn broken(&self) -> Vec<&ModuleCoverage> {
        self.modules
            .iter()
            .filter(|module| matches!(module.status, RunStatus::Failed | RunStatus::Errored(_)))
            .collect()
    }

    /// The modules that passed but stayed under the threshold.
    pub fn under(&self) -> Vec<&ModuleCoverage> {
        self.modules
            .iter()
            .filter(|module| {
                module.status == RunStatus::Passed && !module.is_covered(self.threshold)
            })
            .collect()
    }

    pub fn tests(&self) -> usize {
        self.modules
            .iter()
            .map(|module| module.passed + module.failed)
            .sum()
    }

    /// Mean line coverage across the modules that reported one.
    pub fn lines(&self) -> f64 {
        mean(self.measured().iter().map(|module| module.lines))
    }

    /// Mean function coverage across the modules that reported one.
    pub fn functions(&self) -> f64 {
        mean(self.measured().iter().map(|module| module.functions))
    }

    /// The modules whose report was replayed from the cache.
    pub fn cached(&self) -> usize {
        self.modules.iter().filter(|module| module.cached).count()
    }

    /// Whether the run should end in a non-zero status: a suite that failed or
    /// could not run always, a module that stayed under the threshold only
    /// under `--strict`.
    pub fn is_failure(&self, strict: bool) -> bool {
        !self.broken().is_empty() || (strict && !self.under().is_empty())
    }
}

/// Run every selected suite and return the coverage instead of printing it.
///
/// This is the whole of the command bar the report it prints, so an embedded
/// run can never measure differently from the command: same targets, same
/// cache, same suites. `quiet` is for the one caller that owns stdout — a JSON
/// report — and only silences the spinner and the loader.
pub fn audit(
    root: &Path,
    modules: Option<&str>,
    packages: Option<&str>,
    threshold: Option<f64>,
    concurrency: Option<usize>,
    no_cache: bool,
    quiet: bool,
) -> Result<CoverageAudit, String> {
    let members = workspace(root, modules, packages);
    let targets = collect_targets(&members);
    if targets.is_empty() {
        return Err(NO_MODULE.to_string());
    }

    let runnable = targets
        .iter()
        .filter(|target| target.skip.is_none())
        .count();

    // Fingerprinting only earns its own walk when there is a suite it could
    // spare, and it is the one stretch before the loader where nothing is
    // printed, so it gets a spinner of its own.
    let hashes = (!no_cache && runnable > 0).then(|| FileHashes::load(root));
    let spinner =
        (hashes.is_some() && !quiet).then(|| Spinner::start("Fingerprinting the workspace..."));
    let cache = hashes.as_ref().map(|hashes| Cache {
        root,
        fingerprints: cache::Fingerprints::build(root, &members, hashes),
    });
    drop(spinner);

    // Suites are the slowest thing the CLI does, so the wait is drawn rather
    // than sat through — whoever asked for the numbers.
    let loader = if runnable > 0 && !quiet {
        Loader::start(vec![LoaderGroup::new("Suites", runnable)])
    } else {
        Loader::hidden()
    };
    let measured = run_suites(targets, concurrency, &loader, cache.as_ref());
    loader.stop();

    if let Some(hashes) = hashes.as_ref() {
        hashes.save();
    }

    Ok(CoverageAudit {
        modules: measured,
        threshold: threshold.unwrap_or(DEFAULT_THRESHOLD),
    })
}

pub fn run(args: &CoverageArgs) {
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
        args.concurrency,
        args.no_cache,
        false,
    ) {
        Ok(audit) => audit,
        Err(message) => {
            warn(message);
            return;
        }
    };

    if args.issues {
        create_issues(&audit);
        return;
    }

    print_report(
        &audit,
        args.logs,
        args.strict,
        started.elapsed().as_millis() as u64,
        false,
    );
    if audit.is_failure(args.strict) {
        std::process::exit(1);
    }
}
