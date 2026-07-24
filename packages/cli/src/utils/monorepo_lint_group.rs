use std::path::Path;

use super::monorepo_task::{Task, TaskStatus};
use super::monorepo_test_group::collect_test_files;
use crate::utils::monorepo_fmt_group::collect_fmt_files;
use crate::utils::{MonorepoTarget, is_rust_module, resolve_biome_command, resolve_tsc_command};

pub(crate) const LINT_COMMAND: &str = "lint";

fn dir_has_rs_files(dir: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    entries
        .flatten()
        .any(|e| e.path().extension().and_then(|e| e.to_str()) == Some("rs"))
}

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
