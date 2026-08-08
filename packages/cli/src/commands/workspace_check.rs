//! `workspace:check` — the workspace gate: install, build, then measure the
//! tests and lint at once.
//!
//! Each step is its own standalone command with its own cache — [`install`],
//! [`build`], [`coverage_check`] and [`lint`] — run here directly rather than
//! through [`workspace_run`]'s per-target scheduler, so the gate behaves
//! exactly as running each of them alone would. Install and build run first,
//! in order, because a suite can only be measured and sources can only be
//! linted once the workspace resolved and compiled. Coverage and lint read
//! disjoint parts of the tree from there on — one measures the suites, the
//! other lints the sources — so they run at once instead of one after the
//! other.

use std::path::PathBuf;
use std::time::Instant;

use clap::Args;

use crate::commands::build::{self, BuildArgs};
use crate::commands::coverage_check::{self, CoverageAudit, CoverageCheckArgs};
use crate::commands::install::{self, InstallArgs};
use crate::commands::lint::{self, LintArgs};

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

    coverage_check::audit(
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

pub fn coverage_args(args: &WorkspaceCheckArgs) -> CoverageCheckArgs {
    CoverageCheckArgs {
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

    // Coverage and lint touch disjoint parts of the workspace, so they run on
    // their own threads at once rather than one after the other.
    let (coverage_failed, lint_passed) = std::thread::scope(|scope| {
        let coverage = scope.spawn(|| run_coverage(args));
        let lint = scope.spawn(|| lint::execute(&lint_args(args)));
        (coverage.join().unwrap_or(true), lint.join().unwrap_or(false))
    });

    if coverage_failed || !lint_passed {
        std::process::exit(1);
    }
}

/// Measures and prints the coverage report the same way [`coverage_check::run`]
/// would, but returns whether it failed instead of exiting the process — so
/// [`run`] can join it against lint before deciding the gate's status.
fn run_coverage(args: &WorkspaceCheckArgs) -> bool {
    let started = Instant::now();

    let audit = match measure(args, false) {
        Ok(audit) => audit,
        Err(message) => {
            crate::utils::warn(message);
            return false;
        }
    };

    coverage_check::print_report(
        &audit,
        args.logs,
        args.strict,
        started.elapsed().as_millis() as u64,
        false,
    );
    audit.is_failure(args.strict)
}
