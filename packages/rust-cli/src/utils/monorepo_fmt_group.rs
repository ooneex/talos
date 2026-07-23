//! Builds `monorepo:run`'s `fmt` task group: one whole-crate `cargo fmt`
//! task per Rust target, one whole-directory `bunx biome check --write .`
//! task per every other target. Both tools pay a fixed per-invocation cost
//! (cargo resolving the workspace; biome loading `biome.jsonc` and walking
//! the project) that dwarfs the marginal cost of formatting one more file,
//! so a per-file split was tried and reverted: `cargo fmt -- <file>` and a
//! plain `cargo fmt` cost the same ~130ms regardless of file count, and
//! `bunx biome check --write <file>` likewise cost the same as running it
//! against the whole directory — so one process per crate/package beats one
//! process per file by several times across a large workspace.

use std::path::PathBuf;

use super::monorepo_task::{Task, TaskStatus};
use crate::utils::{MonorepoTarget, is_rust_module, resolve_biome_command};

pub(crate) const FMT_COMMAND: &str = "fmt";

/// Directories `fmt`'s file walk never descends into: build artifacts,
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

/// Non-Rust file extensions `fmt`'s file walk treats as formattable (mirrors
/// what `bunx biome check --write` would pick up across a target).
const FMT_WEB_EXTENSIONS: &[&str] = &["ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "jsonc"];

/// Formattable files under a target's whole directory, as paths relative to
/// the target's directory: `.rs` files for Rust targets, common web source
/// (`.ts`/`.tsx`/`.js`/`.jsx`/`.mjs`/`.cjs`/`.json`/`.jsonc`) for everything
/// else. Scanned recursively, skipping build/dependency folders. Used only
/// to decide whether a target has anything to format at all — the actual
/// `fmt` task always runs against the whole target directory in one shot.
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

// One whole-crate `cargo fmt` task per Rust target, one whole-directory
// `biome check --write .` task per every other target — see the module doc
// comment for why per-file splitting doesn't help here. Targets without the
// `fmt` script, or without any formattable files, are marked skipped up
// front. `fmt` stays order-independent (it's listed in
// `ORDER_INDEPENDENT_COMMANDS`), so no task here carries dependency edges.
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
