//! Runs a command group's tasks to completion: dependency-ordered,
//! cache-aware, bounded-parallelism scheduling plus the task-finish
//! reporting `monorepo:run` prints as tasks complete.

use std::collections::HashSet;
use std::path::Path;
use std::process::{Command, Output};
use std::time::Instant;

use console::style;
use rayon::prelude::*;
use regex::Regex;

use super::monorepo_task::{Task, TaskStatus, format_duration};
use crate::utils::{
    CacheEntryMeta, FileHashCache, FingerprintMemo, MONOREPO_CACHE_VERSION, MonorepoTarget,
    compute_task_hash, read_cache_entry, restore_cache_outputs, write_cache_entry,
};

/// Runs a command group's tasks, launching every task whose workspace
/// dependencies are already done and bounding concurrency to the available
/// CPU parallelism. Skipped tasks count as done up front. Returns whether
/// any task in the group failed (which aborts the whole run, matching the
/// TypeScript version).
#[allow(clippy::too_many_arguments)]
pub(crate) fn run_group(
    tasks: &mut [Task],
    all_targets: &[MonorepoTarget],
    root_hash: &str,
    cache_dir: &Path,
    fingerprint_memo: &FingerprintMemo,
    use_git: bool,
    no_cache: bool,
    file_hash_cache: &FileHashCache,
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
    file_hash_cache: &FileHashCache,
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
