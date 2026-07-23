//! Rust port of `packages/cli/src/commands/MonorepoRunCommand.ts`: runs
//! `package.json` scripts across packages and modules with granular,
//! content-addressed caching.
//!
//! This port keeps the caching engine and scheduling semantics (dependency
//! ordering, order-independent `fmt`/`lint`, skip-if-no-tests, install
//! group, abort-on-first-failure) faithful to the TypeScript original but
//! always renders in the TypeScript version's non-interactive "logs" mode —
//! plain scrollback lines as tasks finish — rather than reproducing its
//! live, redrawing TTY footer with a spinner and progress bar, since that's
//! a cosmetic layer with no behavioral effect on what gets run or cached.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::time::Instant;

use clap::Args;
use console::style;
use rayon::prelude::*;
use regex::Regex;

use crate::utils::{
    CacheEntryMeta, FingerprintMemo, MONOREPO_CACHE_DIR, MONOREPO_CACHE_VERSION, MonorepoTarget,
    TargetType, compute_task_hash, current_dir, discover_targets, hash_root_inputs,
    is_git_workspace_root, load_file_hash_cache, read_cache_entry, restore_cache_outputs,
    save_file_hash_cache, sort_targets_by_dependencies, write_cache_entry,
};

const INSTALL_COMMAND: &str = "install";
const TEST_COMMAND: &str = "test";
const ORDER_INDEPENDENT_COMMANDS: &[&str] = &["fmt", "lint"];

/// Rust port of `MonorepoRunCommand`'s `CommandOptionsType`.
#[derive(Args, Debug, Default, Clone)]
pub struct MonorepoRunArgs {
    /// Comma-separated list of package.json scripts to run (e.g. `build,lint`).
    #[arg(long)]
    pub commands: Option<String>,

    /// Comma-separated list of package names to restrict the run to.
    #[arg(long)]
    pub packages: Option<String>,

    /// Comma-separated list of module names to restrict the run to.
    #[arg(long)]
    pub modules: Option<String>,

    /// Reserved for parity with the TypeScript CLI's `--logs` flag; this port
    /// always runs in the equivalent non-interactive/plain output mode.
    #[arg(long, default_value_t = false)]
    pub logs: bool,

    /// Bypass the task cache entirely.
    #[arg(long, default_value_t = false)]
    pub no_cache: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum TaskStatus {
    Pending,
    Success,
    Cached,
    Failed,
    Skipped,
}

struct Task {
    key: String,
    label: String,
    target_key: Option<String>,
    command: String,
    cwd: PathBuf,
    argv: Vec<String>,
    cacheable: bool,
    deps: Vec<String>,
    status: TaskStatus,
    output: String,
    exit_code: Option<i32>,
    duration_ms: u64,
    hash: Option<String>,
}

pub fn run(args: &MonorepoRunArgs) {
    if !execute(args) {
        std::process::exit(1);
    }
}

/// Runs `MonorepoRunArgs`'s command groups to completion and returns whether
/// every task succeeded (used by alias commands, e.g. `monorepo:check`,
/// which forwards a fixed `--commands` list and otherwise behaves exactly
/// like `monorepo:run`).
pub fn execute(args: &MonorepoRunArgs) -> bool {
    let commands: Vec<String> = split_csv(args.commands.as_deref());
    if commands.is_empty() {
        crate::utils::error("The --commands option is required (e.g. --commands=build,lint)");
        return false;
    }

    let root_dir = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let cache_dir = root_dir.join(MONOREPO_CACHE_DIR);

    // Discovering targets is the one visibly slow step before tasks start
    // streaming, so cover it with a spinner (mirrors `createSpinner` around
    // this same step in `MonorepoRunCommand.ts`). These four probes only
    // depend on `root_dir`/`cache_dir` and never on each other, so run them
    // on their own threads instead of paying for each round-trip in series
    // (mirrors the TypeScript version's `Promise.all`).
    let spinner = crate::utils::Spinner::start("Analyzing workspace");
    let (all_targets, root_hash, use_git, file_hash_cache) = std::thread::scope(|scope| {
        let targets_handle = scope.spawn(|| discover_targets(&root_dir));
        let root_hash_handle = scope.spawn(|| hash_root_inputs(&root_dir));
        let use_git_handle = scope.spawn(|| is_git_workspace_root(&root_dir));
        let cache_handle = scope.spawn(|| load_file_hash_cache(&cache_dir));
        (
            targets_handle.join().unwrap(),
            root_hash_handle.join().unwrap(),
            use_git_handle.join().unwrap(),
            cache_handle.join().unwrap(),
        )
    });
    spinner.stop();

    let Some(targets) = filter_targets(
        &all_targets,
        args.packages.as_deref(),
        args.modules.as_deref(),
    ) else {
        return false;
    };
    if targets.is_empty() && commands.iter().any(|c| c != INSTALL_COMMAND) {
        crate::utils::error("No packages or modules found to run");
        return false;
    }

    let sorted = sort_targets_by_dependencies(&targets);
    let included_keys: HashSet<String> = sorted.iter().map(|t| t.key.clone()).collect();

    let mut groups: Vec<Vec<Task>> = commands
        .iter()
        .map(|command| {
            if command == INSTALL_COMMAND {
                build_install_group(&root_dir)
            } else {
                build_group(&sorted, &included_keys, command)
            }
        })
        .collect();

    let total_tasks: usize = groups.iter().map(|g| g.len()).sum();
    // Mirrors `MonorepoRunCommand.run`'s opening line: an accent-colored `▸`
    // symbol, a bold accent-colored command list, then the task/target
    // counts in dim — the same split-color style as the TypeScript
    // version's `colorize`/`bold` calls.
    println!(
        "{}{}{}",
        style("▸ ").magenta(),
        style(commands.join(", ")).magenta().bold(),
        style(format!(
            "  {} task{} across {} target{}",
            total_tasks,
            if total_tasks == 1 { "" } else { "s" },
            sorted.len(),
            if sorted.len() == 1 { "" } else { "s" },
        ))
        .dim()
    );

    let started_at = Instant::now();
    let fingerprint_memo = FingerprintMemo::new();
    let mut stopped = false;
    let mut any_failed = false;

    for group in &mut groups {
        if stopped {
            break;
        }
        let group_failed = run_group(
            group,
            &all_targets,
            &root_hash,
            &cache_dir,
            &fingerprint_memo,
            use_git,
            args.no_cache,
            &file_hash_cache,
        );
        if group_failed {
            stopped = true;
            any_failed = true;
        }
    }

    if !args.no_cache {
        save_file_hash_cache(&cache_dir, &file_hash_cache);
    }

    if any_failed {
        return false;
    }

    let all_tasks: Vec<&Task> = groups.iter().flatten().collect();
    let completed = all_tasks
        .iter()
        .filter(|t| t.status == TaskStatus::Success)
        .count();
    let cached = all_tasks
        .iter()
        .filter(|t| t.status == TaskStatus::Cached)
        .count();
    let skipped = all_tasks
        .iter()
        .filter(|t| t.status == TaskStatus::Skipped)
        .count();
    let mut parts = vec![format!("{completed} run"), format!("{cached} cached")];
    if skipped > 0 {
        parts.push(format!("{skipped} skipped"));
    }
    // Mirrors the TypeScript version's closing line: a green `✔ Ran ...`
    // segment followed by the counts/duration in dim.
    println!(
        "{}{}",
        style(format!("✔ Ran {}", commands.join(", "))).green(),
        style(format!(
            "  {}  in {}",
            parts.join(" · "),
            format_duration(started_at.elapsed().as_millis() as u64)
        ))
        .dim()
    );
    true
}

fn format_duration(ms: u64) -> String {
    if ms < 1000 {
        format!("{ms}ms")
    } else {
        format!("{:.1}s", ms as f64 / 1000.0)
    }
}

fn split_csv(value: Option<&str>) -> Vec<String> {
    value
        .map(|v| {
            v.split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// Resolve `--packages` / `--modules` into targets. With neither flag, every
/// package and module runs. Unknown names abort the run.
fn filter_targets(
    targets: &[MonorepoTarget],
    packages: Option<&str>,
    modules: Option<&str>,
) -> Option<Vec<MonorepoTarget>> {
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
            crate::utils::error(format!(
                "No {} named \"{name}\" found",
                target_type.as_str()
            ));
            return None;
        };
        selected.push(target.clone());
    }
    Some(selected)
}

/// True when a target has at least one file `bun test` would run under
/// `tests/`, scanned recursively.
fn has_tests(target: &MonorepoTarget) -> bool {
    let is_test_file = Regex::new(r"[._](?:test|spec)\.[cm]?[jt]sx?$").unwrap();
    let mut stack = vec![target.dir.join("tests")];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if path.is_file() && is_test_file.is_match(&name_str) {
                return true;
            }
            if path.is_dir() && name_str != "node_modules" {
                stack.push(path);
            }
        }
    }
    false
}

// One task per target for a command. Targets whose package.json lacks the
// script are marked skipped up front; for `test`, targets with an empty (or
// absent) `tests/` folder are skipped too. Order-independent commands carry
// no dependency edges, so every target in that group can run concurrently.
fn build_group(
    targets: &[MonorepoTarget],
    included_keys: &HashSet<String>,
    command: &str,
) -> Vec<Task> {
    let ordered = !ORDER_INDEPENDENT_COMMANDS.contains(&command);
    targets
        .iter()
        .map(|target| {
            let skipped = !target.scripts.contains_key(command)
                || (command == TEST_COMMAND && !has_tests(target));
            Task {
                key: format!("{}#{command}", target.key),
                label: format!("{}:{command}", target.name),
                target_key: Some(target.key.clone()),
                command: command.to_string(),
                cwd: target.dir.clone(),
                argv: vec!["bun".to_string(), "run".to_string(), command.to_string()],
                cacheable: true,
                deps: if ordered {
                    target
                        .workspace_deps
                        .iter()
                        .filter(|k| included_keys.contains(*k))
                        .map(|k| format!("{k}#{command}"))
                        .collect()
                } else {
                    Vec::new()
                },
                status: if skipped {
                    TaskStatus::Skipped
                } else {
                    TaskStatus::Pending
                },
                output: String::new(),
                exit_code: None,
                duration_ms: 0,
                hash: None,
            }
        })
        .collect()
}

// A single root-level `bun install`. It is not tied to a target and is never
// cached, since bun already skips work when the lockfile is unchanged.
fn build_install_group(root_dir: &Path) -> Vec<Task> {
    vec![Task {
        key: format!("root#{INSTALL_COMMAND}"),
        label: INSTALL_COMMAND.to_string(),
        target_key: None,
        command: INSTALL_COMMAND.to_string(),
        cwd: root_dir.to_path_buf(),
        argv: vec!["bun".to_string(), "install".to_string()],
        cacheable: false,
        deps: Vec::new(),
        status: TaskStatus::Pending,
        output: String::new(),
        exit_code: None,
        duration_ms: 0,
        hash: None,
    }]
}

/// Runs a command group's tasks, launching every task whose workspace
/// dependencies are already done and bounding concurrency to the available
/// CPU parallelism. Skipped tasks count as done up front. Returns whether
/// any task in the group failed (which aborts the whole run, matching the
/// TypeScript version).
#[allow(clippy::too_many_arguments)]
fn run_group(
    tasks: &mut [Task],
    all_targets: &[MonorepoTarget],
    root_hash: &str,
    cache_dir: &Path,
    fingerprint_memo: &FingerprintMemo,
    use_git: bool,
    no_cache: bool,
    file_hash_cache: &crate::utils::FileHashCache,
) -> bool {
    for task in tasks.iter() {
        if task.status == TaskStatus::Skipped {
            report_finish(task);
        }
    }

    let mut done: HashSet<String> = tasks
        .iter()
        .filter(|t| t.status == TaskStatus::Skipped)
        .map(|t| t.key.clone())
        .collect();
    let limit = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
        .max(1);
    let mut failed = false;

    loop {
        let ready_indices: Vec<usize> = tasks
            .iter()
            .enumerate()
            .filter(|(_, t)| {
                t.status == TaskStatus::Pending && t.deps.iter().all(|d| done.contains(d))
            })
            .map(|(i, _)| i)
            .take(limit)
            .collect();

        if ready_indices.is_empty() {
            break;
        }

        // Compute cache hashes and check for cache hits in parallel: the
        // fingerprint memo and file-hash cache are both `DashMap`s (sharded,
        // lock-free-reads under the hood), so hashing several targets' files
        // concurrently — on top of each target's own per-file parallelism in
        // `fingerprint_dir` — no longer serializes on a single lock. Each
        // closure only reads its own task by index, so the borrow is safe to
        // share across threads.
        let ready_tasks: &[Task] = tasks;
        let hash_results: Vec<(usize, Option<TaskHashResult>)> = ready_indices
            .par_iter()
            .map(|&index| {
                (
                    index,
                    try_cache_hit(
                        &ready_tasks[index],
                        all_targets,
                        root_hash,
                        cache_dir,
                        fingerprint_memo,
                        use_git,
                        no_cache,
                        file_hash_cache,
                    ),
                )
            })
            .collect();

        let mut to_spawn: Vec<usize> = Vec::new();
        for (index, result) in hash_results {
            let Some(result) = result else {
                to_spawn.push(index);
                continue;
            };
            let is_hit = result.hit.is_some();
            apply_task_hash_result(&mut tasks[index], result);
            if is_hit {
                done.insert(tasks[index].key.clone());
                report_finish(&tasks[index]);
            } else {
                to_spawn.push(index);
            }
        }

        // Run every cache miss's subprocess in parallel (each thread owns its
        // own `Command`/`Output`, so no shared mutable state crosses threads).
        let results: Vec<(usize, std::io::Result<Output>, u64)> = std::thread::scope(|scope| {
            let handles: Vec<_> = to_spawn
                .iter()
                .map(|&index| {
                    let argv = tasks[index].argv.clone();
                    let cwd = tasks[index].cwd.clone();
                    scope.spawn(move || {
                        let started = Instant::now();
                        let output = Command::new(&argv[0])
                            .args(&argv[1..])
                            .current_dir(&cwd)
                            .output();
                        (index, output, started.elapsed().as_millis() as u64)
                    })
                })
                .collect();
            handles.into_iter().map(|h| h.join().unwrap()).collect()
        });

        for (index, output_result, duration_ms) in results {
            let task = &mut tasks[index];
            task.duration_ms = duration_ms;
            match output_result {
                Ok(output) => {
                    task.output = format!(
                        "{}{}",
                        String::from_utf8_lossy(&output.stdout),
                        String::from_utf8_lossy(&output.stderr)
                    );
                    task.exit_code = output.status.code();
                    if output.status.success() {
                        task.status = TaskStatus::Success;
                        if task.cacheable
                            && let Some(hash) = &task.hash
                            && let Some(target_key) = &task.target_key
                            && let Some(target) = all_targets.iter().find(|t| &t.key == target_key)
                        {
                            write_cache_entry(
                                cache_dir,
                                &CacheEntryMeta {
                                    version: MONOREPO_CACHE_VERSION,
                                    target: target.key.clone(),
                                    command: task.command.clone(),
                                    hash: hash.clone(),
                                    created_at: chrono::Utc::now().to_rfc3339(),
                                    duration_ms: task.duration_ms,
                                    outputs: target.outputs.clone(),
                                },
                                &task.output,
                                &target.dir,
                            );
                        }
                    } else {
                        task.status = TaskStatus::Failed;
                        failed = true;
                    }
                }
                Err(error) => {
                    task.output = error.to_string();
                    task.exit_code = Some(1);
                    task.status = TaskStatus::Failed;
                    failed = true;
                }
            }
            done.insert(task.key.clone());
            report_finish(task);
        }

        if failed {
            break;
        }
    }

    failed
}

/// Result of a cache-hash check for one task: the content hash is always
/// computed (needed later to write a fresh cache entry on a miss), and
/// `hit` carries the restored output when the cache already had it. Kept
/// free of `Task` so this can run inside a shared (`&[Task]`) parallel
/// closure.
struct TaskHashResult {
    hash: String,
    hit: Option<CacheHit>,
}

struct CacheHit {
    output: String,
    duration_ms: u64,
}

/// Computes a task's content hash and checks the cache for a hit, restoring
/// cached outputs when found. Returns `None` only for non-cacheable tasks
/// (e.g. install) where there is no hash to compute at all.
#[allow(clippy::too_many_arguments)]
fn try_cache_hit(
    task: &Task,
    all_targets: &[MonorepoTarget],
    root_hash: &str,
    cache_dir: &Path,
    fingerprint_memo: &FingerprintMemo,
    use_git: bool,
    no_cache: bool,
    file_hash_cache: &crate::utils::FileHashCache,
) -> Option<TaskHashResult> {
    if !task.cacheable || no_cache {
        return None;
    }
    let target_key = task.target_key.as_ref()?;
    let target = all_targets.iter().find(|t| &t.key == target_key)?;

    let hash = compute_task_hash(
        target,
        &task.command,
        all_targets,
        root_hash,
        fingerprint_memo,
        use_git,
        file_hash_cache,
    );

    let hit = read_cache_entry(cache_dir, &hash).map(|(meta, output)| {
        restore_cache_outputs(cache_dir, &meta, &target.dir);
        CacheHit {
            output,
            duration_ms: meta.duration_ms,
        }
    });

    Some(TaskHashResult { hash, hit })
}

/// Applies a resolved hash/cache-hit result to its task. When there was a
/// cache hit, marks the task `Cached`; otherwise just stamps the hash so a
/// successful run can write a fresh cache entry under it.
fn apply_task_hash_result(task: &mut Task, result: TaskHashResult) {
    task.hash = Some(result.hash);
    if let Some(hit) = result.hit {
        task.output = hit.output;
        task.duration_ms = hit.duration_ms;
        task.status = TaskStatus::Cached;
    }
}

/// Prints a task's final state to stdout. A successful task gets a one-line
/// `✔ label duration`; a failed task gets its status line plus a trimmed
/// excerpt of the output that explains the failure. Cached and skipped tasks
/// stay silent, matching the TypeScript version (the closing summary still
/// reports their counts). Colors mirror `reportFinish` in
/// `MonorepoRunCommand.ts`: a colored status symbol, the plain-colored task
/// label, and the duration/exit-code detail dimmed.
fn report_finish(task: &Task) {
    match task.status {
        TaskStatus::Success => {
            println!(
                "{} {}{}",
                style("✔").green(),
                task.label,
                style(format!("  {}", format_duration(task.duration_ms))).dim()
            );
        }
        TaskStatus::Failed => {
            eprintln!(
                "{} {}{}{}",
                style("✖").red(),
                task.label,
                style("  failed").red(),
                style(format!(
                    "  exit {}  {}",
                    task.exit_code.unwrap_or(1),
                    format_duration(task.duration_ms)
                ))
                .dim()
            );
            for line in failure_excerpt(&task.output) {
                eprintln!("{} {line}", style("┃").red());
            }
        }
        TaskStatus::Cached | TaskStatus::Skipped => {}
        TaskStatus::Pending => {}
    }
}

/// Reduces a failed task's captured output to just the lines that explain
/// the failure, plus a little surrounding context. Falls back to the tail of
/// the output when nothing matches an obvious failure signal.
fn failure_excerpt(output: &str) -> Vec<String> {
    let normalized = output.replace('\r', "");
    let lines: Vec<String> = normalized.lines().map(str::to_string).collect();
    let signal = Regex::new(
        r"(?i)\b(?:error|fail(?:ed|ure|s|ing)?|panic|exception|uncaught|unhandled|throw(?:s|n)?|assert\w*|not ok|refus\w*)\b|error TS\d|\(fail\)|[✗✕×✖✘]",
    )
    .unwrap();
    let noise = Regex::new(r"\(pass\)|^\s*\^+\s*$").unwrap();
    let before = 1i64;
    let after = 3i64;
    let max_lines = 120;

    let mut keep = vec![false; lines.len()];
    let mut matched = false;
    for (i, line) in lines.iter().enumerate() {
        if noise.is_match(line) || !signal.is_match(line) {
            continue;
        }
        matched = true;
        let start = (i as i64 - before).max(0) as usize;
        let end = ((i as i64 + after) as usize).min(lines.len().saturating_sub(1));
        for k in keep.iter_mut().take(end + 1).skip(start) {
            *k = true;
        }
    }
    for (i, line) in lines.iter().enumerate() {
        if noise.is_match(line) {
            keep[i] = false;
        }
    }

    if !matched {
        let filtered: Vec<String> = lines
            .iter()
            .filter(|l| !l.trim().is_empty() && !noise.is_match(l))
            .cloned()
            .collect();
        let start = filtered.len().saturating_sub(20);
        return filtered[start..].to_vec();
    }

    let mut excerpt: Vec<String> = Vec::new();
    let mut run: Vec<String> = Vec::new();
    let flush = |run: &mut Vec<String>, excerpt: &mut Vec<String>| {
        while run.first().is_some_and(|l| l.trim().is_empty()) {
            run.remove(0);
        }
        while run.last().is_some_and(|l| l.trim().is_empty()) {
            run.pop();
        }
        if run.is_empty() {
            return;
        }
        if !excerpt.is_empty() {
            excerpt.push("…".to_string());
        }
        excerpt.append(run);
    };
    for (i, line) in lines.iter().enumerate() {
        if keep[i] {
            run.push(line.clone());
        } else {
            flush(&mut run, &mut excerpt);
        }
    }
    flush(&mut run, &mut excerpt);
    excerpt.truncate(max_lines);
    excerpt
}
