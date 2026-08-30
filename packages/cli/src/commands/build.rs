// `build` — compile every package/module the workspace declares a `build`
// script for, in dependency order, skipping anything a prior run already
// built from the same inputs.
//
// This does not go through `run --commands=<x>`, the general multi-command
// scheduler: a build only ever runs one script, only ever needs to run in
// dependency order (a package must build before whatever imports it does),
// and only ever answers one caching question — "does this target's output
// already match its current sources?" So it keeps its own answer to that
// question instead of borrowing the shared workspace cache: entries live
// under `var/cache/build`, fingerprinted the same way, but stored and read
// independently of it. See [`cache`].
//
// Dependency order is a constraint on pairs of targets, not on the run as a
// whole: two targets that do not depend on each other have no reason to wait
// for one another, so a target builds as soon as everything it imports has —
// see [`run_builds`]. `--output` leaves the same report behind as a file, for
// an agent to fix what it lists. See [`output`].

#[path = "build/cache.rs"]
mod cache;
#[path = "build/output.rs"]
mod output;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::mpsc::channel;
use std::time::Instant;

use clap::Args;
use console::style;

use crate::utils::{
    FileHashCache, FingerprintMemo, Loader, LoaderGroup, OutputFormat, Spinner, TargetType,
    WorkspaceTarget, announce_agent_report, current_dir, discover_targets, error,
    fingerprint_target, format_duration, hash_root_inputs, is_git_workspace_root,
    sort_targets_by_dependencies, split_csv, success, warn, write_agent_report,
};

/// How many lines a failed target's output shows before it is truncated.
const LOG_TAIL_LINES: usize = 40;

/// How many targets build at once, when the machine has the cores for it.
const MAX_CONCURRENCY: usize = 8;

#[derive(Args, Debug)]
pub struct BuildArgs {
    #[arg(long)]
    pub packages: Option<String>,
    #[arg(long)]
    pub modules: Option<String>,
    #[arg(long, default_value_t = false)]
    pub logs: bool,
    #[arg(long, default_value_t = false)]
    pub no_cache: bool,
    /// Also write the report to var/outputs/talos_build.md or
    /// var/outputs/talos_build.json, in the shape an AI agent is handed to fix
    /// what it lists.
    #[arg(long, value_enum)]
    pub output: Option<OutputFormat>,
    #[arg(long)]
    pub cwd: Option<String>,
}

/// How one target's build ended.
#[derive(Clone, Debug, PartialEq, Eq)]
enum BuildStatus {
    Passed,
    Failed,
}

/// One target's build: how it ended, how long it took, and what it printed.
struct TargetBuild {
    /// `alpha:build` — how the target is named in a report line.
    label: String,
    /// `alpha` — the target's own name, for a selector that re-runs it alone.
    name: String,
    /// `packages/alpha` — where it lives, relative to the workspace root.
    key: String,
    /// `--packages=alpha` — what selects this target and nothing else.
    selector: String,
    status: BuildStatus,
    duration_ms: u64,
    output: String,
    cached: bool,
}

pub fn run(args: &BuildArgs) {
    if !execute(args) {
        std::process::exit(1);
    }
}

/// Discovers the workspace and fingerprints its root inputs in parallel.
fn load_build_state(root_dir: &std::path::Path) -> (Vec<WorkspaceTarget>, String, bool) {
    std::thread::scope(|scope| {
        let targets_handle = scope.spawn(|| discover_targets(root_dir));
        let root_hash_handle = scope.spawn(|| hash_root_inputs(root_dir));
        let use_git_handle = scope.spawn(|| is_git_workspace_root(root_dir));

        let all_targets = targets_handle
            .join()
            .unwrap_or_else(|_| discover_targets(root_dir));
        let root_hash = root_hash_handle
            .join()
            .unwrap_or_else(|_| hash_root_inputs(root_dir));
        let use_git = use_git_handle
            .join()
            .unwrap_or_else(|_| is_git_workspace_root(root_dir));

        (all_targets, root_hash, use_git)
    })
}

pub fn execute(args: &BuildArgs) -> bool {
    let root_dir = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);

    // Fingerprinting only earns its own walk when the run could spare a
    // build off it, and it is the one stretch before the loader where
    // nothing is printed, so it gets a spinner of its own — same as lint's
    // workspace fingerprint.
    let spinner = Spinner::start("Fingerprinting the workspace...");
    let (all_targets, root_hash, use_git) = load_build_state(&root_dir);
    spinner.stop();

    let Some(selected) = filter_targets(
        &all_targets,
        args.packages.as_deref(),
        args.modules.as_deref(),
    ) else {
        return false;
    };
    if selected.is_empty() {
        error("No packages or modules found to run");
        return false;
    }

    let buildable: Vec<WorkspaceTarget> = sort_targets_by_dependencies(&selected)
        .into_iter()
        .filter(|target| target.scripts.contains_key("build"))
        .collect();

    if buildable.is_empty() {
        warn("No target declares a build script");
        return true;
    }

    let file_hash_cache = FileHashCache::new();
    let fingerprint_memo = FingerprintMemo::new();
    let started_at = Instant::now();

    let loader = Loader::start(vec![LoaderGroup::new("Build", buildable.len())]);
    let jobs = plan(&buildable);
    let results = run_builds(
        &jobs,
        BuildContext {
            root_dir: &root_dir,
            all_targets: &all_targets,
            root_hash: &root_hash,
            fingerprint_memo: &fingerprint_memo,
            use_git,
            no_cache: args.no_cache,
            file_hash_cache: &file_hash_cache,
            loader: &loader,
        },
    );
    loader.stop();

    let cached = results.iter().filter(|result| result.cached).count();
    let ran = results
        .iter()
        .filter(|result| !result.cached && result.status == BuildStatus::Passed)
        .count();
    let any_failed = results
        .iter()
        .any(|result| result.status == BuildStatus::Failed);
    let elapsed_ms = started_at.elapsed().as_millis() as u64;

    print_report(&results, args.logs, elapsed_ms, ran, cached);

    // The file is written after the report and never instead of it: whatever
    // it does, the terminal has already said the same thing.
    if let Some(format) = args.output {
        let report = output::report(args, &results, elapsed_ms, ran, cached);
        announce_agent_report(write_agent_report(&root_dir, format, &report));
    }

    !any_failed
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

/// One target's place in the run: what to build, and which of the other jobs
/// have to be built first.
struct Job<'a> {
    target: &'a WorkspaceTarget,
    label: String,
    /// Indices into the job list, so a dependency is checked by position
    /// rather than looked up by key every time the scheduler picks work.
    deps: Vec<usize>,
}

/// Everything a job needs beyond itself, bundled so the scheduler can hand
/// one copy to every worker instead of threading eight parameters through.
#[derive(Clone, Copy)]
struct BuildContext<'a> {
    root_dir: &'a Path,
    all_targets: &'a [WorkspaceTarget],
    root_hash: &'a str,
    fingerprint_memo: &'a FingerprintMemo,
    use_git: bool,
    no_cache: bool,
    file_hash_cache: &'a FileHashCache,
    loader: &'a Loader,
}

/// Turn the ordered targets into jobs, resolving each one's declared
/// workspace dependencies to the jobs that will produce them.
///
/// Only direct dependencies are recorded: a job whose dependency waits on
/// something else is held back by that job in turn, so the transitive order
/// falls out of the graph without being spelled out.
fn plan(buildable: &[WorkspaceTarget]) -> Vec<Job<'_>> {
    let index: HashMap<&str, usize> = buildable
        .iter()
        .enumerate()
        .map(|(position, target)| (target.key.as_str(), position))
        .collect();

    buildable
        .iter()
        .map(|target| Job {
            target,
            label: format!("{}:build", target.name),
            deps: target
                .workspace_deps
                .iter()
                .filter_map(|key| index.get(key.as_str()).copied())
                .collect(),
        })
        .collect()
}

fn concurrency(jobs: usize) -> usize {
    std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(1)
        .clamp(1, MAX_CONCURRENCY)
        .min(jobs.max(1))
}

/// Build every job, as many at a time as the machine has cores for, and
/// report them in the order they were planned.
///
/// A job starts the moment everything it imports has been built, so an
/// unrelated pair never waits on each other. A failure stops the run from
/// starting anything new — the jobs already in flight are still collected,
/// since their output is as much a part of the report as the failure is, and
/// everything that was waiting on the broken target is simply never built.
fn run_builds(jobs: &[Job], ctx: BuildContext) -> Vec<TargetBuild> {
    let limit = concurrency(jobs.len());
    let mut built = vec![false; jobs.len()];
    let mut launched = vec![false; jobs.len()];
    let mut results: Vec<Option<TargetBuild>> = (0..jobs.len()).map(|_| None).collect();
    let mut failed = false;

    std::thread::scope(|scope| {
        let (tx, rx) = channel::<(usize, TargetBuild)>();
        let mut inflight = 0usize;

        loop {
            while !failed && inflight < limit {
                let next = (0..jobs.len()).find(|&index| {
                    !launched[index] && jobs[index].deps.iter().all(|&dep| built[dep])
                });
                let Some(index) = next else { break };

                launched[index] = true;
                inflight += 1;
                let job = &jobs[index];
                let tx = tx.clone();
                scope.spawn(move || {
                    let _ = tx.send((index, build_job(job, ctx)));
                });
            }

            if inflight == 0 {
                break;
            }

            let Ok((index, build)) = rx.recv() else {
                failed = true;
                break;
            };
            inflight -= 1;
            built[index] = build.status == BuildStatus::Passed;
            failed |= build.status == BuildStatus::Failed;
            results[index] = Some(build);
        }
    });

    results.into_iter().flatten().collect()
}

/// One job's build: replayed from the cache when the target's inputs have not
/// moved since it last built, run otherwise.
fn build_job(job: &Job, ctx: BuildContext) -> TargetBuild {
    let target = job.target;
    let hash = build_hash(
        target,
        ctx.all_targets,
        ctx.root_hash,
        ctx.fingerprint_memo,
        ctx.use_git,
        ctx.file_hash_cache,
    );

    if !ctx.no_cache
        && let Some(entry) = cache::read(ctx.root_dir, &target.key)
        && entry.matches(&target.key, &hash)
    {
        // A cache hit is not work in flight, so it is counted rather than
        // named as running.
        ctx.loader.advance(0);
        return result(job, BuildStatus::Passed, 0, String::new(), true);
    }

    ctx.loader.entered(0, job.label.clone());
    let (success_flag, output, duration_ms) = run_build(target);
    ctx.loader.left(0, &job.label);

    if success_flag {
        if !ctx.no_cache {
            cache::write(ctx.root_dir, &target.key, &hash, duration_ms, &output);
        }
        return result(job, BuildStatus::Passed, duration_ms, output, false);
    }
    result(job, BuildStatus::Failed, duration_ms, output, false)
}

fn result(
    job: &Job,
    status: BuildStatus,
    duration_ms: u64,
    output: String,
    cached: bool,
) -> TargetBuild {
    TargetBuild {
        label: job.label.clone(),
        name: job.target.name.clone(),
        key: job.target.key.clone(),
        selector: format!("--{}s={}", job.target.target_type.as_str(), job.target.name),
        status,
        duration_ms,
        output,
        cached,
    }
}

/// Resolves `--packages`/`--modules` into the targets they name, or `None`
/// (after reporting the offender) when one names something that does not
/// exist.
fn filter_targets(
    targets: &[WorkspaceTarget],
    packages: Option<&str>,
    modules: Option<&str>,
) -> Option<Vec<WorkspaceTarget>> {
    if packages.is_none() && modules.is_none() {
        return Some(targets.to_vec());
    }

    let mut wanted: Vec<(TargetType, String)> = Vec::new();
    wanted.extend(
        split_csv(packages)
            .into_iter()
            .map(|name| (TargetType::Package, name)),
    );
    wanted.extend(
        split_csv(modules)
            .into_iter()
            .map(|name| (TargetType::Module, name)),
    );

    let mut selected = Vec::new();
    for (target_type, name) in wanted {
        let Some(target) = targets
            .iter()
            .find(|t| t.target_type == target_type && t.name == name)
        else {
            error(format!(
                "No {} named \"{name}\" found",
                target_type.as_str()
            ));
            return None;
        };
        selected.push(target.clone());
    }
    Some(selected)
}

/// Everything reachable from a target's declared workspace dependencies,
/// itself excluded. Walked once, so a dependency cycle cannot loop forever.
fn transitive_deps<'a>(
    target: &WorkspaceTarget,
    by_key: &HashMap<&str, &'a WorkspaceTarget>,
) -> Vec<&'a WorkspaceTarget> {
    let mut seen: HashSet<String> = HashSet::from([target.key.clone()]);
    let mut queue: Vec<String> = target.workspace_deps.clone();
    let mut deps = Vec::new();

    while let Some(key) = queue.pop() {
        if seen.contains(&key) {
            continue;
        }
        seen.insert(key.clone());
        if let Some(dep) = by_key.get(key.as_str()) {
            deps.push(*dep);
            queue.extend(dep.workspace_deps.clone());
        }
    }

    deps
}

/// The fingerprint a build's cache entry is keyed on: the root inputs, the
/// target's own sources, its build script, and every workspace dependency it
/// pulls in transitively — so an edit to a dependency invalidates the targets
/// built on top of it just as much as an edit to the target itself does.
fn build_hash(
    target: &WorkspaceTarget,
    all_targets: &[WorkspaceTarget],
    root_hash: &str,
    memo: &FingerprintMemo,
    use_git: bool,
    file_hash_cache: &FileHashCache,
) -> String {
    let by_key: HashMap<&str, &WorkspaceTarget> =
        all_targets.iter().map(|t| (t.key.as_str(), t)).collect();
    let deps = transitive_deps(target, &by_key);
    let mut dep_lines: Vec<String> = deps
        .iter()
        .map(|dep| {
            format!(
                "{}={}",
                dep.key,
                fingerprint_target(dep, memo, use_git, file_hash_cache)
            )
        })
        .collect();
    dep_lines.sort();

    let self_fingerprint = fingerprint_target(target, memo, use_git, file_hash_cache);
    let script = target.scripts.get("build").cloned().unwrap_or_default();

    let mut lines = vec![
        format!("version={}", cache::VERSION),
        format!("target={}", target.key),
        format!("script={script}"),
        format!("root={root_hash}"),
        format!("self={self_fingerprint}"),
    ];
    lines.extend(dep_lines);

    let mut hasher = blake3::Hasher::new();
    hasher.update(lines.join("\n").as_bytes());
    hasher.finalize().to_hex().to_string()
}

/// `bun run build` for a target with a `package.json`; its own `build`
/// script split into argv when it has none (a bare Rust crate or Python
/// package built from the language defaults).
fn build_argv(target: &WorkspaceTarget) -> Vec<String> {
    if !target.direct_scripts {
        return vec!["bun".to_string(), "run".to_string(), "build".to_string()];
    }
    target
        .scripts
        .get("build")
        .map(|script| script.split_whitespace().map(str::to_string).collect())
        .unwrap_or_default()
}

fn run_build(target: &WorkspaceTarget) -> (bool, String, u64) {
    let argv = build_argv(target);
    let started = Instant::now();
    let Some((bin, rest)) = argv.split_first() else {
        return (false, "no build script declared".to_string(), 0);
    };

    let result = Command::new(bin)
        .args(rest)
        .current_dir(&target.dir)
        .output();
    let duration_ms = started.elapsed().as_millis() as u64;
    match result {
        Ok(output) => (
            output.status.success(),
            format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            ),
            duration_ms,
        ),
        Err(err) => (false, err.to_string(), duration_ms),
    }
}

/// Print the build results — one row per target and the output of every one
/// that failed, laid out the same way `lint`'s report is.
fn print_report(results: &[TargetBuild], logs: bool, elapsed_ms: u64, ran: usize, cached: usize) {
    let scope = format!(
        "{} target{} · {}",
        results.len(),
        if results.len() == 1 { "" } else { "s" },
        format_duration(elapsed_ms)
    );

    println!();
    println!(
        "{}{}",
        style("▸ Build report").magenta().bold(),
        style(format!("  {scope}")).dim()
    );

    print_rows(results);
    print_failures(results, logs);
    println!();
    print_summary(results, ran, cached);
}

fn print_rows(results: &[TargetBuild]) {
    if results.is_empty() {
        return;
    }

    let width = results
        .iter()
        .map(|result| result.label.chars().count())
        .max()
        .unwrap_or(0);

    println!();
    for result in results {
        let (icon, detail) = match result.status {
            BuildStatus::Passed => (
                style("✔").green().bold().to_string(),
                style(format_duration(result.duration_ms)).dim().to_string(),
            ),
            BuildStatus::Failed => (
                style("✖").red().bold().to_string(),
                style(format_duration(result.duration_ms)).red().to_string(),
            ),
        };
        let cached = if result.cached {
            style(" cached").dim().to_string()
        } else {
            String::new()
        };
        println!(
            "{icon} {}  {detail}{cached}",
            style(format!("{:<width$}", result.label)).bold(),
        );
    }
}

/// The targets that failed, with their output under `--logs`.
fn print_failures(results: &[TargetBuild], logs: bool) {
    let broken: Vec<&TargetBuild> = results
        .iter()
        .filter(|result| result.status == BuildStatus::Failed)
        .collect();
    if broken.is_empty() {
        return;
    }

    println!();
    println!("{}", style("Failing targets").red().bold());
    for result in broken {
        println!();
        println!(
            "{}  {}",
            style(&result.label).bold().underlined(),
            style("build failed").red()
        );

        if !logs {
            println!("  {}", style("re-run with --logs to see the output").dim());
            continue;
        }
        for line in tail(&result.output, LOG_TAIL_LINES) {
            println!("  {}", style(line).dim());
        }
    }
}

fn print_summary(results: &[TargetBuild], ran: usize, cached: usize) {
    let broken = results
        .iter()
        .filter(|result| result.status == BuildStatus::Failed)
        .count();

    let detail = format!("{ran} run · {cached} cached");

    if broken == 0 {
        success(format!("Built — {detail}"));
        return;
    }

    let message = format!(
        "{broken} target{} failing — {detail}",
        if broken == 1 { "" } else { "s" }
    );
    println!("{} {}", style("✖").red().bold(), style(message).red());
}

fn tail(output: &str, lines: usize) -> Vec<&str> {
    let all: Vec<&str> = output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    let start = all.len().saturating_sub(lines);
    all[start..].to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target(name: &str, target_type: TargetType, dir: PathBuf) -> WorkspaceTarget {
        WorkspaceTarget {
            key: format!(
                "{}/{name}",
                match target_type {
                    TargetType::Package => "packages",
                    TargetType::Module => "modules",
                }
            ),
            name: name.to_string(),
            target_type,
            dir,
            scripts: HashMap::new(),
            direct_scripts: false,
            workspace_deps: Vec::new(),
        }
    }

    /// The scratch a `BuildContext` borrows from, so a test can hold it for
    /// as long as the context lives.
    struct Scratch {
        memo: FingerprintMemo,
        hashes: FileHashCache,
        loader: Loader,
    }

    impl Scratch {
        fn new() -> Self {
            Self {
                memo: FingerprintMemo::new(),
                hashes: FileHashCache::new(),
                loader: Loader::hidden(),
            }
        }

        /// A context over a scratch directory, with the cache off so a test
        /// never reads or writes one.
        fn context<'a>(
            &'a self,
            root: &'a Path,
            all_targets: &'a [WorkspaceTarget],
        ) -> BuildContext<'a> {
            BuildContext {
                root_dir: root,
                all_targets,
                root_hash: "root",
                fingerprint_memo: &self.memo,
                use_git: false,
                no_cache: true,
                file_hash_cache: &self.hashes,
                loader: &self.loader,
            }
        }
    }

    fn build_result(
        name: &str,
        status: BuildStatus,
        duration_ms: u64,
        output: &str,
        cached: bool,
    ) -> TargetBuild {
        TargetBuild {
            label: format!("{name}:build"),
            name: name.to_string(),
            key: format!("packages/{name}"),
            selector: format!("--packages={name}"),
            status,
            duration_ms,
            output: output.to_string(),
            cached,
        }
    }

    // -- tail --------------------------------------------------------

    #[test]
    fn tail_keeps_everything_when_under_the_limit() {
        let output = "one\ntwo\nthree";
        assert_eq!(tail(output, 40), vec!["one", "two", "three"]);
    }

    #[test]
    fn tail_drops_blank_lines_and_truncates_to_the_last_n() {
        let mut lines: Vec<String> = (1..=50).map(|n| format!("line-{n}")).collect();
        // Sprinkle blank lines through the output — they must not count
        // toward the 40-line budget or show up in the result.
        lines.insert(10, String::new());
        lines.insert(20, "   ".to_string());
        let output = lines.join("\n");

        let tailed = tail(&output, LOG_TAIL_LINES);

        assert_eq!(tailed.len(), LOG_TAIL_LINES);
        assert!(tailed.iter().all(|line| !line.trim().is_empty()));
        assert_eq!(tailed.last(), Some(&"line-50"));
        assert_eq!(tailed.first(), Some(&"line-11"));
    }

    // -- build_argv ----------------------------------------------------

    #[test]
    fn build_argv_always_runs_bun_when_the_target_has_a_package_json() {
        let mut t = target("alpha", TargetType::Package, PathBuf::from("."));
        t.direct_scripts = false;
        t.scripts
            .insert("build".to_string(), "whatever this is".to_string());

        assert_eq!(
            build_argv(&t),
            vec!["bun".to_string(), "run".to_string(), "build".to_string()]
        );
    }

    #[test]
    fn build_argv_splits_the_declared_script_for_a_direct_target() {
        let mut t = target("crate-a", TargetType::Package, PathBuf::from("."));
        t.direct_scripts = true;
        t.scripts
            .insert("build".to_string(), "cargo build --release".to_string());

        assert_eq!(
            build_argv(&t),
            vec![
                "cargo".to_string(),
                "build".to_string(),
                "--release".to_string()
            ]
        );
    }

    #[test]
    fn build_argv_is_empty_when_a_direct_target_declares_no_build_script() {
        let mut t = target("crate-a", TargetType::Package, PathBuf::from("."));
        t.direct_scripts = true;

        assert!(build_argv(&t).is_empty());
    }

    // -- run_build -------------------------------------------------------

    #[test]
    fn run_build_reports_no_script_declared_when_argv_is_empty() {
        let mut t = target("crate-a", TargetType::Package, PathBuf::from("."));
        t.direct_scripts = true;
        t.scripts.insert("build".to_string(), String::new());

        let (success_flag, output, duration_ms) = run_build(&t);

        assert!(!success_flag);
        assert_eq!(output, "no build script declared");
        assert_eq!(duration_ms, 0);
    }

    #[test]
    fn run_build_reports_the_spawn_error_when_the_binary_does_not_exist() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut t = target("crate-a", TargetType::Package, dir.path().to_path_buf());
        t.direct_scripts = true;
        t.scripts.insert(
            "build".to_string(),
            "totally-nonexistent-binary-xyz-123".to_string(),
        );

        let (success_flag, output, _duration_ms) = run_build(&t);

        assert!(!success_flag);
        assert!(!output.is_empty());
    }

    #[test]
    fn run_build_reports_success_and_failure_from_a_real_process() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut ok = target("crate-a", TargetType::Package, dir.path().to_path_buf());
        ok.direct_scripts = true;
        ok.scripts.insert("build".to_string(), "true".to_string());
        let (success_flag, _output, _duration_ms) = run_build(&ok);
        assert!(success_flag);

        let mut failing = target("crate-b", TargetType::Package, dir.path().to_path_buf());
        failing.direct_scripts = true;
        failing
            .scripts
            .insert("build".to_string(), "false".to_string());
        let (success_flag, _output, _duration_ms) = run_build(&failing);
        assert!(!success_flag);
    }

    // -- filter_targets ----------------------------------------------

    #[test]
    fn filter_targets_returns_everything_when_nothing_is_named() {
        let targets = vec![target("alpha", TargetType::Package, PathBuf::from("."))];
        let selected = filter_targets(&targets, None, None).expect("some");
        assert_eq!(selected.len(), 1);
    }

    #[test]
    fn filter_targets_selects_the_named_package_and_module() {
        let targets = vec![
            target("alpha", TargetType::Package, PathBuf::from(".")),
            target("beta", TargetType::Module, PathBuf::from(".")),
            target("gamma", TargetType::Package, PathBuf::from(".")),
        ];
        let selected = filter_targets(&targets, Some("alpha"), Some("beta")).expect("some");
        let names: Vec<&str> = selected.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(names, vec!["alpha", "beta"]);
    }

    #[test]
    fn filter_targets_reports_a_missing_named_package() {
        let targets = vec![target("alpha", TargetType::Package, PathBuf::from("."))];
        assert!(filter_targets(&targets, Some("ghost"), None).is_none());
    }

    #[test]
    fn filter_targets_returns_an_empty_list_when_every_selector_is_blank() {
        let targets = vec![target("alpha", TargetType::Package, PathBuf::from("."))];
        let selected = filter_targets(&targets, Some(""), None).expect("some");
        assert!(selected.is_empty());
    }

    // -- transitive_deps ------------------------------------------------

    #[test]
    fn transitive_deps_dedupes_a_diamond_shaped_dependency_graph() {
        let mut a = target("a", TargetType::Package, PathBuf::from("."));
        let mut b = target("b", TargetType::Package, PathBuf::from("."));
        let mut c = target("c", TargetType::Package, PathBuf::from("."));
        let d = target("d", TargetType::Package, PathBuf::from("."));

        a.workspace_deps = vec![b.key.clone(), c.key.clone()];
        b.workspace_deps = vec![d.key.clone()];
        c.workspace_deps = vec![d.key.clone()];

        let by_key: HashMap<&str, &WorkspaceTarget> = [&b, &c, &d]
            .into_iter()
            .map(|t| (t.key.as_str(), t))
            .collect();

        let deps = transitive_deps(&a, &by_key);
        let keys: HashSet<&str> = deps.iter().map(|t| t.key.as_str()).collect();

        // d is reachable through both b and c, but is only visited once.
        assert_eq!(deps.len(), 3);
        assert!(keys.contains(b.key.as_str()));
        assert!(keys.contains(c.key.as_str()));
        assert!(keys.contains(d.key.as_str()));
    }

    // -- print_* (smoke — exercised for line coverage of the report layout) --

    #[test]
    fn print_report_functions_do_not_panic_across_every_shape_of_result() {
        let empty: Vec<TargetBuild> = Vec::new();
        print_rows(&empty);
        print_failures(&empty, false);
        print_summary(&empty, 0, 0);

        let mixed = vec![
            build_result("alpha", BuildStatus::Passed, 12, "", false),
            build_result("beta", BuildStatus::Passed, 0, "", true),
            build_result(
                "gamma",
                BuildStatus::Failed,
                8,
                "boom\n\nsecond line",
                false,
            ),
            build_result("delta", BuildStatus::Failed, 3, "", false),
        ];
        print_rows(&mixed);
        print_failures(&mixed, false);
        print_failures(&mixed, true);
        // Two failures pluralizes "targets failing": a run stops launching
        // new work at the first failure, but everything already in flight is
        // still collected, so a second one is reachable.
        print_summary(&mixed, 2, 1);
        print_report(&mixed, true, 100, 2, 1);
    }

    // -- plan / run_builds ---------------------------------------------

    #[test]
    fn plan_points_each_job_at_the_jobs_it_depends_on() {
        let mut app = target("app", TargetType::Module, PathBuf::from("."));
        let core = target("core", TargetType::Package, PathBuf::from("."));
        // A dependency outside the buildable set has no job to wait for, and
        // must not shift the indices of the ones that do.
        app.workspace_deps = vec![core.key.clone(), "packages/ghost".to_string()];

        let buildable = vec![core, app];
        let jobs = plan(&buildable);

        assert_eq!(jobs[0].label, "core:build");
        assert!(jobs[0].deps.is_empty());
        assert_eq!(jobs[1].label, "app:build");
        assert_eq!(jobs[1].deps, vec![0]);
    }

    #[test]
    fn concurrency_never_exceeds_the_job_count_or_the_cap() {
        assert_eq!(concurrency(1), 1);
        assert!(concurrency(100) <= MAX_CONCURRENCY);
        // An empty run still asks for one worker rather than none, so the
        // scheduler cannot spin on a zero-sized pool.
        assert_eq!(concurrency(0), 1);
    }

    /// Builds three targets — two independent, one waiting on the first — and
    /// checks the results come back in plan order whatever order they ran in.
    #[test]
    fn run_builds_reports_every_job_in_plan_order() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut core = target("core", TargetType::Package, dir.path().to_path_buf());
        core.direct_scripts = true;
        core.scripts.insert("build".to_string(), "true".to_string());

        let mut tool = target("tool", TargetType::Package, dir.path().to_path_buf());
        tool.direct_scripts = true;
        tool.scripts.insert("build".to_string(), "true".to_string());

        let mut app = target("app", TargetType::Module, dir.path().to_path_buf());
        app.direct_scripts = true;
        app.scripts.insert("build".to_string(), "true".to_string());
        app.workspace_deps = vec![core.key.clone()];

        let buildable = vec![core, tool, app];
        let jobs = plan(&buildable);
        let scratch = Scratch::new();
        let results = run_builds(&jobs, scratch.context(dir.path(), &buildable));

        let labels: Vec<&str> = results.iter().map(|r| r.label.as_str()).collect();
        assert_eq!(labels, vec!["core:build", "tool:build", "app:build"]);
        assert!(
            results
                .iter()
                .all(|r| r.status == BuildStatus::Passed && !r.cached)
        );
        assert_eq!(results[2].selector, "--modules=app");
    }

    #[test]
    fn run_builds_never_builds_what_waits_on_a_failed_target() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut core = target("core", TargetType::Package, dir.path().to_path_buf());
        core.direct_scripts = true;
        core.scripts
            .insert("build".to_string(), "false".to_string());

        let mut app = target("app", TargetType::Module, dir.path().to_path_buf());
        app.direct_scripts = true;
        app.scripts.insert("build".to_string(), "true".to_string());
        app.workspace_deps = vec![core.key.clone()];

        let buildable = vec![core, app];
        let jobs = plan(&buildable);
        let scratch = Scratch::new();
        let results = run_builds(&jobs, scratch.context(dir.path(), &buildable));

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].label, "core:build");
        assert_eq!(results[0].status, BuildStatus::Failed);
    }
}
