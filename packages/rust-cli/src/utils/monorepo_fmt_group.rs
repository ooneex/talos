use std::path::PathBuf;

use super::monorepo_task::{Task, TaskStatus};
use crate::utils::{MonorepoTarget, is_rust_module, resolve_biome_command};

pub(crate) const FMT_COMMAND: &str = "fmt";

const FMT_EXCLUDED_DIRS: &[&str] = &[
    "node_modules",
    "dist",
    "target",
    "var",
    "coverage",
    ".git",
    ".temp",
    ".turbo",
];

const FMT_WEB_EXTENSIONS: &[&str] = &["ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "jsonc"];

pub(crate) fn collect_fmt_files(target: &MonorepoTarget) -> Vec<PathBuf> {
    let is_rust = is_rust_module(&target.dir);
    let mut files = Vec::new();
    let mut stack = vec![target.dir.clone()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if path.is_dir() {
                if !FMT_EXCLUDED_DIRS.contains(&name_str.as_ref()) {
                    stack.push(path);
                }
                continue;
            }
            let ext_matches = path
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|ext| {
                    if is_rust {
                        ext == "rs"
                    } else {
                        FMT_WEB_EXTENSIONS.contains(&ext)
                    }
                });
            if ext_matches && let Ok(rel) = path.strip_prefix(&target.dir) {
                files.push(rel.to_path_buf());
            }
        }
    }
    files.sort();
    files
}

pub(crate) fn build_fmt_group(targets: &[MonorepoTarget]) -> Vec<Task> {
    let mut tasks: Vec<Task> = Vec::new();

    for target in targets {
        let has_script = target.scripts.contains_key(FMT_COMMAND);
        let has_fmt_files = has_script && !collect_fmt_files(target).is_empty();

        if !has_fmt_files {
            tasks.push(Task {
                key: format!("{}#{FMT_COMMAND}", target.key),
                label: format!("{}:{FMT_COMMAND}", target.name),
                target_key: Some(target.key.clone()),
                command: FMT_COMMAND.to_string(),
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

        let argv = if is_rust_module(&target.dir) {
            vec!["cargo".to_string(), "fmt".to_string()]
        } else {
            let mut argv = resolve_biome_command(&target.dir);
            argv.push("check".to_string());
            argv.push("--write".to_string());
            argv.push(".".to_string());
            argv
        };
        tasks.push(Task {
            key: format!("{}#{FMT_COMMAND}", target.key),
            label: format!("{}:{FMT_COMMAND}", target.name),
            target_key: Some(target.key.clone()),
            command: FMT_COMMAND.to_string(),
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

    tasks
}
