//! Builds `monorepo:run`'s `fmt` task group: one task per source file rather
//! than per target, so every file formats concurrently instead of a single
//! `cargo fmt`/`bunx biome check --write` invocation walking the whole
//! target serially. Rust targets run `cargo fmt -- <file>` per `.rs` file;
//! every other target runs `bunx biome check --write <file>` per matching
//! source file.

use std::path::PathBuf;

use super::monorepo_task::{Task, TaskStatus};
use crate::utils::{MonorepoTarget, is_rust_module};

pub(crate) const FMT_COMMAND: &str = "fmt";

/// Directories `fmt`'s per-file walk never descends into: build artifacts,
/// dependency folders and caches, none of which hold source worth formatting.
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

/// Non-Rust file extensions `fmt`'s per-file walk treats as formattable
/// (mirrors what `bunx biome check --write` would pick up across a target).
const FMT_WEB_EXTENSIONS: &[&str] = &["ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "jsonc"];

/// Formattable files under a target's whole directory, as paths relative to
/// the target's directory: `.rs` files for Rust targets, common web source
/// (`.ts`/`.tsx`/`.js`/`.jsx`/`.mjs`/`.cjs`/`.json`/`.jsonc`) for everything
/// else. Scanned recursively, skipping build/dependency folders.
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

// One task per source file rather than per target, so every file formats
// concurrently instead of a single `cargo fmt`/`bunx biome check --write`
// invocation walking the whole target serially. Rust targets run
// `cargo fmt -- <file>` per `.rs` file; every other target runs
// `bunx biome check --write <file>` per matching source file. Targets
// without the `fmt` script, or without any formattable files, are marked
// skipped up front. `fmt` stays order-independent (it's listed in
// `ORDER_INDEPENDENT_COMMANDS`), so file tasks carry no dependency edges.
pub(crate) fn build_fmt_group(targets: &[MonorepoTarget]) -> Vec<Task> {
    let mut tasks: Vec<Task> = Vec::new();

    for target in targets {
        let has_script = target.scripts.contains_key(FMT_COMMAND);
        let fmt_files = if has_script {
            collect_fmt_files(target)
        } else {
            Vec::new()
        };

        if fmt_files.is_empty() {
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

        let is_rust = is_rust_module(&target.dir);
        for file in &fmt_files {
            let rel = file.to_string_lossy().replace('\\', "/");
            let argv = if is_rust {
                vec![
                    "cargo".to_string(),
                    "fmt".to_string(),
                    "--".to_string(),
                    rel.clone(),
                ]
            } else {
                vec![
                    "bunx".to_string(),
                    "biome".to_string(),
                    "check".to_string(),
                    "--write".to_string(),
                    format!("./{rel}"),
                ]
            };
            // The command discriminator feeds the cache-content hash, so it
            // must carry the file identity too, otherwise every file task
            // for a target would collide on the same cache entry.
            tasks.push(Task {
                key: format!("{}#{FMT_COMMAND}#{rel}", target.key),
                label: format!("{}:{FMT_COMMAND}:{rel}", target.name),
                target_key: Some(target.key.clone()),
                command: format!("{FMT_COMMAND}:{rel}"),
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
