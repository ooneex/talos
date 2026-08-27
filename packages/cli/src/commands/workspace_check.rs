//! `workspace:check` — the workspace gate: install, build, then measure the
//! tests, lint and score the sources at once.
//!
//! Each step is its own standalone command with its own cache — [`install`],
//! [`build`], [`coverage`], [`lint`] and [`performance_check`] — run here
//! directly rather than through [`workspace_run`]'s per-target scheduler, so
//! the gate behaves exactly as running each of them alone would. Install and
//! build run first, in order, because a suite can only be measured and
//! sources can only be linted once the workspace resolved and compiled. The
//! three that follow read disjoint parts of the tree — one measures the
//! suites, one lints the sources, one scores them — so they run at once
//! instead of one after the other, but quietly: each draws its own live
//! progress bar alone, and two loaders writing to the same terminal at once
//! would corrupt each other's output. Suites are much the slowest of the
//! three, so coverage is the one that draws. Their reports are printed one
//! after the other, under a single header, once all three are back.
//!
//! The performance score is the one advisory step: a rule there fires on a
//! shape rather than on a measurement, so it reports last and only fails the
//! gate under `--strict` — the same thing `performance:check` does when it is
//! run alone. It is scored against its own default threshold rather than the
//! gate's `--threshold`, which is the coverage rate and means something else.
//!
//! `--output` writes those same three reports to `var/outputs/talos_check.md`
//! or `.json` — see [`output`] — for handing to an agent that will fix what
//! they found. It only ever adds a file: the console report is printed and
//! the gate exits exactly as it would have without it.

pub mod output;

pub use crate::utils::OutputFormat;
pub use output::{CheckReport, command_line};

use std::path::{Path, PathBuf};
use std::time::Instant;

use clap::Args;

use crate::commands::build::{self, BuildArgs};
use crate::commands::coverage::{self, CoverageArgs, CoverageAudit};
use crate::commands::install::{self, InstallArgs};
use crate::commands::lint::{self, LintArgs, LintAudit};
use crate::commands::performance_check::{self, PerformanceAudit, PerformanceCheckArgs};

#[derive(Args, Debug)]
pub struct WorkspaceCheckArgs {
    #[arg(long)]
    pub packages: Option<String>,

    #[arg(long)]
    pub modules: Option<String>,

    #[arg(long, default_value_t = false)]
    pub logs: bool,

    #[arg(long, default_value_t = false)]
    pub no_cache: bool,

    /// Minimum line and function coverage a module must reach, in percent.
    #[arg(long)]
    pub threshold: Option<f64>,

    /// How many suites run at once (defaults to the core count, capped at 8).
    #[arg(long)]
    pub concurrency: Option<usize>,

    /// Fail the gate on every module that stayed under the threshold, not just
    /// on the suites that broke.
    #[arg(long, default_value_t = false)]
    pub strict: bool,

    /// Also write the report to var/outputs/talos_check.md or .json, ready to
    /// hand to an agent.
    #[arg(long, value_enum)]
    pub output: Option<OutputFormat>,

    #[arg(long)]
    pub cwd: Option<String>,
}

/// Measure the gate's suites without reporting them or ending the process.
///
/// `project:check` runs this very gate as its workspace check, but owns the
/// report it prints and the status it exits with, so it runs its own commands
/// itself and then asks here for the same coverage [`run`] would have printed.
/// The suites still draw their loader while they run, unless `quiet` says the
/// caller is holding stdout for a report of its own.
pub fn measure(args: &WorkspaceCheckArgs, quiet: bool) -> Result<CoverageAudit, String> {
    let root = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(crate::utils::current_dir);

    coverage::audit(
        &root,
        args.modules.as_deref(),
        args.packages.as_deref(),
        args.threshold,
        args.concurrency,
        args.no_cache,
        quiet,
    )
}

pub fn install_args(args: &WorkspaceCheckArgs) -> InstallArgs {
    InstallArgs {
        force: false,
        audit_level: None,
        skip_audit: false,
        no_cache: args.no_cache,
        cwd: args.cwd.clone(),
    }
}

pub fn build_args(args: &WorkspaceCheckArgs) -> BuildArgs {
    BuildArgs {
        packages: args.packages.clone(),
        modules: args.modules.clone(),
        logs: args.logs,
        no_cache: args.no_cache,
        cwd: args.cwd.clone(),
    }
}

pub fn lint_args(args: &WorkspaceCheckArgs) -> LintArgs {
    LintArgs {
        packages: args.packages.clone(),
        modules: args.modules.clone(),
        logs: args.logs,
        no_cache: args.no_cache,
        cwd: args.cwd.clone(),
    }
}

pub fn coverage_args(args: &WorkspaceCheckArgs) -> CoverageArgs {
    CoverageArgs {
        issues: false,
        modules: args.modules.clone(),
        packages: args.packages.clone(),
        threshold: args.threshold,
        logs: args.logs,
        concurrency: args.concurrency,
        no_cache: args.no_cache,
        strict: args.strict,
        cwd: args.cwd.clone(),
    }
}

/// The gate's `performance:check`.
///
/// `threshold` is deliberately left unset: the gate's own `--threshold` is a
/// coverage rate, and spending it on a second, unrelated score would mean one
/// number quietly deciding two different things.
pub fn performance_args(args: &WorkspaceCheckArgs) -> PerformanceCheckArgs {
    PerformanceCheckArgs {
        issues: false,
        modules: args.modules.clone(),
        packages: args.packages.clone(),
        threshold: None,
        min_severity: None,
        logs: args.logs,
        strict: args.strict,
        cwd: args.cwd.clone(),
    }
}

/// Score the gate's sources without reporting them or ending the process —
/// the same audit [`run`] prints, for a caller that owns its own report.
pub fn score(args: &WorkspaceCheckArgs, quiet: bool) -> Result<PerformanceAudit, String> {
    let root = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(crate::utils::current_dir);
    let performance = performance_args(args);

    performance_check::audit(
        &root,
        performance.modules.as_deref(),
        performance.packages.as_deref(),
        performance.threshold,
        performance.min_severity.as_deref(),
        quiet,
    )
}

pub fn run(args: &WorkspaceCheckArgs) {
    // The suites are only worth measuring, and the sources only worth
    // linting, against a workspace that installed and built cleanly, so a
    // failure at either step ends the gate before either runs.
    if !install::execute(&install_args(args)) {
        std::process::exit(1);
    }
    if !build::execute(&build_args(args)) {
        std::process::exit(1);
    }

    // Coverage, lint and the performance score touch disjoint parts of the
    // workspace, so they run on their own threads at once. Suites are much
    // the slowest of the three, so coverage draws the live loader; the other
    // two run quietly beside it — two loaders writing to the same terminal at
    // once would corrupt each other's output — and all three reports print
    // once all three are back, so they print whole instead of interleaved
    // mid-line.
    let started = Instant::now();
    let root = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(crate::utils::current_dir);

    let (coverage, lint, performance) = std::thread::scope(|scope| {
        let coverage = scope.spawn(|| measure(args, false));
        let lint = scope.spawn(|| {
            lint::audit(
                &root,
                args.modules.as_deref(),
                args.packages.as_deref(),
                args.no_cache,
                true,
            )
        });
        let performance = scope.spawn(|| score(args, true));
        (coverage.join(), lint.join(), performance.join())
    });
    let elapsed_ms = started.elapsed().as_millis() as u64;

    let coverage = coverage.unwrap_or_else(|_| Err("coverage panicked".to_string()));
    let lint = lint.unwrap_or_else(|_| Err("lint panicked".to_string()));
    let performance =
        performance.unwrap_or_else(|_| Err("the performance score panicked".to_string()));

    let passed = print_check_report(args, &coverage, &lint, &performance, elapsed_ms);

    // The file is written after the report and never instead of it: whatever
    // it does, the terminal has already said the same thing.
    if let Some(format) = args.output {
        write_output(
            &root,
            format,
            &CheckReport {
                coverage: &coverage,
                lint: &lint,
                performance: &performance,
                strict: args.strict,
                elapsed_ms,
                passed,
                command: command_line(args),
            },
        );
    }

    if !passed {
        std::process::exit(1);
    }
}

/// Write the gate's report under `var/outputs` and say where it landed.
fn write_output(root: &Path, format: OutputFormat, report: &CheckReport) {
    crate::utils::announce_report_file(output::write(root, format, report), false);
}

/// Prints coverage, lint and the performance score as one gate report instead
/// of the three each would draw alone, then returns whether the gate passed so
/// [`run`] can decide the status once.
///
/// Every report is printed whatever the others found — a gate that stopped at
/// the first failure would hide the other two, and the point of running them
/// together is seeing all three at once.
fn print_check_report(
    args: &WorkspaceCheckArgs,
    coverage: &Result<CoverageAudit, String>,
    lint: &Result<LintAudit, String>,
    performance: &Result<PerformanceAudit, String>,
    elapsed_ms: u64,
) -> bool {
    let coverage_passed = match coverage {
        Ok(audit) => {
            coverage::print_report(audit, args.logs, args.strict, elapsed_ms, true);
            !audit.is_failure(args.strict)
        }
        Err(message) => {
            crate::utils::warn(message);
            false
        }
    };

    let lint_passed = match lint {
        Ok(audit) => {
            lint::print_report(audit, args.logs, elapsed_ms);
            !audit.is_failure()
        }
        Err(message) => {
            crate::utils::error(message);
            false
        }
    };

    // A workspace with no TypeScript to score is not a failing gate, so this
    // one warns where the others error: nothing to score is an absence, not a
    // verdict.
    let performance_passed = match performance {
        Ok(audit) => {
            performance_check::print_report(audit, args.logs, args.strict, elapsed_ms, true);
            !audit.is_failure(args.strict)
        }
        Err(message) => {
            crate::utils::warn(message);
            true
        }
    };

    coverage_passed && lint_passed && performance_passed
}
