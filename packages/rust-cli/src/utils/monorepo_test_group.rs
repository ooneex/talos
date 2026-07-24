use std::collections::HashSet;
use std::path::PathBuf;

use regex::Regex;

use super::monorepo_task::{Task, TaskStatus};
use crate::utils::{MonorepoTarget, is_rust_module};

pub(crate) const TEST_COMMAND: &str = "test";

pub(crate) fn collect_test_files(target: &MonorepoTarget) -> Vec<PathBuf> {
    let tests_dir = target.dir.join("tests");
    let mut files = Vec::new();

    if is_rust_module(&target.dir) {
        let Ok(entries) = std::fs::read_dir(&tests_dir) else {
            return files;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file()
                && path.extension().and_then(|e| e.to_str()) == Some("rs")
                && let Ok(rel) = path.strip_prefix(&target.dir)
            {
                files.push(rel.to_path_buf());
            }
        }
    } else {
        let is_test_file = Regex::new(r"[._](?:test|spec)\.[cm]?[jt]sx?$").unwrap();
        let mut stack = vec![tests_dir];
        while let Some(dir) = stack.pop() {
            let Ok(entries) = std::fs::read_dir(&dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                if path.is_file() && is_test_file.is_match(&name_str) {
                    if let Ok(rel) = path.strip_prefix(&target.dir) {
                        files.push(rel.to_path_buf());
                    }
                } else if path.is_dir() && name_str != "node_modules" {
                    stack.push(path);
                }
            }
        }
    }

    files.sort();
    files
}

pub(crate) fn build_test_group(
    targets: &[MonorepoTarget],
    _included_keys: &HashSet<String>,
) -> Vec<Task> {
    let mut tasks: Vec<Task> = Vec::new();

    for target in targets {
        let has_script = target.scripts.contains_key(TEST_COMMAND);
        let test_files = if has_script {
            collect_test_files(target)
        } else {
            Vec::new()
        };

        if test_files.is_empty() {
            let key = format!("{}#{TEST_COMMAND}", target.key);
            tasks.push(Task {
                key: key.clone(),
                label: format!("{}:{TEST_COMMAND}", target.name),
                target_key: Some(target.key.clone()),
                command: TEST_COMMAND.to_string(),
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

        let is_rust = is_rust_module(&target.dir);
        for file in &test_files {
            let stem = file
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or_default()
                .to_string();
            let argv = if is_rust {
                vec![
                    "cargo".to_string(),
                    "test".to_string(),
                    "--test".to_string(),
                    stem.clone(),
                ]
            } else {
                let rel = file.to_string_lossy().replace('\\', "/");
                vec!["bun".to_string(), "test".to_string(), format!("./{rel}")]
            };
            let key = format!("{}#{TEST_COMMAND}#{stem}", target.key);
            tasks.push(Task {
                key,
                label: format!("{}:{TEST_COMMAND}:{stem}", target.name),
                target_key: Some(target.key.clone()),
                command: format!("{TEST_COMMAND}:{stem}"),
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
    }

    tasks
}
