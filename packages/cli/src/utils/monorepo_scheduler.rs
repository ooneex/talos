use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::process::Command;
use std::sync::mpsc::channel;
use std::time::Instant;

use console::style;
use regex::Regex;

use super::monorepo_batch::{parse_biome_script, section_has_error, split_biome_output_by_target};
use super::monorepo_task::{Task, TaskStatus, format_duration};
use crate::utils::{
    CacheEntryMeta, CacheIndex, FileHashCache, FingerprintMemo, Footer, MONOREPO_CACHE_VERSION,
    MonorepoTarget, compute_task_hash, read_cache_entry, resolve_biome_command, write_cache_entry,
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
    root_dir: &Path,
    root_hash: &str,
    cache_dir: &Path,
    fingerprint_memo: &FingerprintMemo,
    use_git: bool,
    no_cache: bool,
    file_hash_cache: &FileHashCache,
    cache_index: &CacheIndex,
    footer: &Footer,
) -> bool {
    for task in tasks.iter() {
        if task.status == TaskStatus::Skipped {
            report_finish(task, footer);
        }
    }

    // Phase 1 batching: collapse same-tool, order-independent commands (currently
    // pure biome scripts like `fmt`) into a single process over every dirty
    // target instead of spawning `bun run` per target. Cache hits are filtered
    // first, so only the misses hit the batched tool invocation.
    let mut failed = run_biome_batch_pass(
        tasks,
        all_targets,
        root_dir,
        root_hash,
        cache_dir,
        fingerprint_memo,
        use_git,
        no_cache,
        file_hash_cache,
        cache_index,
        footer,
    );

    let mut done: HashSet<String> = tasks
        .iter()
        .filter(|t| t.status != TaskStatus::Pending)
        .map(|t| t.key.clone())
        .collect();
    let limit = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
        .max(1);
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
                            cache_index,
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
                                    cache_index,
                                    &CacheEntryMeta {
                                        version: MONOREPO_CACHE_VERSION,
                                        target: target.key.clone(),
                                        command: task.command.clone(),
                                        hash: hash.clone(),
                                        created_at: chrono::Utc::now().to_rfc3339(),
                                        duration_ms: task.duration_ms,
                                    },
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

/// Groups the still-pending tasks by their biome argument signature and, for any
/// group with more than one target, runs a single batched biome process over all
/// dirty targets. Returns `true` if any batched target failed.
#[allow(clippy::too_many_arguments)]
fn run_biome_batch_pass(
    tasks: &mut [Task],
    all_targets: &[MonorepoTarget],
    root_dir: &Path,
    root_hash: &str,
    cache_dir: &Path,
    fingerprint_memo: &FingerprintMemo,
    use_git: bool,
    no_cache: bool,
    file_hash_cache: &FileHashCache,
    cache_index: &CacheIndex,
    footer: &Footer,
) -> bool {
    let mut groups: HashMap<Vec<String>, Vec<usize>> = HashMap::new();
    for (index, task) in tasks.iter().enumerate() {
        if task.status != TaskStatus::Pending {
            continue;
        }
        let Some(target_key) = task.target_key.as_deref() else {
            continue;
        };
        let Some(target) = all_targets.iter().find(|t| t.key == target_key) else {
            continue;
        };
        let Some(script) = target.scripts.get(&task.command) else {
            continue;
        };
        let Some(args) = parse_biome_script(script) else {
            continue;
        };
        groups.entry(args).or_default().push(index);
    }

    let mut any_failed = false;
    for (biome_args, indices) in groups {
        // A single-target group has the same cost as the normal per-target path,
        // so leave it for the scheduler loop.
        if indices.len() < 2 {
            continue;
        }
        any_failed |= run_one_biome_batch(
            tasks,
            &indices,
            &biome_args,
            all_targets,
            root_dir,
            root_hash,
            cache_dir,
            fingerprint_memo,
            use_git,
            no_cache,
            file_hash_cache,
            cache_index,
            footer,
        );
    }
    any_failed
}

#[allow(clippy::too_many_arguments)]
fn run_one_biome_batch(
    tasks: &mut [Task],
    indices: &[usize],
    biome_args: &[String],
    all_targets: &[MonorepoTarget],
    root_dir: &Path,
    root_hash: &str,
    cache_dir: &Path,
    fingerprint_memo: &FingerprintMemo,
    use_git: bool,
    no_cache: bool,
    file_hash_cache: &FileHashCache,
    cache_index: &CacheIndex,
    footer: &Footer,
) -> bool {
    // Filter cache hits up front; only the misses are handed to biome.
    let mut miss_indices: Vec<usize> = Vec::new();
    let mut miss_hashes: HashMap<usize, String> = HashMap::new();
    for &index in indices {
        let hash = if tasks[index].cacheable && !no_cache {
            tasks[index].target_key.as_ref().and_then(|key| {
                all_targets.iter().find(|t| &t.key == key).map(|target| {
                    compute_task_hash(
                        target,
                        &tasks[index].command,
                        all_targets,
                        root_hash,
                        fingerprint_memo,
                        use_git,
                        file_hash_cache,
                    )
                })
            })
        } else {
            None
        };

        if let Some(hash) = &hash
            && let Some(meta) = read_cache_entry(cache_dir, cache_index, hash)
        {
            tasks[index].hash = Some(hash.clone());
            tasks[index].duration_ms = meta.duration_ms;
            tasks[index].status = TaskStatus::Cached;
            report_finish(&tasks[index], footer);
            continue;
        }

        if let Some(hash) = hash {
            miss_hashes.insert(index, hash);
        }
        miss_indices.push(index);
    }

    if miss_indices.is_empty() {
        return false;
    }

    for &index in &miss_indices {
        footer.task_started(&tasks[index].label);
    }

    let keys: Vec<String> = miss_indices
        .iter()
        .filter_map(|&index| tasks[index].target_key.clone())
        .collect();

    let mut argv = resolve_biome_command(root_dir);
    argv.extend(biome_args.iter().cloned());
    argv.extend(keys.iter().cloned());

    let started = Instant::now();
    let result = Command::new(&argv[0])
        .args(&argv[1..])
        .current_dir(root_dir)
        .output();
    let duration_ms = started.elapsed().as_millis() as u64;

    let (output, success) = match result {
        Ok(output) => (
            format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            ),
            output.status.success(),
        ),
        Err(error) => (error.to_string(), false),
    };

    let per_target = if success {
        HashMap::new()
    } else {
        split_biome_output_by_target(&output, &keys)
    };
    // Only targets whose section carries an error-severity diagnostic own the
    // failure; fixable warnings printed for a passing target must not fail it.
    let error_keys: HashSet<String> = keys
        .iter()
        .filter(|key| {
            per_target
                .get(*key)
                .is_some_and(|section| section_has_error(section))
        })
        .cloned()
        .collect();
    // When biome fails but no diagnostic maps to a specific target (e.g. a global
    // configuration error), fail every batched target so nothing slips through.
    let attribute_all = !success && error_keys.is_empty();

    let mut any_failed = false;
    for &index in &miss_indices {
        let key = tasks[index].target_key.clone().unwrap_or_default();
        let target_failed = !success && (attribute_all || error_keys.contains(&key));
        tasks[index].duration_ms = duration_ms;

        if target_failed {
            tasks[index].status = TaskStatus::Failed;
            tasks[index].exit_code = Some(1);
            tasks[index].output = per_target
                .get(&key)
                .cloned()
                .unwrap_or_else(|| output.clone());
            any_failed = true;
        } else {
            tasks[index].status = TaskStatus::Success;
            if let Some(hash) = miss_hashes.remove(&index) {
                tasks[index].hash = Some(hash.clone());
                if let Some(target) = all_targets.iter().find(|t| t.key == key) {
                    write_cache_entry(
                        cache_dir,
                        cache_index,
                        &CacheEntryMeta {
                            version: MONOREPO_CACHE_VERSION,
                            target: target.key.clone(),
                            command: tasks[index].command.clone(),
                            hash,
                            created_at: chrono::Utc::now().to_rfc3339(),
                            duration_ms,
                        },
                    );
                }
            }
        }
        report_finish(&tasks[index], footer);
    }

    any_failed
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
    cache_index: &CacheIndex,
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

    let hit = read_cache_entry(cache_dir, cache_index, &hash).map(|meta| CacheHit {
        duration_ms: meta.duration_ms,
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

pub fn finish_lines(task: &Task) -> (Vec<String>, bool) {
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

pub fn failure_excerpt(output: &str) -> Vec<String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;

    fn make_task(key: &str, target_key: &str) -> Task {
        Task {
            key: key.to_string(),
            label: key.to_string(),
            target_key: Some(target_key.to_string()),
            command: "fmt".to_string(),
            cwd: PathBuf::from("/repo"),
            argv: vec!["bun".to_string(), "run".to_string(), "fmt".to_string()],
            cacheable: false,
            deps: Vec::new(),
            status: TaskStatus::Pending,
            output: String::new(),
            exit_code: None,
            duration_ms: 0,
            hash: None,
        }
    }

    fn make_target(root: &Path, key: &str, name: &str) -> MonorepoTarget {
        let mut scripts = HashMap::new();
        scripts.insert("fmt".to_string(), "biome check --write".to_string());
        MonorepoTarget {
            key: key.to_string(),
            name: name.to_string(),
            target_type: crate::utils::TargetType::Module,
            dir: root.join(key),
            scripts,
            direct_scripts: false,
            workspace_deps: Vec::new(),
        }
    }

    fn write_executable(path: &Path, content: &str) {
        fs::create_dir_all(path.parent().expect("parent")).expect("create parent");
        fs::write(path, content).expect("write script");
        let mut permissions = fs::metadata(path).expect("metadata").permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).expect("permissions");
    }

    #[test]
    fn biome_batch_pass_marks_all_targets_successful_on_one_clean_run() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        write_executable(
            &root.path().join("node_modules/.bin/biome"),
            &format!(
                "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"{}\"\nexit 0\n",
                root.path().join("biome.log").display()
            ),
        );
        fs::create_dir_all(root.path().join("modules/app")).expect("module dir");
        fs::create_dir_all(root.path().join("modules/web")).expect("module dir");

        let mut tasks = vec![
            make_task("app#fmt", "modules/app"),
            make_task("web#fmt", "modules/web"),
        ];
        let targets = vec![
            make_target(root.path(), "modules/app", "app"),
            make_target(root.path(), "modules/web", "web"),
        ];
        let footer = Footer::start(tasks.len());

        let failed = run_biome_batch_pass(
            &mut tasks,
            &targets,
            root.path(),
            "root-hash",
            cache.path(),
            &FingerprintMemo::new(),
            false,
            true,
            &FileHashCache::new(),
            &CacheIndex::new(),
            &footer,
        );

        assert!(!failed);
        assert!(tasks.iter().all(|task| task.status == TaskStatus::Success));
        let log = fs::read_to_string(root.path().join("biome.log")).expect("log");
        assert!(log.contains("check --write modules/app modules/web"));
    }

    #[test]
    fn biome_batch_pass_attributes_global_failures_to_every_target() {
        let root = tempfile::tempdir().expect("tempdir");
        let cache = tempfile::tempdir().expect("tempdir");
        write_executable(
            &root.path().join("node_modules/.bin/biome"),
            "#!/bin/sh\necho 'global failure' >&2\nexit 1\n",
        );
        fs::create_dir_all(root.path().join("modules/app")).expect("module dir");
        fs::create_dir_all(root.path().join("modules/web")).expect("module dir");

        let mut tasks = vec![
            make_task("app#fmt", "modules/app"),
            make_task("web#fmt", "modules/web"),
        ];
        let targets = vec![
            make_target(root.path(), "modules/app", "app"),
            make_target(root.path(), "modules/web", "web"),
        ];
        let footer = Footer::start(tasks.len());

        let failed = run_biome_batch_pass(
            &mut tasks,
            &targets,
            root.path(),
            "root-hash",
            cache.path(),
            &FingerprintMemo::new(),
            false,
            true,
            &FileHashCache::new(),
            &CacheIndex::new(),
            &footer,
        );

        assert!(failed);
        assert!(tasks.iter().all(|task| task.status == TaskStatus::Failed));
        assert!(
            tasks
                .iter()
                .all(|task| task.output.contains("global failure"))
        );
    }
}
