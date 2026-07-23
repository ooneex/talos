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
//!
//! The task model, per-command group builders (`test`/`fmt`/`lint`/generic),
//! and the cache-aware scheduler that actually runs them all live under
//! `crate::utils` (`monorepo_task`, `monorepo_test_group`,
//! `monorepo_fmt_group`, `monorepo_lint_group`, `monorepo_group`,
//! `monorepo_scheduler`) — this file is just the command's argument parsing
//! and top-level orchestration.

use std::collections::HashSet;
use std::path::PathBuf;
use std::time::Instant;

use clap::Args;
use console::style;

use crate::utils::{
    FingerprintMemo, INSTALL_COMMAND, MONOREPO_CACHE_DIR, MonorepoTarget, TargetType, Task,
    TaskStatus, build_group, build_install_group, current_dir, discover_targets, format_duration,
    hash_root_inputs, is_git_workspace_root, load_file_hash_cache, run_group, save_file_hash_cache,
    sort_targets_by_dependencies,
};

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
