use std::collections::HashSet;
use std::path::PathBuf;
use std::time::Instant;

use clap::Args;
use console::style;

use crate::utils::{
    FingerprintMemo, Footer, INSTALL_COMMAND, MONOREPO_CACHE_DIR, MonorepoTarget, TargetType, Task,
    TaskStatus, build_group, build_install_group, current_dir, discover_targets, format_duration,
    hash_root_inputs, is_git_workspace_root, load_file_hash_cache, run_group, save_file_hash_cache,
    sort_targets_by_dependencies,
};

#[derive(Args, Debug, Default, Clone)]
pub struct MonorepoRunArgs {
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

pub fn run(args: &MonorepoRunArgs) {
    if !execute(args) {
        std::process::exit(1);
    }
}

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

    let footer = Footer::start(total_tasks);

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
            &footer,
        );
        if group_failed {
            stopped = true;
            any_failed = true;
        }
    }

    footer.stop();

    if !args.no_cache && file_hash_cache.len() != file_hash_entries_before {
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
