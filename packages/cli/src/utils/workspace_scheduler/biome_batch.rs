// Batching biome invocations across targets that share the same fixable
// arguments, so `workspace:run` calls biome once per argument set instead
// of once per target — split out of the parent module to keep it under
// the file-size budget.

use std::collections::{HashMap, HashSet};
use std::process::Command;
use std::time::Instant;

use super::{SchedulerContext, report_finish};
use crate::utils::workspace_batch::{
    parse_biome_script, section_has_error, split_biome_output_by_target,
};
use crate::utils::workspace_task::{Task, TaskStatus};
use crate::utils::{
    CacheEntryMeta, WORKSPACE_CACHE_VERSION, compute_task_hash, read_cache_entry,
    resolve_biome_command, write_cache_entry,
};

pub(super) fn run_biome_batch_pass(tasks: &mut [Task], ctx: SchedulerContext) -> bool {
    let mut groups: HashMap<Vec<String>, Vec<usize>> = HashMap::new();
    for (index, task) in tasks.iter().enumerate() {
        if task.status != TaskStatus::Pending {
            continue;
        }
        let Some(target_key) = task.target_key.as_deref() else {
            continue;
        };
        let Some(target) = ctx.by_key.get(target_key) else {
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
        any_failed |= run_one_biome_batch(tasks, &indices, &biome_args, ctx);
    }
    any_failed
}

fn run_one_biome_batch(
    tasks: &mut [Task],
    indices: &[usize],
    biome_args: &[String],
    ctx: SchedulerContext,
) -> bool {
    // Filter cache hits up front; only the misses are handed to biome.
    let mut miss_indices: Vec<usize> = Vec::new();
    let mut miss_hashes: HashMap<usize, String> = HashMap::new();
    for &index in indices {
        let hash = if tasks[index].cacheable && !ctx.no_cache {
            tasks[index].target_key.as_ref().and_then(|key| {
                ctx.by_key.get(key.as_str()).map(|target| {
                    compute_task_hash(
                        target,
                        &tasks[index].command,
                        ctx.by_key,
                        ctx.root_hash,
                        ctx.fingerprint_memo,
                        ctx.use_git,
                        ctx.file_hash_cache,
                    )
                })
            })
        } else {
            None
        };

        if let Some(hash) = &hash
            && let Some(meta) = read_cache_entry(ctx.cache_dir, ctx.cache_index, hash)
        {
            tasks[index].hash = Some(hash.clone());
            tasks[index].duration_ms = meta.duration_ms;
            tasks[index].status = TaskStatus::Cached;
            report_finish(&tasks[index], ctx.footer);
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
        ctx.footer.task_started(&tasks[index].label);
    }

    let keys: Vec<String> = miss_indices
        .iter()
        .filter_map(|&index| tasks[index].target_key.clone())
        .collect();

    let mut argv = resolve_biome_command(ctx.root_dir);
    argv.extend(biome_args.iter().cloned());
    argv.extend(keys.iter().cloned());

    let started = Instant::now();
    let result = Command::new(&argv[0])
        .args(&argv[1..])
        .current_dir(ctx.root_dir)
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
                cache_batched_success(&tasks[index], &key, hash, duration_ms, ctx);
            }
        }
        report_finish(&tasks[index], ctx.footer);
    }

    any_failed
}

/// Writes a cache entry for one target of a successful batched biome run.
fn cache_batched_success(
    task: &Task,
    key: &str,
    hash: String,
    duration_ms: u64,
    ctx: SchedulerContext,
) {
    let Some(target) = ctx.by_key.get(key) else {
        return;
    };
    write_cache_entry(
        ctx.cache_dir,
        ctx.cache_index,
        &CacheEntryMeta {
            version: WORKSPACE_CACHE_VERSION,
            target: target.key.clone(),
            command: task.command.clone(),
            hash,
            created_at: chrono::Utc::now().to_rfc3339(),
            duration_ms,
        },
    );
}
