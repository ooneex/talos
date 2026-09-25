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
pub const LOG_TAIL_LINES: usize = 40;

/// How many targets build at once, when the machine has the cores for it.
pub const MAX_CONCURRENCY: usize = 8;

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
pub enum BuildStatus {
    Passed,
    Failed,
}

/// One target's build: how it ended, how long it took, and what it printed.
pub struct TargetBuild {
    /// `alpha:build` — how the target is named in a report line.
    pub label: String,
    /// `alpha` — the target's own name, for a selector that re-runs it alone.
    pub name: String,
    /// `packages/alpha` — where it lives, relative to the workspace root.
    pub key: String,
    /// `--packages=alpha` — what selects this target and nothing else.
    pub selector: String,
    pub status: BuildStatus,
    pub duration_ms: u64,
    pub output: String,
    pub cached: bool,
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
pub struct Job<'a> {
    target: &'a WorkspaceTarget,
    pub label: String,
    /// Indices into the job list, so a dependency is checked by position
    /// rather than looked up by key every time the scheduler picks work.
    pub deps: Vec<usize>,
}

/// Everything a job needs beyond itself, bundled so the scheduler can hand
/// one copy to every worker instead of threading eight parameters through.
#[derive(Clone, Copy)]
pub struct BuildContext<'a> {
    pub root_dir: &'a Path,
    pub all_targets: &'a [WorkspaceTarget],
    pub root_hash: &'a str,
    pub fingerprint_memo: &'a FingerprintMemo,
    pub use_git: bool,
    pub no_cache: bool,
    pub file_hash_cache: &'a FileHashCache,
    pub loader: &'a Loader,
}

/// Turn the ordered targets into jobs, resolving each one's declared
/// workspace dependencies to the jobs that will produce them.
///
/// Only direct dependencies are recorded: a job whose dependency waits on
/// something else is held back by that job in turn, so the transitive order
/// falls out of the graph without being spelled out.
pub fn plan(buildable: &[WorkspaceTarget]) -> Vec<Job<'_>> {
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

pub fn concurrency(jobs: usize) -> usize {
    std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(1)
        .clamp(1, MAX_CONCURRENCY)
        .min(jobs.max(1))
}

/// Build every job, as many at a time as the machine has cores for, and
/// report them in the order they were planned.
///
/// A job starts the moment every build it imports has finished, so an
/// unrelated pair never waits on each other. A failure is recorded but does
/// not stop the queue: every selected target is attempted and the complete
/// report is returned at the end.
pub fn run_builds(jobs: &[Job], ctx: BuildContext) -> Vec<TargetBuild> {
    let limit = concurrency(jobs.len());
    let mut completed = vec![false; jobs.len()];
    let mut launched = vec![false; jobs.len()];
    let mut results: Vec<Option<TargetBuild>> = (0..jobs.len()).map(|_| None).collect();

    std::thread::scope(|scope| {
        let (tx, rx) = channel::<(usize, TargetBuild)>();
        let mut inflight = 0usize;

        loop {
            while inflight < limit {
                let next = (0..jobs.len()).find(|&index| {
                    !launched[index] && jobs[index].deps.iter().all(|&dep| completed[dep])
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
                break;
            };
            inflight -= 1;
            completed[index] = true;
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
        return result(
            job,
            if entry.success {
                BuildStatus::Passed
            } else {
                BuildStatus::Failed
            },
            entry.duration_ms,
            entry.output,
            true,
        );
    }

    ctx.loader.entered(0, job.label.clone());
    let (success_flag, output, duration_ms, completed) = run_build(target);
    ctx.loader.left(0, &job.label);

    if completed && !ctx.no_cache {
        cache::write(
            ctx.root_dir,
            &target.key,
            &hash,
            duration_ms,
            success_flag,
            &output,
        );
    }
    result(
        job,
        if success_flag {
            BuildStatus::Passed
        } else {
            BuildStatus::Failed
        },
        duration_ms,
        output,
        false,
    )
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
pub fn filter_targets(
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
pub fn transitive_deps<'a>(
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
pub fn build_argv(target: &WorkspaceTarget) -> Vec<String> {
    if !target.direct_scripts {
        return vec!["bun".to_string(), "run".to_string(), "build".to_string()];
    }
    target
        .scripts
        .get("build")
        .map(|script| script.split_whitespace().map(str::to_string).collect())
        .unwrap_or_default()
}

pub fn run_build(target: &WorkspaceTarget) -> (bool, String, u64, bool) {
    let argv = build_argv(target);
    let started = Instant::now();
    let Some((bin, rest)) = argv.split_first() else {
        return (false, "no build script declared".to_string(), 0, false);
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
            true,
        ),
        Err(err) => (false, err.to_string(), duration_ms, false),
    }
}

/// Print the build results — one row per target and the output of every one
/// that failed, laid out the same way `lint`'s report is.
pub fn print_report(
    results: &[TargetBuild],
    logs: bool,
    elapsed_ms: u64,
    ran: usize,
    cached: usize,
) {
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

pub fn print_rows(results: &[TargetBuild]) {
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
pub fn print_failures(results: &[TargetBuild], logs: bool) {
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

pub fn print_summary(results: &[TargetBuild], ran: usize, cached: usize) {
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

pub fn tail(output: &str, lines: usize) -> Vec<&str> {
    let all: Vec<&str> = output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    let start = all.len().saturating_sub(lines);
    all[start..].to_vec()
}
