use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::time::Instant;

use clap::Args;
use console::style;

use crate::utils::{
    Loader, LoaderGroup, SchedulerContext, TargetType, WorkspaceTarget, build_group, current_dir,
    default_concurrency, discover_targets, error, hash_root_inputs, is_git_workspace_root,
    load_cache_index, load_file_hash_cache, print_task_report, run_group, save_file_hash_cache,
    sort_targets_by_dependencies,
};

/// `test` runs a single, order-independent command, so it keeps its own
/// fingerprint cache instead of sharing `workspace:run`'s — a `--no-cache`
/// build or a stale fmt result never has a reason to invalidate a clean test
/// run, or the other way around.
const TEST_CACHE_DIR: &str = "var/cache/test";

/// How many module suites run at once when `--concurrency` says nothing else.
/// A suite is not a single process — every module's `test` script is a
/// `bun test --parallel` of its own — so one suite per core spawns several
/// times the machine's worth of workers and finishes later than a bounded
/// fan-out does.
const MAX_CONCURRENCY: usize = 8;

#[derive(Args, Debug)]
pub struct TestArgs {
    #[arg(long)]
    pub packages: Option<String>,
    #[arg(long)]
    pub modules: Option<String>,
    #[arg(long, default_value_t = false)]
    pub logs: bool,
    #[arg(long, default_value_t = false)]
    pub no_cache: bool,
    /// How many module suites run at once (defaults to the core count, capped at 8).
    #[arg(long)]
    pub concurrency: Option<usize>,
    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &TestArgs) {
    if !execute(args) {
        std::process::exit(1);
    }
}

fn load_test_state(
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

pub fn execute(args: &TestArgs) -> bool {
    let root_dir = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let cache_dir = root_dir.join(TEST_CACHE_DIR);

    let spinner = crate::utils::Spinner::start("Analyzing workspace");
    let (all_targets, root_hash, use_git, file_hash_cache, cache_index) =
        load_test_state(&root_dir, &cache_dir);
    spinner.stop();

    let file_hash_entries_before = file_hash_cache.len();

    let Some(targets) = filter_targets(
        &all_targets,
        args.packages.as_deref(),
        args.modules.as_deref(),
    ) else {
        return false;
    };
    if targets.is_empty() {
        error("No packages or modules found to run");
        return false;
    }

    let sorted = sort_targets_by_dependencies(&targets);
    let included_keys: HashSet<String> = sorted.iter().map(|t| t.key.clone()).collect();

    let mut group = build_group(&sorted, &included_keys, "test");
    if group.is_empty() {
        println!(
            "{}{}",
            style("↷ ").yellow(),
            style("Skipped test (no such script)").dim()
        );
        return true;
    }

    println!(
        "{}{}{}",
        style("▸ ").magenta(),
        style("test").magenta().bold(),
        style(format!(
            "  {} task{} across {} target{}",
            group.len(),
            if group.len() == 1 { "" } else { "s" },
            sorted.len(),
            if sorted.len() == 1 { "" } else { "s" },
        ))
        .dim()
    );

    let by_key: HashMap<&str, &WorkspaceTarget> =
        all_targets.iter().map(|t| (t.key.as_str(), t)).collect();

    let started_at = Instant::now();
    let loader = Loader::start(vec![LoaderGroup::new("Test", group.len())]);
    let any_failed = run_group(
        &mut group,
        SchedulerContext {
            by_key: &by_key,
            root_dir: &root_dir,
            root_hash: &root_hash,
            cache_dir: &cache_dir,
            fingerprint_memo: &crate::utils::FingerprintMemo::new(),
            use_git,
            no_cache: args.no_cache,
            file_hash_cache: &file_hash_cache,
            cache_index: &cache_index,
            loader: &loader,
            loader_group: 0,
            concurrency: Some(resolve_concurrency(args.concurrency)),
        },
    );
    loader.stop();

    if !args.no_cache && file_hash_cache.len() != file_hash_entries_before {
        save_file_hash_cache(&cache_dir, &file_hash_cache);
    }

    print_task_report(
        "Test report",
        &group,
        args.logs,
        started_at.elapsed().as_millis() as u64,
    );

    !any_failed
}

/// How many suites run at once: what `--concurrency` asked for, or the core
/// count held to [`MAX_CONCURRENCY`].
fn resolve_concurrency(requested: Option<usize>) -> usize {
    match requested {
        Some(requested) => requested.max(1),
        None => default_concurrency().min(MAX_CONCURRENCY),
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
