use std::collections::HashSet;
use std::path::PathBuf;
use std::time::Instant;

use clap::Args;
use console::style;

use crate::utils::{
    FingerprintMemo, Footer, INSTALL_COMMAND, SchedulerContext, TargetType, Task, TaskStatus,
    WORKSPACE_CACHE_DIR, WorkspaceTarget, build_group, build_install_group, current_dir,
    discover_targets, format_duration, hash_root_inputs, is_git_workspace_root, load_cache_index,
    load_file_hash_cache, run_group, save_file_hash_cache, sort_targets_by_dependencies,
};

#[derive(Args, Debug, Default, Clone)]
pub struct WorkspaceRunArgs {
    #[arg(long)]
    pub commands: Option<String>,

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

pub fn run(args: &WorkspaceRunArgs) {
    if !execute(args) {
        std::process::exit(1);
    }
}

fn load_workspace_state(
    root_dir: &std::path::Path,
    cache_dir: &std::path::Path,
) -> (
    Vec<WorkspaceTarget>,
    String,
    bool,
    crate::utils::FileHashCache,
    crate::utils::CacheIndex,
) {
    std::thread::scope(|scope| {
        let targets_handle = scope.spawn(|| discover_targets(root_dir));
        let root_hash_handle = scope.spawn(|| hash_root_inputs(root_dir));
        let use_git_handle = scope.spawn(|| is_git_workspace_root(root_dir));
        let cache_handle = scope.spawn(|| load_file_hash_cache(cache_dir));
        let index_handle = scope.spawn(|| load_cache_index(cache_dir));

        let all_targets = targets_handle
            .join()
            .unwrap_or_else(|_| discover_targets(root_dir));
        let root_hash = root_hash_handle
            .join()
            .unwrap_or_else(|_| hash_root_inputs(root_dir));
        let use_git = use_git_handle
            .join()
            .unwrap_or_else(|_| is_git_workspace_root(root_dir));
        let file_hash_cache = cache_handle
            .join()
            .unwrap_or_else(|_| load_file_hash_cache(cache_dir));
        let cache_index = index_handle
            .join()
            .unwrap_or_else(|_| load_cache_index(cache_dir));

        (
            all_targets,
            root_hash,
            use_git,
            file_hash_cache,
            cache_index,
        )
    })
}

/// Builds one task group per command, dropping (and printing a notice for)
/// any command no target declares a script for.
fn plan_task_groups(
    commands: &[String],
    sorted: &[WorkspaceTarget],
    included_keys: &HashSet<String>,
    root_dir: &std::path::Path,
) -> (Vec<String>, Vec<Vec<Task>>) {
    let mut planned: Vec<(String, Vec<Task>)> = commands
        .iter()
        .map(|command| {
            let group = if command == INSTALL_COMMAND {
                build_install_group(root_dir)
            } else {
                build_group(sorted, included_keys, command)
            };
            (command.clone(), group)
        })
        .collect();

    let missing: Vec<String> = planned
        .iter()
        .filter(|(_, group)| group.is_empty())
        .map(|(command, _)| command.clone())
        .collect();
    planned.retain(|(_, group)| !group.is_empty());

    if !missing.is_empty() {
        println!(
            "{}{}",
            style("↷ ").yellow(),
            style(format!("Skipped {} (no such script)", missing.join(", "))).dim()
        );
    }

    planned.into_iter().unzip()
}

/// Prints the closing "✔ Ran ..." line summarizing how many tasks ran,
/// were cached, or were skipped, and how long the run took.
fn print_completion_summary(ran_commands: &[String], groups: &[Vec<Task>], started_at: Instant) {
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
    println!(
        "{}{}",
        style(format!("✔ Ran {}", ran_commands.join(", "))).green(),
        style(format!(
            "  {}  in {}",
            parts.join(" · "),
            format_duration(started_at.elapsed().as_millis() as u64)
        ))
        .dim()
    );
}

/// Prints the "▸ commands  N tasks across M targets" header line.
fn print_run_header(ran_commands: &[String], total_tasks: usize, target_count: usize) {
    println!(
        "{}{}{}",
        style("▸ ").magenta(),
        style(ran_commands.join(", ")).magenta().bold(),
        style(format!(
            "  {} task{} across {} target{}",
            total_tasks,
            if total_tasks == 1 { "" } else { "s" },
            target_count,
            if target_count == 1 { "" } else { "s" },
        ))
        .dim()
    );
}

/// Runs every task group in order, stopping at the first failed group.
/// Returns whether any group failed.
#[allow(clippy::too_many_arguments)]
fn run_all_groups(
    groups: &mut [Vec<Task>],
    all_targets: &[WorkspaceTarget],
    root_dir: &std::path::Path,
    root_hash: &str,
    cache_dir: &std::path::Path,
    use_git: bool,
    no_cache: bool,
    file_hash_cache: &crate::utils::FileHashCache,
    cache_index: &crate::utils::CacheIndex,
    footer: &Footer,
) -> bool {
    let mut any_failed = false;
    let fingerprint_memo = FingerprintMemo::new();
    for group in groups.iter_mut() {
        if any_failed {
            break;
        }
        let group_failed = run_group(
            group,
            SchedulerContext {
                all_targets,
                root_dir,
                root_hash,
                cache_dir,
                fingerprint_memo: &fingerprint_memo,
                use_git,
                no_cache,
                file_hash_cache,
                cache_index,
                footer,
            },
        );
        if group_failed {
            any_failed = true;
        }
    }
    any_failed
}

pub fn execute(args: &WorkspaceRunArgs) -> bool {
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
    let cache_dir = root_dir.join(WORKSPACE_CACHE_DIR);

    let spinner = crate::utils::Spinner::start("Analyzing workspace");
    let (all_targets, root_hash, use_git, file_hash_cache, cache_index) =
        load_workspace_state(&root_dir, &cache_dir);
    spinner.stop();

    let file_hash_entries_before = file_hash_cache.len();

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

    // A command no target declares in its `package.json` scripts is skipped
    // instead of failing, so a shared command list stays usable across
    // workspaces where only some modules define every script.
    let (ran_commands, mut groups) =
        plan_task_groups(&commands, &sorted, &included_keys, &root_dir);
    if groups.is_empty() {
        return true;
    }

    let total_tasks: usize = groups.iter().map(|g| g.len()).sum();
    print_run_header(&ran_commands, total_tasks, sorted.len());

    let started_at = Instant::now();
    let footer = Footer::start(total_tasks);
    let any_failed = run_all_groups(
        &mut groups,
        &all_targets,
        &root_dir,
        &root_hash,
        &cache_dir,
        use_git,
        args.no_cache,
        &file_hash_cache,
        &cache_index,
        &footer,
    );
    footer.stop();

    if !args.no_cache && file_hash_cache.len() != file_hash_entries_before {
        save_file_hash_cache(&cache_dir, &file_hash_cache);
    }

    if any_failed {
        return false;
    }

    print_completion_summary(&ran_commands, &groups, started_at);
    true
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
