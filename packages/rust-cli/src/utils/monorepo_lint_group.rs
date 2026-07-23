//! Builds `monorepo:run`'s `lint` task group. Rust targets get one `cargo
//! clippy` task per crate target (`--lib`, `--bins`, `--examples`,
//! `--benches`, one `--test <name>` per spec file) instead of a single
//! `--all-targets` run, since clippy's unit of work is a compilation target,
//! not an arbitrary source file. Every other target gets a single
//! whole-project `tsc --noEmit` task (type-checking isn't meaningful scoped
//! to one file) plus a single whole-directory `biome lint .` task: unlike
//! clippy, `biome` pays a fixed per-invocation cost that dwarfs the cost of
//! one more file, so splitting it per file (as `fmt` briefly did) made a
//! full-workspace lint run several times slower, not faster.

use std::path::Path;

use super::monorepo_task::{Task, TaskStatus};
use super::monorepo_test_group::collect_test_files;
use crate::utils::monorepo_fmt_group::collect_fmt_files;
use crate::utils::{MonorepoTarget, is_rust_module, resolve_biome_command, resolve_tsc_command};

pub(crate) const LINT_COMMAND: &str = "lint";

/// True when `dir` exists and directly contains at least one `.rs` file
/// (non-recursive — matches how Cargo discovers `src/bin/*.rs`,
/// `examples/*.rs` and `benches/*.rs` targets).
fn dir_has_rs_files(dir: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    entries
        .flatten()
        .any(|e| e.path().extension().and_then(|e| e.to_str()) == Some("rs"))
}

/// Builds one `cargo clippy` task scoped to a single crate target (`--lib`,
/// `--bins`, `--examples`, `--benches` or `--test <name>`) instead of the
/// whole crate, so Cargo's own target types become the unit of parallelism —
/// the direct equivalent of splitting `test` by file, since clippy (like
/// rustc) can only meaningfully lint a compilation target, not an arbitrary
/// source file.
fn push_clippy_task(tasks: &mut Vec<Task>, target: &MonorepoTarget, suffix: &str, flag: &[&str]) {
    let mut argv = vec!["cargo".to_string(), "clippy".to_string()];
    argv.extend(flag.iter().map(|s| s.to_string()));
    argv.push("--quiet".to_string());
    tasks.push(Task {
        key: format!("{}#{LINT_COMMAND}#{suffix}", target.key),
        label: format!("{}:{LINT_COMMAND}:{suffix}", target.name),
        target_key: Some(target.key.clone()),
        command: format!("{LINT_COMMAND}:{suffix}"),
        cwd: target.dir.clone(),
        argv,
        cacheable: true,
        deps: Vec::new(),
        status: TaskStatus::Pending,
        output: String::new(),
        exit_code: None,
        duration_ms: 0,
        hash: None,
    });
}

/// One `cargo clippy` task per crate target (lib, bins, examples, benches,
/// and one per `tests/<name>_spec.rs`) instead of a single `--all-targets`
/// run. Falls back to one `--all-targets` task if nothing recognizable was
/// found, so a crate with an unconventional layout still gets linted.
fn build_rust_lint_tasks(target: &MonorepoTarget) -> Vec<Task> {
    let mut tasks = Vec::new();

    if target.dir.join("src/lib.rs").is_file() {
        push_clippy_task(&mut tasks, target, "lib", &["--lib"]);
    }
    if target.dir.join("src/main.rs").is_file() || dir_has_rs_files(&target.dir.join("src/bin")) {
        push_clippy_task(&mut tasks, target, "bins", &["--bins"]);
    }
    if dir_has_rs_files(&target.dir.join("examples")) {
        push_clippy_task(&mut tasks, target, "examples", &["--examples"]);
    }
    if dir_has_rs_files(&target.dir.join("benches")) {
        push_clippy_task(&mut tasks, target, "benches", &["--benches"]);
    }
    for file in collect_test_files(target) {
        let stem = file
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_string();
        push_clippy_task(&mut tasks, target, &stem, &["--test", &stem]);
    }

    if tasks.is_empty() {
        push_clippy_task(&mut tasks, target, "all", &["--all-targets"]);
    }

    tasks
}

// Splits each non-Rust target's `lint` script into two independently
// cacheable/parallel tasks — a whole-project `tsc --noEmit` type-check plus
// a whole-directory `biome lint .` — instead of the single combined
// `tsc --noEmit && bunx biome lint` invocation the TypeScript CLI runs, so a
// tsc-only or biome-only change doesn't force re-running the other. Rust
// targets skip straight to `build_rust_lint_tasks`, since clippy's unit of
// work is a crate target, not a source file. Targets without the `lint`
// script, or without anything to lint, are marked skipped up front. `lint`
// stays order-independent (it's listed in `ORDER_INDEPENDENT_COMMANDS`), so no
// task here carries dependency edges.
pub(crate) fn build_lint_group(targets: &[MonorepoTarget]) -> Vec<Task> {
    let mut tasks: Vec<Task> = Vec::new();

    for target in targets {
        if !target.scripts.contains_key(LINT_COMMAND) {
            tasks.push(Task {
                key: format!("{}#{LINT_COMMAND}", target.key),
                label: format!("{}:{LINT_COMMAND}", target.name),
                target_key: Some(target.key.clone()),
                command: LINT_COMMAND.to_string(),
                cwd: target.dir.clone(),
                argv: Vec::new(),
                cacheable: false,
                deps: Vec::new(),
                status: TaskStatus::Skipped,
                output: String::new(),
                exit_code: None,
                duration_ms: 0,
                hash: None,
            });
            continue;
        }

        if is_rust_module(&target.dir) {
            tasks.extend(build_rust_lint_tasks(target));
            continue;
        }

        let mut target_tasks = Vec::new();
        if target.dir.join("tsconfig.json").is_file() {
            let mut argv = resolve_tsc_command(&target.dir);
            argv.push("--noEmit".to_string());
            target_tasks.push(Task {
                key: format!("{}#{LINT_COMMAND}#tsc", target.key),
                label: format!("{}:{LINT_COMMAND}:tsc", target.name),
                target_key: Some(target.key.clone()),
                command: format!("{LINT_COMMAND}:tsc"),
                cwd: target.dir.clone(),
                argv,
                cacheable: true,
                deps: Vec::new(),
                status: TaskStatus::Pending,
                output: String::new(),
                exit_code: None,
                duration_ms: 0,
                hash: None,
            });
        }
        if !collect_fmt_files(target).is_empty() {
            let mut argv = resolve_biome_command(&target.dir);
            argv.push("lint".to_string());
            argv.push(".".to_string());
            target_tasks.push(Task {
                key: format!("{}#{LINT_COMMAND}#biome", target.key),
                label: format!("{}:{LINT_COMMAND}:biome", target.name),
                target_key: Some(target.key.clone()),
                command: format!("{LINT_COMMAND}:biome"),
                cwd: target.dir.clone(),
                argv,
                cacheable: true,
                deps: Vec::new(),
                status: TaskStatus::Pending,
                output: String::new(),
                exit_code: None,
                duration_ms: 0,
                hash: None,
            });
        }

        if target_tasks.is_empty() {
            tasks.push(Task {
                key: format!("{}#{LINT_COMMAND}", target.key),
                label: format!("{}:{LINT_COMMAND}", target.name),
                target_key: Some(target.key.clone()),
                command: LINT_COMMAND.to_string(),
                cwd: target.dir.clone(),
                argv: Vec::new(),
                cacheable: false,
                deps: Vec::new(),
                status: TaskStatus::Skipped,
                output: String::new(),
                exit_code: None,
                duration_ms: 0,
                hash: None,
            });
        } else {
            tasks.extend(target_tasks);
        }
    }

    tasks
}
