// `lint` — run every module's `lint` script (`tsc --noEmit && bunx biome
// lint` for a TypeScript package, `cargo clippy` for the Rust CLI) and report
// which ones are clean.
//
// A module's lint result is a pure function of the code it and its workspace
// dependencies read, so a module whose sources have not moved since it last
// passed is replayed from its own cache — see [`cache`] — rather than linted
// again. `--no-cache` turns that off, and a failing module always ends the
// run in a non-zero status. Modules are linted in parallel, and `--output`
// leaves the same report behind as a file, for an agent to fix what it
// lists — see [`output`].

#[path = "lint/cache.rs"]
pub mod cache;
mod output;
mod report;
mod runner;

pub use report::print_report;
use runner::{Cache, collect_targets, run_targets, workspace};

use std::path::{Path, PathBuf};
use std::time::Instant;

use clap::Args;

use crate::commands::project_check::cache::FileHashes;
use crate::utils::{
    Loader, LoaderGroup, OutputFormat, Spinner, announce_agent_report, write_agent_report,
};

/// How many modules a report shows the output of before it is truncated.
pub(super) const LOG_TAIL_LINES: usize = 40;

/// How many lints run at once.
pub(super) const MAX_CONCURRENCY: usize = 8;

/// What a selection matching no lintable module is told.
const NO_MODULE: &str =
    "No module found to lint — a module needs a package.json with a \"lint\" script";

#[derive(Args, Debug)]
pub struct LintArgs {
    /// Only lint modules whose directory name matches (comma-separated).
    #[arg(long)]
    pub modules: Option<String>,

    /// Alias for --modules (comma-separated).
    #[arg(long)]
    pub packages: Option<String>,

    /// Print the output of every module that fails.
    #[arg(long, default_value_t = false)]
    pub logs: bool,

    /// Skip reading and writing the lint cache.
    #[arg(long, default_value_t = false)]
    pub no_cache: bool,

    /// Also write the report to var/outputs/talos_lint.md or
    /// var/outputs/talos_lint.json, in the shape an AI agent is handed to fix
    /// what it lists.
    #[arg(long, value_enum)]
    pub output: Option<OutputFormat>,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

/// How a module's lint ended.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LintStatus {
    /// The lint script exited clean.
    Passed,
    /// The lint script exited non-zero.
    Failed,
    /// The lint could not be run at all.
    Errored(String),
    /// The module was never run — it carries no lint script.
    Skipped(String),
}

impl LintStatus {
    /// Whether the module was actually run, cached or not.
    pub fn is_run(&self) -> bool {
        matches!(self, LintStatus::Passed | LintStatus::Failed)
    }
}

/// One module's lint: how it ended, how long it took, and what it printed.
#[derive(Clone, Debug)]
pub struct ModuleLint {
    pub name: String,
    /// `modules/user`, `packages/color` — how the module is named in a report.
    pub label: String,
    pub dir: PathBuf,
    pub status: LintStatus,
    pub duration_ms: u64,
    /// Combined stdout and stderr, kept for `--logs`.
    pub output: String,
    /// Whether the result was replayed from the cache rather than run.
    pub cached: bool,
}

/// Outcome of a run, kept free of process exits and printing so it can be
/// embedded in aggregated reports.
#[derive(Clone, Debug, Default)]
pub struct LintAudit {
    pub modules: Vec<ModuleLint>,
}

impl LintAudit {
    /// The modules whose lint actually ran, whatever it found.
    pub fn ran(&self) -> Vec<&ModuleLint> {
        self.modules
            .iter()
            .filter(|module| module.status.is_run())
            .collect()
    }

    /// The modules that failed or could not be run.
    pub fn broken(&self) -> Vec<&ModuleLint> {
        self.modules
            .iter()
            .filter(|module| matches!(module.status, LintStatus::Failed | LintStatus::Errored(_)))
            .collect()
    }

    /// The modules whose result was replayed from the cache.
    pub fn cached(&self) -> usize {
        self.modules.iter().filter(|module| module.cached).count()
    }

    /// Whether the run should end in a non-zero status.
    pub fn is_failure(&self) -> bool {
        !self.broken().is_empty()
    }
}

/// Run every selected module's lint and return the audit instead of printing it.
///
/// This is the whole of the command bar the report it prints, so an embedded
/// run can never lint differently from the command: same targets, same
/// cache, same scripts. `quiet` is for a caller that owns stdout and only
/// silences the spinner and the loader.
pub fn audit(
    root: &Path,
    modules: Option<&str>,
    packages: Option<&str>,
    no_cache: bool,
    quiet: bool,
) -> Result<LintAudit, String> {
    let members = workspace(root, modules, packages);
    let targets = collect_targets(&members);
    if targets.is_empty() {
        return Err(NO_MODULE.to_string());
    }

    let runnable = targets
        .iter()
        .filter(|target| target.skip.is_none())
        .count();

    // Fingerprinting only earns its own walk when there is a lint it could
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

    let loader = if runnable > 0 && !quiet {
        Loader::start(vec![LoaderGroup::new("Lint", runnable)])
    } else {
        Loader::hidden()
    };
    let linted = run_targets(targets, None, &loader, cache.as_ref());
    loader.stop();

    if let Some(hashes) = hashes.as_ref() {
        hashes.save();
    }

    Ok(LintAudit { modules: linted })
}

pub fn run(args: &LintArgs) {
    if !execute(args) {
        std::process::exit(1);
    }
}

/// Lint every selected module and print the report, returning whether the
/// run succeeded — so [`workspace_run`](crate::commands::workspace_run) can
/// dispatch `lint` alongside its other standalone commands without a second
/// process exit of its own.
pub fn execute(args: &LintArgs) -> bool {
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
        args.no_cache,
        false,
    ) {
        Ok(audit) => audit,
        Err(message) => {
            crate::utils::error(message);
            return false;
        }
    };

    let elapsed_ms = started.elapsed().as_millis() as u64;
    print_report(&audit, args.logs, elapsed_ms);

    // The file is written after the report and never instead of it: whatever
    // it does, the terminal has already said the same thing.
    if let Some(format) = args.output {
        let report = output::report(args, &audit, elapsed_ms);
        announce_agent_report(write_agent_report(&root, format, &report));
    }

    !audit.is_failure()
}
