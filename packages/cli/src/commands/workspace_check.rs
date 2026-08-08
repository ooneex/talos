//! `workspace:check` — the workspace gate: install, build, format, lint, then
//! measure the tests.
//!
//! The first four steps are package scripts, so they are run through
//! [`workspace_run`]. The test step is not: running `bun test` per target says
//! only that the suites pass, and a workspace gate is the place where how much
//! they cover matters too. So the suites are run by [`coverage_check`] instead,
//! which measures them once — with the same caching — and reports the modules
//! ranked worst first alongside the files pulling them down.

use std::path::PathBuf;

use clap::Args;

use crate::commands::coverage_check::{self, CoverageAudit, CoverageCheckArgs};
use crate::commands::workspace_run::{self, WorkspaceRunArgs};

/// The package scripts run before the suites are measured, in order.
pub const CHECK_COMMANDS: &str = "install,build,fmt,lint";

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
/// report it prints and the status it exits with, so it runs [`CHECK_COMMANDS`]
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

pub fn script_args(args: &WorkspaceCheckArgs) -> WorkspaceRunArgs {
    WorkspaceRunArgs {
        commands: Some(CHECK_COMMANDS.to_string()),
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
    // The suites are only worth measuring against a workspace that installed,
    // built, formatted and linted, so a failure here ends the gate — as
    // `workspace_run::run` would, but before coverage is reached.
    if !workspace_run::execute(&script_args(args)) {
        std::process::exit(1);
    }

    // Exits non-zero itself on a broken suite, and under `--strict` on a module
    // that stayed under the threshold.
    coverage_check::run(&coverage_args(args));
}
