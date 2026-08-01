//! `coverage:check` — run every module's test suite with coverage collection on,
//! then report what each module covers and which files pull it down.
//!
//! Bun already enforces `[test] coverageThreshold` from a module's `bunfig.toml`,
//! but only for the module it is run in: a workspace is audited one suite at a
//! time and the numbers never sit side by side. This command runs each suite,
//! reads the coverage table bun prints (falling back to the `lcov.info` a module
//! configures), and renders one report — modules ranked worst first, the files
//! under the threshold named with their uncovered lines, and the failing suites
//! called out separately from the merely under-covered ones.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::Instant;

use clap::Args;
use console::style;

use crate::commands::project_check::modules::{
    WorkspaceModule, discover_modules, filter_modules, wanted_names,
};
use crate::utils::{
    BAR_EMPTY, BAR_FILLED, IssueYaml, LOADER_WIDTH, Loader, LoaderGroup, error, format_duration,
    generate_issue_id, issue_to_yaml, success, warn,
};

/// Coverage a module is expected to reach, in percent, when `--threshold` says
/// nothing else.
const DEFAULT_THRESHOLD: f64 = 90.0;

/// How many under-covered files are named per module before the rest are
/// counted instead.
const MAX_LOW_FILES: usize = 8;

/// How much of a failing suite's output is echoed under `--logs`.
const LOG_TAIL_LINES: usize = 40;

/// Where bun writes its coverage files when `bunfig.toml` names no directory.
const DEFAULT_COVERAGE_DIR: &str = "coverage";

/// How many suites run at once when `--concurrency` says nothing else.
const MAX_CONCURRENCY: usize = 8;

#[derive(Args, Debug)]
pub struct CoverageCheckArgs {
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
}

/// Run every selected suite and return the coverage instead of printing it.
pub fn audit(
    root: &Path,
    modules: Option<&str>,
    packages: Option<&str>,
    threshold: Option<f64>,
    concurrency: Option<usize>,
) -> Result<CoverageAudit, String> {
    let targets = collect_targets(root, modules, packages);
    if targets.is_empty() {
        return Err(String::new());
    }

    Ok(CoverageAudit {
        modules: run_suites(targets, concurrency, &Loader::hidden()),
        threshold: threshold.unwrap_or(DEFAULT_THRESHOLD),
    })
}

pub fn run(args: &CoverageCheckArgs) {
    let root = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(crate::utils::current_dir);

    let threshold = args.threshold.unwrap_or(DEFAULT_THRESHOLD);
    let targets = collect_targets(&root, args.modules.as_deref(), args.packages.as_deref());
    if targets.is_empty() {
        warn("No module found to run — a module needs a package.json and a tests/ directory");
        return;
    }

    let runnable = targets
        .iter()
        .filter(|target| target.skip.is_none())
        .count();
    let started = Instant::now();
    let loader = if runnable > 0 {
        Loader::start(vec![LoaderGroup::new("Suites", runnable)])
    } else {
        Loader::hidden()
    };
    let modules = run_suites(targets, args.concurrency, &loader);
    loader.stop();

    let audit = CoverageAudit { modules, threshold };
    if args.issues {
        create_issues(&audit);
    } else {
        print_report(&audit, args.logs, started.elapsed().as_millis() as u64);
    }
}

// ---------------------------------------------------------------------------
// Module discovery
// ---------------------------------------------------------------------------

/// A workspace member the run knows how to handle, plus why it is being left
/// alone when it is not.
struct Target {
    name: String,
    label: String,
    dir: PathBuf,
    /// Present when the module carries no bun suite to run.
    skip: Option<String>,
}

fn collect_targets(root: &Path, modules: Option<&str>, packages: Option<&str>) -> Vec<Target> {
    let wanted = wanted_names(modules, packages);
    filter_modules(discover_modules(root), &wanted)
        .into_iter()
        .map(|module| {
            let skip = skip_reason(&module);
            Target {
                name: module.name.clone(),
                label: module.label(),
                dir: module.dir,
                skip,
            }
        })
        .collect()
}

/// Why a module holds no bun suite. Rust crates and Python distributions carry
/// their coverage in their own toolchains, and a module without a `tests/`
/// directory has nothing to measure.
fn skip_reason(module: &WorkspaceModule) -> Option<String> {
    // A crate keeps its tests in cargo even when a `package.json` wraps the
    // cargo commands, so `bun test` would find nothing to run.
    if module.is_rust() {
        return Some("rust crate".to_string());
    }
    if module.is_python_only() {
        return Some("python package".to_string());
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

/// Run every runnable target, at most `concurrency` at a time, and report the
/// modules sorted worst first.
fn run_suites(
    targets: Vec<Target>,
    concurrency: Option<usize>,
    loader: &Loader,
) -> Vec<ModuleCoverage> {
    let workers = resolve_concurrency(concurrency).min(targets.len().max(1));
    let queue = Mutex::new(targets.into_iter().enumerate().collect::<Vec<_>>());
    let results: Mutex<Vec<(usize, ModuleCoverage)>> = Mutex::new(Vec::new());

    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| {
                loop {
                    let Some((index, target)) =
                        queue.lock().expect("the queue is not poisoned").pop()
                    else {
                        return;
                    };
                    let coverage = match &target.skip {
                        Some(reason) => skipped_module(&target, reason.clone()),
                        None => {
                            loader.entered(0, target.label.clone());
                            let coverage = run_suite(&target);
                            loader.left(0, &target.label);
                            coverage
                        }
                    };
                    results
                        .lock()
                        .expect("the results are not poisoned")
                        .push((index, coverage));
                }
            });
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

fn resolve_concurrency(requested: Option<usize>) -> usize {
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
fn sort_modules(modules: &mut [ModuleCoverage]) {
    modules.sort_by(|a, b| {
        rank(&a.status)
            .cmp(&rank(&b.status))
            .then_with(|| a.lines.total_cmp(&b.lines))
            .then_with(|| a.functions.total_cmp(&b.functions))
            .then_with(|| a.label.cmp(&b.label))
    });
}

fn rank(status: &RunStatus) -> u8 {
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
    }
}

/// Run one module's suite under `bun test --coverage` and read what it printed.
fn run_suite(target: &Target) -> ModuleCoverage {
    let started = Instant::now();
    let coverage_dir = target.dir.join(coverage_dir(&target.dir));
    // A stale report from an earlier run must never be read as this one's.
    let lcov = coverage_dir.join("lcov.info");
    let _ = fs::remove_file(&lcov);

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

    ModuleCoverage {
        name: target.name.clone(),
        label: target.label.clone(),
        dir: target.dir.clone(),
        // A non-zero exit with every test green is bun enforcing the module's
        // own `coverageThreshold`, which this report states rather than repeats.
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
        output: text,
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
    }
}

/// The `coverageDir` a module's `bunfig.toml` declares, which wins over the
/// command line flag, or bun's default.
fn coverage_dir(dir: &Path) -> String {
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

// ---------------------------------------------------------------------------
// Report parsing
// ---------------------------------------------------------------------------

/// What one suite covers, whichever reporter it was read from.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct CoverageReport {
    pub lines: f64,
    pub functions: f64,
    pub files: Vec<FileCoverage>,
}

impl PartialEq for FileCoverage {
    fn eq(&self, other: &Self) -> bool {
        self.path == other.path
            && self.lines == other.lines
            && self.functions == other.functions
            && self.uncovered == other.uncovered
    }
}

/// How many tests passed and failed, read from bun's `12 pass` / `1 fail` tally.
pub fn parse_counts(text: &str) -> (usize, usize) {
    let (mut passed, mut failed) = (0usize, 0usize);
    for line in text.lines() {
        let mut parts = line.split_whitespace();
        let (Some(count), Some(word)) = (parts.next(), parts.next()) else {
            continue;
        };
        // `93 expect() calls` counts assertions, not tests.
        if parts.next().is_some() {
            continue;
        }
        let Ok(count) = count.parse::<usize>() else {
            continue;
        };
        match word {
            "pass" => passed += count,
            "fail" => failed += count,
            _ => {}
        }
    }
    (passed, failed)
}

/// The table `bun test --coverage` prints:
///
/// ```text
/// File              | % Funcs | % Lines | Uncovered Line #s
/// All files         |   83.33 |   99.61 |
///  src/decompose.ts |  100.00 |   97.64 | 152-154
/// ```
pub fn parse_table(text: &str) -> Option<CoverageReport> {
    let mut total: Option<(f64, f64)> = None;
    let mut files: Vec<FileCoverage> = Vec::new();

    for line in text.lines() {
        let trimmed = line.trim();
        if !trimmed.contains('|') || trimmed.starts_with('-') {
            continue;
        }
        let cells: Vec<&str> = trimmed.split('|').map(str::trim).collect();
        if cells.len() < 3 {
            continue;
        }
        let (Ok(functions), Ok(lines)) = (cells[1].parse::<f64>(), cells[2].parse::<f64>()) else {
            continue;
        };
        if cells[0] == "All files" {
            total = Some((lines, functions));
            continue;
        }
        files.push(FileCoverage {
            path: cells[0].to_string(),
            lines,
            functions,
            uncovered: parse_uncovered(cells.get(3).copied().unwrap_or_default()),
        });
    }

    total.map(|(lines, functions)| CoverageReport {
        lines,
        functions,
        files,
    })
}

/// `152-154, 160` — bun's own ranges, kept as it wrote them.
fn parse_uncovered(cell: &str) -> Vec<String> {
    cell.split(',')
        .map(str::trim)
        .filter(|range| !range.is_empty())
        .map(str::to_string)
        .collect()
}

/// An `lcov.info`, for a module whose reporter writes nothing to the terminal.
pub fn parse_lcov(content: &str) -> Option<CoverageReport> {
    let mut files: Vec<FileCoverage> = Vec::new();
    let mut path = String::new();
    let mut hits: BTreeMap<usize, usize> = BTreeMap::new();
    let (mut functions_total, mut functions_hit) = (0usize, 0usize);
    let (mut total_lines, mut covered_lines) = (0usize, 0usize);
    let (mut total_functions, mut covered_functions) = (0usize, 0usize);

    for line in content.lines() {
        let line = line.trim();
        if let Some(value) = line.strip_prefix("SF:") {
            path = value.to_string();
        } else if let Some(value) = line.strip_prefix("DA:") {
            let mut parts = value.split(',');
            let (Some(number), Some(count)) = (parts.next(), parts.next()) else {
                continue;
            };
            if let (Ok(number), Ok(count)) = (number.parse::<usize>(), count.parse::<usize>()) {
                hits.insert(number, count);
            }
        } else if let Some(value) = line.strip_prefix("FNF:") {
            functions_total = value.parse().unwrap_or(0);
        } else if let Some(value) = line.strip_prefix("FNH:") {
            functions_hit = value.parse().unwrap_or(0);
        } else if line == "end_of_record" {
            if path.is_empty() {
                continue;
            }
            let covered = hits.values().filter(|count| **count > 0).count();
            let uncovered: Vec<usize> = hits
                .iter()
                .filter(|(_, count)| **count == 0)
                .map(|(number, _)| *number)
                .collect();

            total_lines += hits.len();
            covered_lines += covered;
            total_functions += functions_total;
            covered_functions += functions_hit;

            files.push(FileCoverage {
                path: std::mem::take(&mut path),
                lines: percent(covered, hits.len()),
                functions: percent(functions_hit, functions_total),
                uncovered: collapse_ranges(&uncovered),
            });
            hits.clear();
            functions_total = 0;
            functions_hit = 0;
        }
    }

    if files.is_empty() {
        return None;
    }
    Some(CoverageReport {
        lines: percent(covered_lines, total_lines),
        functions: percent(covered_functions, total_functions),
        files,
    })
}

/// `41 42 43 66` → `41-43`, `66`.
fn collapse_ranges(numbers: &[usize]) -> Vec<String> {
    let mut ranges: Vec<String> = Vec::new();
    let mut index = 0usize;
    while index < numbers.len() {
        let start = numbers[index];
        let mut end = start;
        while index + 1 < numbers.len() && numbers[index + 1] == end + 1 {
            index += 1;
            end = numbers[index];
        }
        ranges.push(if start == end {
            start.to_string()
        } else {
            format!("{start}-{end}")
        });
        index += 1;
    }
    ranges
}

/// A ratio in percent. Nothing to cover is fully covered.
fn percent(covered: usize, total: usize) -> f64 {
    if total == 0 {
        return 100.0;
    }
    covered as f64 * 100.0 / total as f64
}

fn mean(values: impl Iterator<Item = f64>) -> f64 {
    let values: Vec<f64> = values.collect();
    if values.is_empty() {
        return 0.0;
    }
    values.iter().sum::<f64>() / values.len() as f64
}

// ---------------------------------------------------------------------------
// Report output
// ---------------------------------------------------------------------------

fn print_report(audit: &CoverageAudit, logs: bool, elapsed_ms: u64) {
    let ran = audit.ran();
    let skipped = audit
        .modules
        .iter()
        .filter(|module| matches!(module.status, RunStatus::Skipped(_)))
        .count();

    let mut scope: Vec<String> = vec![format!(
        "{} module{}",
        ran.len(),
        if ran.len() == 1 { "" } else { "s" }
    )];
    let tests = audit.tests();
    scope.push(format!("{tests} test{}", if tests == 1 { "" } else { "s" }));
    scope.push(format!("threshold {}%", trim_percent(audit.threshold)));
    scope.push(format_duration(elapsed_ms));

    println!(
        "{}{}",
        style("▸ Coverage report").magenta().bold(),
        style(format!("  {}", scope.join(" · "))).dim()
    );

    if ran.is_empty() {
        println!();
        warn(format!(
            "No suite ran — {skipped} module{} carry no bun tests",
            if skipped == 1 { "" } else { "s" }
        ));
        return;
    }

    print_rows(audit, &ran);
    print_low_files(audit);
    print_failures(audit, logs);
    println!();
    print_summary(audit, skipped);
}

/// One row per module: status, a line-coverage bar, both rates, and its tests.
fn print_rows(audit: &CoverageAudit, ran: &[&ModuleCoverage]) {
    let width = ran
        .iter()
        .map(|module| module.label.chars().count())
        .max()
        .unwrap_or(0);

    println!();
    println!(
        "  {}  {}  {}  {}  {}",
        style(format!("{:<width$}", "Module")).dim(),
        style(format!("{:<LOADER_WIDTH$}", "")).dim(),
        style(format!("{:>7}", "Lines")).dim(),
        style(format!("{:>7}", "Funcs")).dim(),
        style("Tests").dim()
    );

    for module in ran {
        let passed = style(format!("{} passed", module.passed)).dim().to_string();
        let (icon, tests) = match &module.status {
            RunStatus::Failed => (
                style("✖").red().bold().to_string(),
                style(format!("{} failed", module.failed)).red().to_string(),
            ),
            RunStatus::Unmeasured => (style("·").dim().to_string(), passed),
            _ if module.is_covered(audit.threshold) => {
                (style("✔").green().bold().to_string(), passed)
            }
            _ => (style("⚠").yellow().bold().to_string(), passed),
        };

        // A module bun measured nothing in carries no rate to draw — saying so
        // is truer than printing a 0% it never earned.
        if module.status == RunStatus::Unmeasured {
            // The bar and both rate columns, so the tests column stays aligned.
            let span = LOADER_WIDTH + 18;
            println!(
                "{icon} {}  {}  {tests}",
                style(format!("{:<width$}", module.label)).bold(),
                style(format!("{:<span$}", "no code measured")).dim(),
            );
            continue;
        }

        println!(
            "{icon} {}  {}  {}  {}  {}",
            style(format!("{:<width$}", module.label)).bold(),
            bar(module.lines, audit.threshold),
            rate(module.lines, audit.threshold),
            rate(module.functions, audit.threshold),
            tests
        );
    }

    for module in &audit.modules {
        let RunStatus::Errored(reason) = &module.status else {
            continue;
        };
        println!(
            "{} {}  {}",
            style("✖").red().bold(),
            style(format!("{:<width$}", module.label)).bold(),
            style(reason).red()
        );
    }
}

/// Under every module that misses the threshold, the files that put it there.
fn print_low_files(audit: &CoverageAudit) {
    let under = audit.under();
    if under.is_empty() {
        return;
    }

    println!();
    println!(
        "{}",
        style(format!("Under {}%", trim_percent(audit.threshold)))
            .yellow()
            .bold()
    );

    for module in under {
        let files = module.low_files(audit.threshold);
        println!();
        println!(
            "{}  {}",
            style(&module.label).bold().underlined(),
            style(format!(
                "{}% lines · {}% functions",
                trim_percent(module.lines),
                trim_percent(module.functions)
            ))
            .dim()
        );

        if files.is_empty() {
            println!(
                "  {}",
                style("every file clears the threshold — the module average does not").dim()
            );
            continue;
        }

        let width = files
            .iter()
            .take(MAX_LOW_FILES)
            .map(|file| file.path.chars().count())
            .max()
            .unwrap_or(0);

        for file in files.iter().take(MAX_LOW_FILES) {
            let mut line = format!(
                "  {}  {}  {}",
                style(format!("{:<width$}", file.path)).cyan(),
                rate(file.lines, audit.threshold),
                rate(file.functions, audit.threshold)
            );
            if !file.uncovered.is_empty() {
                line.push_str(&format!(
                    "  {}",
                    style(format!(
                        "uncovered {}",
                        truncate(&file.uncovered.join(", "), 60)
                    ))
                    .dim()
                ));
            }
            println!("{line}");
        }

        let hidden = files.len().saturating_sub(MAX_LOW_FILES);
        if hidden > 0 {
            println!(
                "  {}",
                style(format!(
                    "+{hidden} more file{}",
                    if hidden == 1 { "" } else { "s" }
                ))
                .dim()
            );
        }
    }
}

/// The suites that failed, with their output under `--logs`.
fn print_failures(audit: &CoverageAudit, logs: bool) {
    let broken = audit.broken();
    if broken.is_empty() {
        return;
    }

    println!();
    println!("{}", style("Failing suites").red().bold());
    for module in broken {
        let detail = match &module.status {
            RunStatus::Errored(reason) => reason.clone(),
            _ => format!(
                "{} failed, {} passed in {}",
                module.failed,
                module.passed,
                format_duration(module.duration_ms)
            ),
        };
        println!();
        println!(
            "{}  {}",
            style(&module.label).bold().underlined(),
            style(detail).red()
        );

        if !logs {
            println!("  {}", style("re-run with --logs to see the output").dim());
            continue;
        }
        for line in tail(&module.output, LOG_TAIL_LINES) {
            println!("  {}", style(line).dim());
        }
    }
}

fn print_summary(audit: &CoverageAudit, skipped: usize) {
    let measured = audit.measured().len();
    let unmeasured = audit.ran().len() - measured;
    let broken = audit.broken().len();
    let under = audit.under().len();

    let mut parts = vec![format!(
        "{}% lines, {}% functions across {measured} module{}",
        trim_percent(audit.lines()),
        trim_percent(audit.functions()),
        if measured == 1 { "" } else { "s" }
    )];
    if unmeasured > 0 {
        parts.push(format!("{unmeasured} with no code to measure"));
    }
    if skipped > 0 {
        parts.push(format!("{skipped} skipped"));
    }
    let detail = parts.join(" · ");

    if broken == 0 && under == 0 {
        success(format!(
            "Every module clears {}% — {detail}",
            trim_percent(audit.threshold)
        ));
        return;
    }

    let mut issues: Vec<String> = Vec::new();
    if broken > 0 {
        issues.push(format!(
            "{broken} suite{} failing",
            if broken == 1 { "" } else { "s" }
        ));
    }
    if under > 0 {
        issues.push(format!(
            "{under} module{} under {}%",
            if under == 1 { "" } else { "s" },
            trim_percent(audit.threshold)
        ));
    }

    println!(
        "{} {}",
        style("✖").red().bold(),
        style(format!("{} — {detail}", issues.join(", "))).red()
    );
}

/// `▰▰▰▰▰▰▰▰▰▱▱▱` — the same bar the loaders draw, coloured by how far the rate
/// is from the threshold.
fn bar(value: f64, threshold: f64) -> String {
    let filled = ((value / 100.0) * LOADER_WIDTH as f64).round() as usize;
    let filled = filled.min(LOADER_WIDTH);
    let drawn = BAR_FILLED.repeat(filled);
    let empty = style(BAR_EMPTY.repeat(LOADER_WIDTH - filled)).dim();
    let drawn = if value >= threshold {
        style(drawn).green()
    } else if value >= threshold - 15.0 {
        style(drawn).yellow()
    } else {
        style(drawn).red()
    };
    format!("{drawn}{empty}")
}

fn rate(value: f64, threshold: f64) -> String {
    let text = format!("{:>6}%", trim_percent(value));
    if value >= threshold {
        style(text).green().to_string()
    } else if value >= threshold - 15.0 {
        style(text).yellow().to_string()
    } else {
        style(text).red().to_string()
    }
}

/// `92.0` reads as noise next to `92`, so a whole percent is printed whole.
fn trim_percent(value: f64) -> String {
    if (value - value.round()).abs() < 0.05 {
        return format!("{}", value.round() as i64);
    }
    format!("{value:.1}")
}

fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let truncated: String = text.chars().take(max.saturating_sub(1)).collect();
    format!("{}…", truncated.trim_end())
}

fn tail(output: &str, lines: usize) -> Vec<&str> {
    let all: Vec<&str> = output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    let start = all.len().saturating_sub(lines);
    all[start..].to_vec()
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

fn create_issues(audit: &CoverageAudit) {
    let mut targets = audit.broken();
    targets.extend(audit.under());

    if targets.is_empty() {
        success(format!(
            "Every module clears {}% — no issues created",
            trim_percent(audit.threshold)
        ));
        return;
    }

    let mut created = 0usize;
    for module in targets {
        let issues_dir = module.dir.join("issues");
        if let Err(err) = fs::create_dir_all(&issues_dir) {
            error(format!("Failed to create {}: {err}", issues_dir.display()));
            continue;
        }

        let id = generate_issue_id(Some(&issues_dir));
        let yaml = issue_to_yaml(&IssueYaml {
            id: Some(id.clone()),
            module: Some(module.name.clone()),
            title: Some(build_issue_title(module, audit.threshold)),
            state: Some("Todo".to_string()),
            priority: Some(priority(module, audit.threshold).to_string()),
            description: Some(build_issue_description(module, audit.threshold)),
            labels: Some(vec![label(module).to_string()]),
        });

        let file_path = issues_dir.join(format!("{id}.yml"));
        if let Err(err) = fs::write(&file_path, yaml) {
            error(format!("Failed to write {}: {err}", file_path.display()));
            continue;
        }
        created += 1;
        success(format!("{} created", file_path.display()));
    }

    println!();
    success(format!(
        "{created} coverage issue{} created",
        if created == 1 { "" } else { "s" }
    ));
}

/// The change-type label the work carries: a red suite is a bug, a thin one is
/// testing work.
fn label(module: &ModuleCoverage) -> &'static str {
    match &module.status {
        RunStatus::Failed | RunStatus::Errored(_) => "Bug",
        _ => "Testing",
    }
}

/// How urgent the gap is: a failing suite blocks every other fix, and the wider
/// the gap the sooner it has to close.
fn priority(module: &ModuleCoverage, threshold: f64) -> &'static str {
    match &module.status {
        RunStatus::Failed | RunStatus::Errored(_) => "Urgent",
        _ if module.lines < threshold - 25.0 => "High",
        _ => "Medium",
    }
}

fn build_issue_title(module: &ModuleCoverage, threshold: f64) -> String {
    match &module.status {
        RunStatus::Failed => format!(
            "Fix {} failing test{} in {}",
            module.failed,
            if module.failed == 1 { "" } else { "s" },
            module.name
        ),
        RunStatus::Errored(reason) => {
            format!("Fix the {} test suite ({reason})", module.name)
        }
        _ => format!(
            "Raise {} test coverage to {}% (currently {}% lines, {}% functions)",
            module.name,
            trim_percent(threshold),
            trim_percent(module.lines),
            trim_percent(module.functions)
        ),
    }
}

fn build_issue_description(module: &ModuleCoverage, threshold: f64) -> String {
    let mut lines: Vec<String> = Vec::new();

    match &module.status {
        RunStatus::Failed => lines.push(format!(
            "`bun test` reports {} failing test{} in {}.",
            module.failed,
            if module.failed == 1 { "" } else { "s" },
            module.label
        )),
        RunStatus::Errored(reason) => lines.push(format!(
            "`bun test --coverage` could not report coverage for {}: {reason}.",
            module.label
        )),
        _ => lines.push(format!(
            "{} covers {}% of its lines and {}% of its functions, under the {}% threshold.",
            module.label,
            trim_percent(module.lines),
            trim_percent(module.functions),
            trim_percent(threshold)
        )),
    }

    lines.push(String::new());
    lines.push(format!("- Module: {}", module.label));
    lines.push(format!("- Line coverage: {}%", trim_percent(module.lines)));
    lines.push(format!(
        "- Function coverage: {}%",
        trim_percent(module.functions)
    ));
    lines.push(format!("- Threshold: {}%", trim_percent(threshold)));
    lines.push(format!(
        "- Tests: {} passed, {} failed",
        module.passed, module.failed
    ));
    lines.push(format!(
        "- Command: `talos coverage:check --modules={}`",
        module.name
    ));

    let low = module.low_files(threshold);
    if !low.is_empty() {
        lines.push(String::new());
        lines.push("Least covered files:".to_string());
        for file in low.iter().take(MAX_LOW_FILES) {
            let mut entry = format!(
                "- `{}` — {}% lines, {}% functions",
                file.path,
                trim_percent(file.lines),
                trim_percent(file.functions)
            );
            if !file.uncovered.is_empty() {
                entry.push_str(&format!(" (uncovered {})", file.uncovered.join(", ")));
            }
            lines.push(entry);
        }
    }

    lines.join("\n")
}
