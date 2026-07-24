use std::collections::HashSet;
use std::path::Path;
use std::process::Command;
use std::sync::mpsc::channel;
use std::time::Instant;

use console::style;
use regex::Regex;

use super::monorepo_task::{Task, TaskStatus, format_duration};
use crate::utils::{
    CacheEntryMeta, FileHashCache, FingerprintMemo, Footer, MONOREPO_CACHE_VERSION, MonorepoTarget,
    compute_task_hash, read_cache_entry, restore_cache_outputs, write_cache_entry,
};

enum TaskOutcome {
    Cached {
        hash: String,
        duration_ms: u64,
    },
    Ran {
        hash: Option<String>,
        output: String,
        exit_code: Option<i32>,
        success: bool,
        duration_ms: u64,
    },
}

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
    footer: &Footer,
) -> bool {
    for task in tasks.iter() {
        if task.status == TaskStatus::Skipped {
            report_finish(task, footer);
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
    let mut launched = vec![false; tasks.len()];

    std::thread::scope(|scope| {
        let (tx, rx) = channel::<(usize, TaskOutcome)>();
        let mut inflight = 0usize;

        loop {
            while !failed && inflight < limit {
                let next = (0..tasks.len()).find(|&i| {
                    !launched[i]
                        && tasks[i].status == TaskStatus::Pending
                        && tasks[i].deps.iter().all(|d| done.contains(d))
                });
                let Some(index) = next else { break };

                launched[index] = true;
                inflight += 1;
                footer.task_started(&tasks[index].label);

                let argv = tasks[index].argv.clone();
                let cwd = tasks[index].cwd.clone();
                let cacheable = tasks[index].cacheable;
                let command = tasks[index].command.clone();
                let target_key = tasks[index].target_key.clone();
                let tx = tx.clone();

                scope.spawn(move || {
                    let cache = if cacheable && !no_cache {
                        try_cache_hit(
                            target_key.as_deref(),
                            &command,
                            all_targets,
                            root_hash,
                            cache_dir,
                            fingerprint_memo,
                            use_git,
                            file_hash_cache,
                        )
                    } else {
                        None
                    };

                    let outcome = match cache {
                        Some(TaskHashResult {
                            hash,
                            hit: Some(hit),
                        }) => TaskOutcome::Cached {
                            hash,
                            duration_ms: hit.duration_ms,
                        },
                        other => {
                            let hash = other.map(|r| r.hash);
                            let started = Instant::now();
                            let result = Command::new(&argv[0])
                                .args(&argv[1..])
                                .current_dir(&cwd)
                                .output();
                            let duration_ms = started.elapsed().as_millis() as u64;
                            match result {
                                Ok(output) => TaskOutcome::Ran {
                                    hash,
                                    output: format!(
                                        "{}{}",
                                        String::from_utf8_lossy(&output.stdout),
                                        String::from_utf8_lossy(&output.stderr)
                                    ),
                                    exit_code: output.status.code(),
                                    success: output.status.success(),
                                    duration_ms,
                                },
                                Err(error) => TaskOutcome::Ran {
                                    hash,
                                    output: error.to_string(),
                                    exit_code: Some(1),
                                    success: false,
                                    duration_ms,
                                },
                            }
                        }
                    };

                    let _ = tx.send((index, outcome));
                });
            }

            if inflight == 0 {
                break;
            }

            let (index, outcome) = rx.recv().unwrap();
            inflight -= 1;

            {
                let task = &mut tasks[index];
                match outcome {
                    TaskOutcome::Cached { hash, duration_ms } => {
                        task.hash = Some(hash);
                        task.duration_ms = duration_ms;
                        task.status = TaskStatus::Cached;
                    }
                    TaskOutcome::Ran {
                        hash,
                        output,
                        exit_code,
                        success,
                        duration_ms,
                    } => {
                        task.hash = hash;
                        task.output = output;
                        task.exit_code = exit_code;
                        task.duration_ms = duration_ms;
                        if success {
                            task.status = TaskStatus::Success;
                            if task.cacheable
                                && let Some(hash) = &task.hash
                                && let Some(target_key) = &task.target_key
                                && let Some(target) =
                                    all_targets.iter().find(|t| &t.key == target_key)
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
                }
            }

            done.insert(tasks[index].key.clone());
            report_finish(&tasks[index], footer);
        }
    });

    failed
}

struct TaskHashResult {
    hash: String,
    hit: Option<CacheHit>,
}

struct CacheHit {
    duration_ms: u64,
}

#[allow(clippy::too_many_arguments)]
fn try_cache_hit(
    target_key: Option<&str>,
    command: &str,
    all_targets: &[MonorepoTarget],
    root_hash: &str,
    cache_dir: &Path,
    fingerprint_memo: &FingerprintMemo,
    use_git: bool,
    file_hash_cache: &FileHashCache,
) -> Option<TaskHashResult> {
    let target_key = target_key?;
    let target = all_targets.iter().find(|t| t.key == target_key)?;

    let hash = compute_task_hash(
        target,
        command,
        all_targets,
        root_hash,
        fingerprint_memo,
        use_git,
        file_hash_cache,
    );

    let hit = read_cache_entry(cache_dir, &hash).map(|meta| {
        restore_cache_outputs(cache_dir, &meta, &target.dir);
        CacheHit {
            duration_ms: meta.duration_ms,
        }
    });

    Some(TaskHashResult { hash, hit })
}

fn report_finish(task: &Task, footer: &Footer) {
    let (lines, is_error) = finish_lines(task);

    if footer.enabled() {
        footer.task_finished(&task.label, is_error, &lines);
        return;
    }

    if is_error {
        for line in &lines {
            eprintln!("{line}");
        }
    } else {
        for line in &lines {
            println!("{line}");
        }
    }
}

fn finish_lines(task: &Task) -> (Vec<String>, bool) {
    match task.status {
        TaskStatus::Success => (
            vec![format!(
                "{} {}{}",
                style("✔").green(),
                task.label,
                style(format!("  {}", format_duration(task.duration_ms))).dim()
            )],
            false,
        ),
        TaskStatus::Failed => {
            let mut lines = vec![format!(
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
            )];
            for line in failure_excerpt(&task.output) {
                lines.push(format!("{} {line}", style("┃").red()));
            }
            (lines, true)
        }
        TaskStatus::Cached | TaskStatus::Skipped | TaskStatus::Pending => (Vec::new(), false),
    }
}

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
