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

#[path = "build/cache.rs"]
mod cache;

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::process::Command;
use std::time::Instant;

use clap::Args;
use console::style;

use crate::utils::{
    FileHashCache, FingerprintMemo, Loader, LoaderGroup, Spinner, TargetType, WorkspaceTarget,
    current_dir, discover_targets, error, fingerprint_target, format_duration, hash_root_inputs,
    is_git_workspace_root, sort_targets_by_dependencies, split_csv, success, warn,
};

/// How many lines a failed target's output shows before it is truncated.
const LOG_TAIL_LINES: usize = 40;

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
    label: String,
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

    let mut results: Vec<TargetBuild> = Vec::new();
    let mut ran = 0usize;
    let mut cached = 0usize;
    let mut any_failed = false;

    for target in &buildable {
        let label = format!("{}:build", target.name);
        let hash = build_hash(
            target,
            &all_targets,
            &root_hash,
            &fingerprint_memo,
            use_git,
            &file_hash_cache,
        );

        if !args.no_cache
            && let Some(entry) = cache::read(&root_dir, &target.key)
            && entry.matches(&target.key, &hash)
        {
            cached += 1;
            // A cache hit is not work in flight, so it is counted rather
            // than named as running.
            loader.advance(0);
            results.push(TargetBuild {
                label,
                status: BuildStatus::Passed,
                duration_ms: 0,
                output: String::new(),
                cached: true,
            });
            continue;
        }

        loader.entered(0, label.clone());
        let (success_flag, output, duration_ms) = run_build(target);
        loader.left(0, &label);

        if success_flag {
            ran += 1;
            if !args.no_cache {
                cache::write(&root_dir, &target.key, &hash, duration_ms, &output);
            }
            results.push(TargetBuild {
                label,
                status: BuildStatus::Passed,
                duration_ms,
                output,
                cached: false,
            });
        } else {
            any_failed = true;
            results.push(TargetBuild {
                label,
                status: BuildStatus::Failed,
                duration_ms,
                output,
                cached: false,
            });
            break;
        }
    }

    loader.stop();

    print_report(
        &results,
        args.logs,
        started_at.elapsed().as_millis() as u64,
        ran,
        cached,
    );

    !any_failed
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
