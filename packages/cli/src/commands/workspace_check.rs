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
//! other, but quietly: each draws its own live progress bar, and two loaders
//! writing to the same terminal at once would corrupt each other's output.
//! Their reports are printed one after the other, under a single header,
//! once both are back.

use std::path::PathBuf;
use std::time::Instant;

use clap::Args;
use console::style;

use crate::commands::build::{self, BuildArgs};
use crate::commands::coverage_check::{self, CoverageAudit, CoverageCheckArgs};
use crate::commands::install::{self, InstallArgs};
use crate::commands::lint::{self, LintArgs, LintAudit};

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

    // Coverage and lint touch disjoint parts of the workspace, so they are
    // measured on their own threads at once — quietly, so neither draws a
    // live progress bar over the other — and only reported once both are
    // back, so the two reports print whole instead of interleaved mid-line.
    let started = Instant::now();
    let root = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(crate::utils::current_dir);

    let (coverage, lint) = std::thread::scope(|scope| {
        let coverage = scope.spawn(|| measure(args, true));
        let lint = scope.spawn(|| {
            lint::audit(
                &root,
                args.modules.as_deref(),
                args.packages.as_deref(),
                args.no_cache,
                true,
            )
        });
        (coverage.join(), lint.join())
    });
    let elapsed_ms = started.elapsed().as_millis() as u64;

    let (coverage_failed, lint_passed) = print_check_report(
        args,
        coverage.unwrap_or_else(|_| Err("coverage panicked".to_string())),
        lint.unwrap_or_else(|_| Err("lint panicked".to_string())),
        elapsed_ms,
    );

    if coverage_failed || !lint_passed {
        std::process::exit(1);
    }
}

/// Prints coverage and lint as one gate report instead of the two each would
/// draw alone, then returns whether coverage failed and whether lint passed
/// so [`run`] can decide the gate's status.
fn print_check_report(
    args: &WorkspaceCheckArgs,
    coverage: Result<CoverageAudit, String>,
    lint: Result<LintAudit, String>,
    elapsed_ms: u64,
) -> (bool, bool) {
    println!();
    println!("{}", style("▸ Workspace check").magenta().bold());

    let coverage_failed = match coverage {
        Ok(audit) => {
            coverage_check::print_report(&audit, args.logs, args.strict, elapsed_ms, true);
            audit.is_failure(args.strict)
        }
        Err(message) => {
            crate::utils::warn(message);
            true
        }
    };

    let lint_passed = match lint {
        Ok(audit) => {
            lint::print_report(&audit, args.logs, elapsed_ms);
            !audit.is_failure()
        }
        Err(message) => {
            crate::utils::error(message);
            false
        }
    };

    (coverage_failed, lint_passed)
}
