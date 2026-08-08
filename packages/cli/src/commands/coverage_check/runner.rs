//! Workspace discovery and suite execution — running a module's tests under
//! `bun test --coverage` and turning their output into a [`super::ModuleCoverage`].

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::Instant;

use crate::commands::project_check::modules::{
    WorkspaceModule, discover_modules, filter_modules, wanted_names,
};
use crate::utils::{Loader, is_rust_module};

use super::cache;
use super::parsing::{CoverageReport, parse_counts, parse_lcov, parse_table};
use super::{DEFAULT_COVERAGE_DIR, MAX_CONCURRENCY, ModuleCoverage, RunStatus};

// ---------------------------------------------------------------------------
// Module discovery
// ---------------------------------------------------------------------------

/// Which toolchain owns a module's tests, and therefore what has to be run to
/// measure them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Runner {
    /// `bun test --coverage`, read from the table it prints.
    Bun,
}

/// A workspace member the run knows how to handle, plus why it is being left
/// alone when it is not.
pub(super) struct Target {
    name: String,
    label: String,
    dir: PathBuf,
    runner: Runner,
    /// Present when the module carries no suite to run.
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
            runner: runner(module),
            skip: skip_reason(module),
        })
        .collect()
}

/// Which toolchain measures a module.
pub fn runner(_module: &WorkspaceModule) -> Runner {
    Runner::Bun
}

/// Why a module holds no suite to measure. A module without a `tests/`
/// directory has nothing to measure, and a Rust module carries its own
/// coverage tooling (`sh scripts/coverage.sh`) rather than a bun suite.
pub fn skip_reason(module: &WorkspaceModule) -> Option<String> {
    if is_rust_module(&module.dir) {
        return Some("rust module — run `sh scripts/coverage.sh` instead".to_string());
    }
    if !module.package_json_path().is_file() {
        return Some("no package.json".to_string());
    }
    if !module.dir.join("tests").is_dir() {
        return Some("no tests/ directory".to_string());
    }
    None
}

// ---------------------------------------------------------------------------
// Suite execution
// ---------------------------------------------------------------------------

/// Where the entries live and what the tree they answer for looks like.
pub(super) struct Cache<'a> {
    pub(super) root: &'a Path,
    pub(super) fingerprints: cache::Fingerprints,
}

impl Cache<'_> {
    /// The report stored for a target, when it was measured from the tree in
    /// front of us.
    fn reuse(&self, target: &Target) -> Option<ModuleCoverage> {
        let entry = cache::read(self.root, &target.label)?;
        entry
            .matches(&self.fingerprints.inputs(&target.label))
            .then(|| entry.coverage(&target.name, &target.label, &target.dir))?
    }

    fn store(&self, coverage: &ModuleCoverage) {
        cache::write(
            self.root,
            coverage,
            &self.fingerprints.inputs(&coverage.label),
        );
    }
}

/// The coverage for one target, reusing the cache when it still answers for
/// the target's current inputs and recording a fresh run otherwise.
fn coverage_for_target(target: &Target, loader: &Loader, cache: Option<&Cache>) -> ModuleCoverage {
    if let Some(reason) = &target.skip {
        return skipped_module(target, reason.clone());
    }
    // A cache hit is not work in flight, so it is counted rather than named
    // as running.
    if let Some(coverage) = cache.and_then(|cache| cache.reuse(target)) {
        loader.advance(0);
        return coverage;
    }
    loader.entered(0, target.label.clone());
    let coverage = run_suite(target);
    loader.left(0, &target.label);
    if let Some(cache) = cache {
        cache.store(&coverage);
    }
    coverage
}

/// One worker's share of the queue: pops the next target and records its
/// coverage until the queue is empty.
fn run_worker(
    queue: &Mutex<Vec<(usize, Target)>>,
    results: &Mutex<Vec<(usize, ModuleCoverage)>>,
    loader: &Loader,
    cache: Option<&Cache>,
) {
    loop {
        let Some((index, target)) = queue.lock().expect("the queue is not poisoned").pop() else {
            return;
        };
        let coverage = coverage_for_target(&target, loader, cache);
        results
            .lock()
            .expect("the results are not poisoned")
            .push((index, coverage));
    }
}

/// Run every runnable target, at most `concurrency` at a time, and report the
/// modules sorted worst first. A target the cache still answers for is never
/// run at all.
pub(super) fn run_suites(
    targets: Vec<Target>,
    concurrency: Option<usize>,
    loader: &Loader,
    cache: Option<&Cache>,
) -> Vec<ModuleCoverage> {
    let workers = resolve_concurrency(concurrency).min(targets.len().max(1));
    let queue = Mutex::new(targets.into_iter().enumerate().collect::<Vec<_>>());
    let results: Mutex<Vec<(usize, ModuleCoverage)>> = Mutex::new(Vec::new());

    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| run_worker(&queue, &results, loader, cache));
        }
    });

    let mut modules: Vec<ModuleCoverage> = results
        .into_inner()
        .expect("the results are not poisoned")
        .into_iter()
        .map(|(_, coverage)| coverage)
        .collect();
    sort_modules(&mut modules);
    modules
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

/// Broken suites first, then the least covered — the report is read from the
/// top, so what needs work is what is read first.
pub fn sort_modules(modules: &mut [ModuleCoverage]) {
    modules.sort_by(|a, b| {
        rank(&a.status)
            .cmp(&rank(&b.status))
            .then_with(|| a.lines.total_cmp(&b.lines))
            .then_with(|| a.functions.total_cmp(&b.functions))
            .then_with(|| a.label.cmp(&b.label))
    });
}

pub fn rank(status: &RunStatus) -> u8 {
    match status {
        RunStatus::Failed => 0,
        RunStatus::Errored(_) => 1,
        RunStatus::Passed => 2,
        RunStatus::Unmeasured => 3,
        RunStatus::Skipped(_) => 4,
    }
}

fn skipped_module(target: &Target, reason: String) -> ModuleCoverage {
    ModuleCoverage {
        name: target.name.clone(),
        label: target.label.clone(),
        dir: target.dir.clone(),
        status: RunStatus::Skipped(reason),
        passed: 0,
        failed: 0,
        lines: 0.0,
        functions: 0.0,
        files: Vec::new(),
        duration_ms: 0,
        output: String::new(),
        cached: false,
    }
}

/// Run one module's suite with coverage on.
fn run_suite(target: &Target) -> ModuleCoverage {
    match target.runner {
        Runner::Bun => run_bun_suite(target),
    }
}

/// Where the module's `lcov.info` goes, cleared first so a stale report from an
/// earlier run can never be read as this one's.
fn prepare_lcov(target: &Target) -> PathBuf {
    let dir = target.dir.join(coverage_dir(&target.dir));
    let _ = fs::create_dir_all(&dir);
    let lcov = dir.join("lcov.info");
    let _ = fs::remove_file(&lcov);
    lcov
}

/// Run one module's suite under `bun test --coverage` and read what it printed.
fn run_bun_suite(target: &Target) -> ModuleCoverage {
    let started = Instant::now();
    let lcov = prepare_lcov(target);

    let output = Command::new("bun")
        .arg("test")
        .arg("tests")
        .args(["--coverage", "--coverage-reporter=text"])
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
    let (passed, failed) = parse_counts(&text);

    // The table is the primary source; a module whose `bunfig.toml` pins the
    // reporter to lcov alone still reports through the file it wrote.
    let Some(report) = parse_table(&text).or_else(|| {
        fs::read_to_string(&lcov)
            .ok()
            .and_then(|content| parse_lcov(&content))
    }) else {
        // Bun prints no table when it loaded no code to instrument: a suite of
        // type assertions covers nothing, which is not a failure. A suite that
        // never ran a single test is.
        if passed > 0 && failed == 0 {
            return unmeasured(target, passed, text, duration_ms);
        }
        return errored(target, "no test ran".to_string(), text, duration_ms);
    };

    measured(target, passed, failed, report, text, duration_ms)
}

/// Builds the coverage result for a suite that ran and reported real numbers:
/// a non-zero exit with every test green is the module's own coverage gate,
/// which this report states rather than repeats.
fn measured(
    target: &Target,
    passed: usize,
    failed: usize,
    report: CoverageReport,
    output: String,
    duration_ms: u64,
) -> ModuleCoverage {
    ModuleCoverage {
        name: target.name.clone(),
        label: target.label.clone(),
        dir: target.dir.clone(),
        status: if failed > 0 {
            RunStatus::Failed
        } else {
            RunStatus::Passed
        },
        passed,
        failed,
        lines: report.lines,
        functions: report.functions,
        files: report.files,
        duration_ms,
        output,
        cached: false,
    }
}

fn unmeasured(target: &Target, passed: usize, output: String, duration_ms: u64) -> ModuleCoverage {
    ModuleCoverage {
        name: target.name.clone(),
        label: target.label.clone(),
        dir: target.dir.clone(),
        status: RunStatus::Unmeasured,
        passed,
        failed: 0,
        lines: 0.0,
        functions: 0.0,
        files: Vec::new(),
        duration_ms,
        output,
        cached: false,
    }
}

fn errored(target: &Target, reason: String, output: String, duration_ms: u64) -> ModuleCoverage {
    ModuleCoverage {
        name: target.name.clone(),
        label: target.label.clone(),
        dir: target.dir.clone(),
        status: RunStatus::Errored(reason),
        passed: 0,
        failed: 0,
        lines: 0.0,
        functions: 0.0,
        files: Vec::new(),
        duration_ms,
        output,
        cached: false,
    }
}

/// The `coverageDir` a module's `bunfig.toml` declares, which wins over the
/// command line flag, or bun's default.
pub fn coverage_dir(dir: &Path) -> String {
    let Ok(content) = fs::read_to_string(dir.join("bunfig.toml")) else {
        return DEFAULT_COVERAGE_DIR.to_string();
    };
    content
        .lines()
        .find_map(|line| {
            let value = line.trim().strip_prefix("coverageDir")?.trim();
            let value = value.strip_prefix('=')?.trim();
            Some(value.trim_matches(['"', '\''].as_slice()).to_string())
        })
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_COVERAGE_DIR.to_string())
}
