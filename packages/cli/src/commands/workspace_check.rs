//! `workspace:check` — the workspace gate: install, then lint the sources.
//!
//! Each step is its own standalone command with its own cache — [`install`]
//! and [`lint`] — run here directly rather than through [`workspace_run`]'s
//! per-target scheduler, so the gate behaves exactly as running each of them
//! alone would. Install runs first, because sources can only be linted once
//! the workspace resolved.
//!
//! `--output` writes that same report to `var/outputs/talos_check.md` or
//! `.json` — see [`output`] — for handing to an agent that will fix what it
//! found. It only ever adds a file: the console report is printed and the
//! gate exits exactly as it would have without it.

pub mod output;

pub use crate::utils::OutputFormat;
pub use output::{CheckReport, command_line};

use std::path::{Path, PathBuf};
use std::time::Instant;

use clap::Args;

use crate::commands::coverage::{self, CoverageAudit};
use crate::commands::install::{self, InstallArgs};
use crate::commands::lint::{self, LintArgs, LintAudit};
use crate::commands::performance_check::{self, PerformanceAudit};

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
    ///
    /// Not a flag of the gate, which measures nothing: the field is here for
    /// [`measure`] and [`score`], which `project:check` calls with options of
    /// its own. A flag the gate would ignore is worse than no flag at all.
    #[arg(skip)]
    pub threshold: Option<f64>,

    /// How many suites [`measure`] runs at once — see
    /// [`threshold`](Self::threshold) for why this is not a flag.
    #[arg(skip)]
    pub concurrency: Option<usize>,

    /// Whether a caller of [`measure`] treats a module under the threshold as
    /// a failure — see [`threshold`](Self::threshold) for why this is not a
    /// flag.
    #[arg(skip)]
    pub strict: bool,

    /// Also write the report to var/outputs/talos_check.md or .json, ready to
    /// hand to an agent.
    #[arg(long, value_enum)]
    pub output: Option<OutputFormat>,

    #[arg(long)]
    pub cwd: Option<String>,
}

/// Measure a workspace's suites without reporting them or ending the process.
///
/// The gate itself no longer measures anything, but `project:check` owns a
/// coverage check of its own and asks for it here so it reads the same flags
/// through the same [`WorkspaceCheckArgs`] its other checks do. The suites
/// still draw their loader while they run, unless `quiet` says the caller is
/// holding stdout for a report of its own.
pub fn measure(args: &WorkspaceCheckArgs, quiet: bool) -> Result<CoverageAudit, String> {
    coverage::audit(
        &root(args),
        args.modules.as_deref(),
        args.packages.as_deref(),
        args.threshold,
        args.concurrency,
        args.no_cache,
        quiet,
    )
}

/// Score a workspace's sources without reporting them or ending the process —
/// the counterpart of [`measure`], for the same caller.
///
/// The threshold is deliberately left unset: `--threshold` is a coverage
/// rate, and spending it on a second, unrelated score would mean one number
/// quietly deciding two different things.
pub fn score(args: &WorkspaceCheckArgs, quiet: bool) -> Result<PerformanceAudit, String> {
    performance_check::audit(
        &root(args),
        args.modules.as_deref(),
        args.packages.as_deref(),
        None,
        None,
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

pub fn lint_args(args: &WorkspaceCheckArgs) -> LintArgs {
    LintArgs {
        packages: args.packages.clone(),
        modules: args.modules.clone(),
        logs: args.logs,
        no_cache: args.no_cache,
        cwd: args.cwd.clone(),
    }
}

/// Where the gate runs, which is the current directory unless `--cwd` names
/// somewhere else.
fn root(args: &WorkspaceCheckArgs) -> PathBuf {
    args.cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(crate::utils::current_dir)
}

pub fn run(args: &WorkspaceCheckArgs) {
    // The sources are only worth linting against a workspace that installed
    // cleanly, so a failure there ends the gate before lint runs.
    if !install::execute(&install_args(args)) {
        std::process::exit(1);
    }

    // Lint is the whole of the gate now, so it draws its own live loader
    // rather than running quietly beside something slower.
    let started = Instant::now();
    let root = root(args);
    let lint = lint::audit(
        &root,
        args.modules.as_deref(),
        args.packages.as_deref(),
        args.no_cache,
        false,
    );
    let elapsed_ms = started.elapsed().as_millis() as u64;

    let passed = print_check_report(args, &lint, elapsed_ms);

    // The file is written after the report and never instead of it: whatever
    // it does, the terminal has already said the same thing.
    if let Some(format) = args.output {
        write_output(
            &root,
            format,
            &CheckReport {
                lint: &lint,
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

/// Prints the lint report under the gate's own header, then returns whether
/// the gate passed so [`run`] can decide the status once.
fn print_check_report(
    args: &WorkspaceCheckArgs,
    lint: &Result<LintAudit, String>,
    elapsed_ms: u64,
) -> bool {
    match lint {
        Ok(audit) => {
            lint::print_report(audit, args.logs, elapsed_ms);
            !audit.is_failure()
        }
        Err(message) => {
            crate::utils::error(message);
            false
        }
    }
}
