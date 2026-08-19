// Running one `bin/` script across every module — `migration:up`,
// `migration:down`, `seed:run` — behind a spinner, a progress bar and a
// report.
//
// The scripts all talk to the same database and each one applies what it
// transitively imports, so they run one at a time rather than in parallel —
// see [`runner`]. Each line they print — one per migration or seed — is
// streamed above the loader as it arrives and kept for `--logs`, and a module
// that fails always ends the run in a non-zero status.

mod report;
mod runner;
mod stream;

pub use report::print_report;
use runner::{collect_targets, run_targets};

use std::path::{Path, PathBuf};
use std::time::Instant;

use super::{Loader, LoaderGroup, Spinner};

/// How many lines of a failing module's output a report shows.
const LOG_TAIL_LINES: usize = 40;

/// What one command runs, and how a report names it.
pub struct ModuleScriptsOptions<'a> {
    /// The script every module carries, as path segments —
    /// `["bin", "migration", "up.ts"]`.
    pub bin_path: &'a [&'a str],
    /// `migration:up` — how a module's run is named in a report row, and in
    /// the line that says it failed.
    pub script: &'a str,
    /// `Migrate` — the loader row's title.
    pub group: &'a str,
    /// `Migration report` — the report's heading, minus its marker.
    pub title: &'a str,
    /// `migrated` — how the summary says a module's run ended well.
    pub done: &'a str,
    /// `Every module is up to date` — the summary of a run with no failure.
    pub clean: &'a str,
    /// Where the scripts keep their "already ran" markers, relative to the
    /// project root.
    pub cache_dir: &'a str,
    /// Starts the run from scratch: the cache goes, and the first module gets
    /// the flag — `migration:up` drops the schema on it, `seed:run` only
    /// re-runs every seed.
    pub drop: bool,
    /// Passed to every script as `APP_ENV`.
    pub env: Option<String>,
    /// The one version to act on, for a command that takes one.
    pub version: Option<String>,
    pub no_cache: bool,
    /// Walks the modules from last to first. Rolling back has to mirror
    /// applying: a module whose migrations sit on top of another module's
    /// tables must be undone before the module underneath it.
    pub reverse: bool,
}

/// How a module's run ended.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ScriptStatus {
    /// The script exited clean.
    Succeeded,
    /// The script exited non-zero.
    Failed,
    /// The script could not be run at all.
    Errored(String),
}

/// One module's run: how it ended, how long it took, and what it printed.
#[derive(Clone, Debug)]
pub struct ModuleScript {
    pub name: String,
    /// `modules/user` — how the module is named while it is running.
    pub label: String,
    pub dir: PathBuf,
    pub status: ScriptStatus,
    pub duration_ms: u64,
    /// Combined stdout and stderr, kept for `--logs`.
    pub output: String,
}

/// Outcome of a run, kept free of process exits and printing so it can be
/// embedded in aggregated reports.
#[derive(Clone, Debug, Default)]
pub struct ScriptAudit {
    pub modules: Vec<ModuleScript>,
}

impl ScriptAudit {
    /// How many modules ran cleanly.
    pub fn succeeded(&self) -> usize {
        self.modules
            .iter()
            .filter(|module| module.status == ScriptStatus::Succeeded)
            .count()
    }

    /// The modules that failed or could not be run.
    pub fn broken(&self) -> Vec<&ModuleScript> {
        self.modules
            .iter()
            .filter(|module| {
                matches!(
                    module.status,
                    ScriptStatus::Failed | ScriptStatus::Errored(_)
                )
            })
            .collect()
    }

    /// Whether the run should end in a non-zero status.
    pub fn is_failure(&self) -> bool {
        !self.broken().is_empty()
    }
}

/// Run the script in every module that carries it and return the audit
/// instead of printing it.
///
/// This is the whole of a command bar the report it prints, so an embedded
/// run can never behave differently from the command: same modules, same
/// order, same scripts. `quiet` is for a caller that owns stdout: it silences
/// the spinner, the loader and the streamed lines, which stay readable on the
/// audit.
pub fn audit(root: &Path, options: &ModuleScriptsOptions, quiet: bool) -> ScriptAudit {
    // Walking the workspace is the one stretch before the loader where nothing
    // is printed, so it gets a spinner of its own.
    let spinner =
        (!quiet).then(|| Spinner::start(format!("Discovering {} scripts...", options.script)));
    let targets = collect_targets(root, options);
    std::mem::drop(spinner);

    if targets.is_empty() {
        return ScriptAudit::default();
    }

    // A drop invalidates every cached "already ran" marker, so the cache
    // directory goes with it — otherwise the modules after the first would
    // skip the work the run is meant to redo.
    if options.drop {
        let _ = std::fs::remove_dir_all(root.join(options.cache_dir));
    }

    let loader = if quiet {
        Loader::hidden()
    } else {
        Loader::start(vec![LoaderGroup::new(options.group, targets.len())])
    };
    let modules = run_targets(targets, root, options, &loader, !quiet);
    loader.stop();

    ScriptAudit { modules }
}

/// Run the script across every module, print the report, and return whether
/// the run succeeded. A workspace where no module carries the script is said
/// so and counts as a success — there was nothing to run.
pub fn run_module_scripts(root: &Path, options: ModuleScriptsOptions, logs: bool) -> bool {
    let started = Instant::now();
    let audit = audit(root, &options, false);

    if audit.modules.is_empty() {
        super::warn(format!(
            "No module found to run — a module needs a package.json and a {} script",
            options.bin_path.join("/")
        ));
        return true;
    }

    print_report(&audit, &options, logs, started.elapsed().as_millis() as u64);
    !audit.is_failure()
}
