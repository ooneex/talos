//! Workspace discovery and lint execution — running a module's `lint` script
//! and turning its exit status into a [`super::ModuleLint`].

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::Instant;

use crate::commands::project_check::modules::{
    WorkspaceModule, discover_modules, filter_modules, wanted_names,
};
use crate::utils::Loader;

use super::cache;
use super::{LintStatus, MAX_CONCURRENCY, ModuleLint};

// ---------------------------------------------------------------------------
// Module discovery
// ---------------------------------------------------------------------------

/// A workspace member the run knows how to lint, plus why it is being left
/// alone when it is not.
pub(super) struct Target {
    name: String,
    label: String,
    dir: PathBuf,
    /// Present when the module carries no lint script to run.
    pub(super) skip: Option<String>,
}

/// The workspace members `--modules` / `--packages` selected.
pub(super) fn workspace(
    root: &Path,
    modules: Option<&str>,
    packages: Option<&str>,
) -> Vec<WorkspaceModule> {
    filter_modules(discover_modules(root), &wanted_names(modules, packages))
}

pub(super) fn collect_targets(modules: &[WorkspaceModule]) -> Vec<Target> {
    modules
        .iter()
        .map(|module| Target {
            name: module.name.clone(),
            label: module.label(),
            dir: module.dir.clone(),
            skip: skip_reason(module),
        })
        .collect()
}

/// Why a module holds no lint to run. A module without a `package.json`, or
/// one that declares no `lint` script, has nothing to run.
pub fn skip_reason(module: &WorkspaceModule) -> Option<String> {
    let Some(manifest) = module.package_json() else {
        return Some("no package.json".to_string());
    };
    let has_lint = manifest
        .get("scripts")
        .and_then(|scripts| scripts.get("lint"))
        .is_some();
    if !has_lint {
        return Some("no lint script".to_string());
    }
    None
}

// ---------------------------------------------------------------------------
// Lint execution
// ---------------------------------------------------------------------------

/// Where the entries live and what the tree they answer for looks like.
pub(super) struct Cache<'a> {
    pub(super) root: &'a Path,
    pub(super) fingerprints: cache::Fingerprints,
}

impl Cache<'_> {
    /// The lint stored for a target, when it was run from the tree in front
    /// of us.
    fn reuse(&self, target: &Target) -> Option<ModuleLint> {
        let entry = cache::read(self.root, &target.label)?;
        entry
            .matches(&self.fingerprints.inputs(&target.label))
            .then(|| entry.lint(&target.name, &target.label, &target.dir))?
    }

    fn store(&self, lint: &ModuleLint) {
        cache::write(self.root, lint, &self.fingerprints.inputs(&lint.label));
    }
}

/// The lint for one target, reusing the cache when it still answers for the
/// target's current inputs and recording a fresh run otherwise.
fn lint_for_target(target: &Target, loader: &Loader, cache: Option<&Cache>) -> ModuleLint {
    if let Some(reason) = &target.skip {
        return skipped(target, reason.clone());
    }
    // A cache hit is not work in flight, so it is counted rather than named
    // as running.
    if let Some(lint) = cache.and_then(|cache| cache.reuse(target)) {
        loader.advance(0);
        return lint;
    }
    loader.entered(0, target.label.clone());
    let lint = run_lint(target);
    loader.left(0, &target.label);
    if let Some(cache) = cache {
        cache.store(&lint);
    }
    lint
}

/// One worker's share of the queue: pops the next target and records its
/// lint until the queue is empty.
fn run_worker(
    queue: &Mutex<Vec<(usize, Target)>>,
    results: &Mutex<Vec<(usize, ModuleLint)>>,
    loader: &Loader,
    cache: Option<&Cache>,
) {
    loop {
        let Some((index, target)) = queue.lock().expect("the queue is not poisoned").pop() else {
            return;
        };
        let lint = lint_for_target(&target, loader, cache);
        results
            .lock()
            .expect("the results are not poisoned")
            .push((index, lint));
    }
}

/// Run every runnable target, at most `concurrency` at a time, and report the
/// modules in the order they were selected. A target the cache still answers
/// for is never run at all.
pub(super) fn run_targets(
    targets: Vec<Target>,
    concurrency: Option<usize>,
    loader: &Loader,
    cache: Option<&Cache>,
) -> Vec<ModuleLint> {
    let workers = resolve_concurrency(concurrency).min(targets.len().max(1));
    let queue = Mutex::new(targets.into_iter().enumerate().collect::<Vec<_>>());
    let results: Mutex<Vec<(usize, ModuleLint)>> = Mutex::new(Vec::new());

    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| run_worker(&queue, &results, loader, cache));
        }
    });

    let mut modules: Vec<(usize, ModuleLint)> =
        results.into_inner().expect("the results are not poisoned");
    modules.sort_by_key(|(index, _)| *index);
    modules.into_iter().map(|(_, lint)| lint).collect()
}

pub fn resolve_concurrency(requested: Option<usize>) -> usize {
    if let Some(requested) = requested {
        return requested.max(1);
    }
    std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(1)
        .clamp(1, MAX_CONCURRENCY)
}

fn skipped(target: &Target, reason: String) -> ModuleLint {
    ModuleLint {
        name: target.name.clone(),
        label: target.label.clone(),
        dir: target.dir.clone(),
        status: LintStatus::Skipped(reason),
        duration_ms: 0,
        output: String::new(),
        cached: false,
    }
}

/// Run one module's `lint` script and turn its exit status into a
/// [`ModuleLint`].
fn run_lint(target: &Target) -> ModuleLint {
    let started = Instant::now();

    let output = Command::new("bun")
        .arg("run")
        .arg("lint")
        .current_dir(&target.dir)
        .output();

    let duration_ms = started.elapsed().as_millis() as u64;
    let output = match output {
        Ok(output) => output,
        Err(err) => {
            return errored(
                target,
                format!("could not run bun: {err}"),
                String::new(),
                duration_ms,
            );
        }
    };

    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let status = if output.status.success() {
        LintStatus::Passed
    } else {
        LintStatus::Failed
    };

    ModuleLint {
        name: target.name.clone(),
        label: target.label.clone(),
        dir: target.dir.clone(),
        status,
        duration_ms,
        output: text,
        cached: false,
    }
}

fn errored(target: &Target, reason: String, output: String, duration_ms: u64) -> ModuleLint {
    ModuleLint {
        name: target.name.clone(),
        label: target.label.clone(),
        dir: target.dir.clone(),
        status: LintStatus::Errored(reason),
        duration_ms,
        output,
        cached: false,
    }
}
