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
    FileHashCache, FingerprintMemo, Footer, Spinner, TargetType, WorkspaceTarget, current_dir,
    discover_targets, error, fingerprint_target, format_duration, hash_root_inputs,
    is_git_workspace_root, sort_targets_by_dependencies, split_csv, warn,
};

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

pub fn run(args: &BuildArgs) {
    if !execute(args) {
        std::process::exit(1);
    }
}

/// Discovers the workspace and fingerprints its root inputs in parallel,
/// under one spinner — the only stretch of a build where nothing is drawn
/// otherwise.
fn load_build_state(root_dir: &std::path::Path) -> (Vec<WorkspaceTarget>, String, bool) {
    let spinner = Spinner::start("Analyzing workspace");
    let result = std::thread::scope(|scope| {
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
    });
    spinner.stop();
    result
}

pub fn execute(args: &BuildArgs) -> bool {
    let root_dir = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let (all_targets, root_hash, use_git) = load_build_state(&root_dir);

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

    println!(
        "{}{}",
        style("▸ ").magenta(),
        style(format!(
            "build  {} target{}",
            buildable.len(),
            if buildable.len() == 1 { "" } else { "s" }
        ))
        .magenta()
        .bold()
    );

    let file_hash_cache = FileHashCache::new();
    let fingerprint_memo = FingerprintMemo::new();

    let started_at = Instant::now();
    let footer = Footer::start(buildable.len());

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
            report(
                &footer,
                &label,
                false,
                &success_lines(&label, entry.duration_ms, true),
            );
            continue;
        }

        footer.task_started(&label);
        let (success, output, duration_ms) = run_build(target);

        if success {
            ran += 1;
            report(
                &footer,
                &label,
                false,
                &success_lines(&label, duration_ms, false),
            );
            if args.logs && !output.trim().is_empty() {
                for line in tail_lines(&output, MAX_SUCCESS_LOG_LINES) {
                    println!("{} {line}", style("┃").dim());
                }
            }
            if !args.no_cache {
                cache::write(&root_dir, &target.key, &hash, duration_ms, &output);
            }
        } else {
            report(
                &footer,
                &label,
                true,
                &failure_lines(&label, duration_ms, &output, args.logs),
            );
            any_failed = true;
            break;
        }
    }

    footer.stop();

    if any_failed {
        return false;
    }

    println!(
        "{}{}",
        style("✔ Built").green(),
        style(format!(
            "  {ran} run · {cached} cached  in {}",
            format_duration(started_at.elapsed().as_millis() as u64)
        ))
        .dim()
    );
    true
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

/// Prints (or hands to the footer) a target's finish line. A footer that is
/// not attended to a terminal draws nothing, so its disabled path is printed
/// directly here instead.
fn report(footer: &Footer, label: &str, failed: bool, lines: &[String]) {
    if footer.enabled() {
        footer.task_finished(label, failed, lines);
        return;
    }
    if failed {
        for line in lines {
            eprintln!("{line}");
        }
    } else {
        for line in lines {
            println!("{line}");
        }
    }
}

fn success_lines(label: &str, duration_ms: u64, cached: bool) -> Vec<String> {
    vec![format!(
        "{} {label}{}",
        style("✔").green(),
        style(format!(
            "  {}{}",
            if cached { "cached · " } else { "" },
            format_duration(duration_ms)
        ))
        .dim()
    )]
}

/// Succeeded builds only ever show a tail this long under `--logs`, so a
/// noisy build doesn't drown the summary the way an unbounded dump would.
const MAX_SUCCESS_LOG_LINES: usize = 1;

/// The last `max` non-blank lines of a target's output, ignoring trailing
/// `$ <command>` echoes some build tools (e.g. bunup) print after finishing.
fn tail_lines(output: &str, max: usize) -> Vec<&str> {
    let body: Vec<&str> = output
        .lines()
        .filter(|l| {
            let trimmed = l.trim();
            !trimmed.is_empty() && !trimmed.starts_with("$ ")
        })
        .collect();
    body[body.len().saturating_sub(max)..].to_vec()
}

/// The last 20 non-blank lines of a failed target's output, or every line
/// under `--logs`.
fn failure_lines(label: &str, duration_ms: u64, output: &str, show_logs: bool) -> Vec<String> {
    let mut lines = vec![format!(
        "{} {label}{}",
        style("✖").red(),
        style(format!("  failed  {}", format_duration(duration_ms))).red()
    )];
    let body: Vec<&str> = output.lines().filter(|l| !l.trim().is_empty()).collect();
    let tail: &[&str] = if show_logs {
        &body
    } else {
        &body[body.len().saturating_sub(20)..]
    };
    lines.extend(
        tail.iter()
            .map(|line| format!("{} {line}", style("┃").red())),
    );
    lines
}
