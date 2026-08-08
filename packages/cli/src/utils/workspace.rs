use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

mod cache;
pub use cache::{
    CacheEntryMeta, CacheIndex, FileHashCache, FingerprintMemo, compute_task_hash,
    fingerprint_target, hash_root_inputs, load_cache_index, load_file_hash_cache, read_cache_entry,
    save_file_hash_cache, write_cache_entry,
};

pub const WORKSPACE_CACHE_VERSION: u32 = 2;
pub const WORKSPACE_CACHE_DIR: &str = "var/cache/workspace";

const TARGET_ROOTS: &[(&str, TargetType)] = &[
    ("packages", TargetType::Package),
    ("modules", TargetType::Module),
];

const EXCLUDED_DIRS: &[&str] = &[
    "node_modules",
    "dist",
    "var",
    "coverage",
    "__pycache__",
    "venv",
    ".git",
    ".temp",
    ".turbo",
    ".venv",
    ".tox",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
];

pub(super) const ROOT_INPUT_FILES: &[&str] =
    &["package.json", "bun.lock", "tsconfig.json", "biome.jsonc"];

/// The workspace commands a Rust crate answers to. A crate carrying no
/// `package.json` — or one that only wires up some of the commands — still has
/// to build, lint and test with the rest of the workspace.
const CARGO_SCRIPTS: &[(&str, &str)] = &[
    ("install", "cargo fetch"),
    ("build", "cargo build"),
    ("fmt", "cargo fmt"),
    ("lint", "cargo clippy --all-targets --quiet"),
    ("test", "cargo test"),
];

/// The same commands for a Python package, in the flavour of the tool the
/// package is actually managed with.
const UV_SCRIPTS: &[(&str, &str)] = &[
    ("install", "uv sync"),
    ("build", "uv build"),
    ("fmt", "uv run ruff format"),
    ("lint", "uv run ruff check"),
    ("test", "uv run pytest"),
];

const POETRY_SCRIPTS: &[(&str, &str)] = &[
    ("install", "poetry install"),
    ("build", "poetry build"),
    ("fmt", "poetry run ruff format"),
    ("lint", "poetry run ruff check"),
    ("test", "poetry run pytest"),
];

const PIP_SCRIPTS: &[(&str, &str)] = &[
    ("install", "python -m pip install -e ."),
    ("build", "python -m compileall -q ."),
    ("fmt", "python -m ruff format"),
    ("lint", "python -m ruff check"),
    ("test", "python -m pytest"),
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TargetType {
    Package,
    Module,
}

impl TargetType {
    pub fn as_str(&self) -> &'static str {
        match self {
            TargetType::Package => "package",
            TargetType::Module => "module",
        }
    }
}

#[derive(Clone, Debug)]
pub struct WorkspaceTarget {
    pub key: String,
    pub name: String,
    pub target_type: TargetType,
    pub dir: PathBuf,
    pub scripts: HashMap<String, String>,
    /// A target without a `package.json` gets its language defaults (cargo, uv)
    /// and runs them as-is; anything with a `package.json` goes through
    /// `bun run <script>` and owns exactly the scripts it declares.
    pub direct_scripts: bool,
    pub workspace_deps: Vec<String>,
}

#[derive(Default, Deserialize)]
struct PackageJson {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    scripts: HashMap<String, String>,
    #[serde(default)]
    dependencies: HashMap<String, String>,
    #[serde(default)]
    #[serde(rename = "devDependencies")]
    dev_dependencies: HashMap<String, String>,
    #[serde(default)]
    #[serde(rename = "peerDependencies")]
    peer_dependencies: HashMap<String, String>,
}

/// Builds the target for one workspace member directory, plus its declared
/// package name (for dependency resolution) and its raw dependency names.
/// Returns `None` when the directory isn't a recognizable target (no
/// `package.json`, `Cargo.toml`, or supported Python script layout).
fn build_target(
    root_dir: &Path,
    dir_name: &'static str,
    target_type: TargetType,
    name: String,
) -> Option<(WorkspaceTarget, Option<String>, Vec<String>)> {
    let dir = root_dir.join(dir_name).join(&name);
    let is_rust = dir.join("Cargo.toml").is_file();
    let python_scripts = python_scripts(&dir);
    let package_json = fs::read_to_string(dir.join("package.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<PackageJson>(&raw).ok());

    let has_package_json = package_json.is_some();
    let package_json = match package_json {
        Some(package_json) => package_json,
        // A crate or a Python package needs no `package.json` to be
        // part of the workspace.
        None if is_rust || python_scripts.is_some() => PackageJson::default(),
        None => return None,
    };

    let key = format!("{dir_name}/{name}");
    let pkg_name = package_json.name.clone();
    let mut deps: Vec<String> = package_json.dependencies.keys().cloned().collect();
    deps.extend(package_json.dev_dependencies.keys().cloned());
    deps.extend(package_json.peer_dependencies.keys().cloned());

    let mut scripts = package_json.scripts;
    // A `package.json` is the single source of truth for the module it
    // sits in: a command it does not declare is skipped rather than
    // guessed at. Only a target without one falls back to the defaults
    // of the language it is written in.
    if !has_package_json {
        let defaults = is_rust
            .then_some(CARGO_SCRIPTS)
            .into_iter()
            .chain(python_scripts);
        for (command, script) in defaults.flatten() {
            scripts.insert((*command).to_string(), (*script).to_string());
        }
    }

    Some((
        WorkspaceTarget {
            key,
            name,
            target_type,
            dir,
            scripts,
            direct_scripts: !has_package_json,
            workspace_deps: Vec::new(),
        },
        pkg_name,
        deps,
    ))
}

pub fn discover_targets(root_dir: &Path) -> Vec<WorkspaceTarget> {
    let mut targets: Vec<WorkspaceTarget> = Vec::new();
    let mut key_by_package_name: HashMap<String, String> = HashMap::new();
    let mut declared_deps: HashMap<String, Vec<String>> = HashMap::new();

    for (dir_name, target_type) in TARGET_ROOTS {
        let Ok(entries) = fs::read_dir(root_dir.join(dir_name)) else {
            continue;
        };
        let mut names: Vec<String> = entries
            .flatten()
            .filter(|e| e.path().is_dir())
            .filter_map(|e| e.file_name().into_string().ok())
            .collect();
        names.sort();

        for name in names {
            let Some((target, pkg_name, deps)) =
                build_target(root_dir, dir_name, *target_type, name)
            else {
                continue;
            };
            if let Some(pkg_name) = pkg_name {
                key_by_package_name.insert(pkg_name, target.key.clone());
            }
            declared_deps.insert(target.key.clone(), deps);
            targets.push(target);
        }
    }

    for target in &mut targets {
        target.workspace_deps = declared_deps
            .get(&target.key)
            .cloned()
            .unwrap_or_default()
            .iter()
            .filter_map(|name| key_by_package_name.get(name))
            .filter(|key| *key != &target.key)
            .cloned()
            .collect();
    }

    targets
}

pub fn sort_targets_by_dependencies(targets: &[WorkspaceTarget]) -> Vec<WorkspaceTarget> {
    let by_key: HashMap<&str, &WorkspaceTarget> =
        targets.iter().map(|t| (t.key.as_str(), t)).collect();
    let mut visited: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut visiting: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut sorted: Vec<WorkspaceTarget> = Vec::new();

    fn visit(
        target: &WorkspaceTarget,
        by_key: &HashMap<&str, &WorkspaceTarget>,
        visited: &mut std::collections::HashSet<String>,
        visiting: &mut std::collections::HashSet<String>,
        sorted: &mut Vec<WorkspaceTarget>,
    ) {
        if visited.contains(&target.key) || visiting.contains(&target.key) {
            return;
        }
        visiting.insert(target.key.clone());
        for dep_key in &target.workspace_deps {
            if let Some(dep) = by_key.get(dep_key.as_str()) {
                visit(dep, by_key, visited, visiting, sorted);
            }
        }
        visiting.remove(&target.key);
        visited.insert(target.key.clone());
        sorted.push(target.clone());
    }

    for target in targets {
        visit(target, &by_key, &mut visited, &mut visiting, &mut sorted);
    }

    sorted
}

fn walk_files(dir: &Path, base: &str, files: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        let rel_path = if base.is_empty() {
            name_str.to_string()
        } else {
            format!("{base}/{name_str}")
        };
        if path.is_dir() {
            if !EXCLUDED_DIRS.contains(&name_str.as_ref()) && !is_build_cache_dir(&path) {
                walk_files(&path, &rel_path, files);
            }
        } else if path.is_file() {
            files.push(rel_path);
        }
    }
}

/// The workspace commands a Python package answers to, or `None` when the
/// directory holds no Python package. The lockfile decides the flavour: it is
/// the only reliable statement of how the package is meant to be installed.
fn python_scripts(dir: &Path) -> Option<&'static [(&'static str, &'static str)]> {
    let has_manifest = [
        "pyproject.toml",
        "setup.py",
        "setup.cfg",
        "requirements.txt",
    ]
    .iter()
    .any(|manifest| dir.join(manifest).is_file());
    if !has_manifest {
        return None;
    }
    if dir.join("uv.lock").is_file() {
        return Some(UV_SCRIPTS);
    }
    if dir.join("poetry.lock").is_file() {
        return Some(POETRY_SCRIPTS);
    }
    Some(PIP_SCRIPTS)
}

/// Whether a directory is a build cache. Cargo drops a `CACHEDIR.TAG` into
/// `target/`, which is both the standard marker and the only reliable way to
/// tell a 14 GB build directory from a source directory that happens to be
/// called `target`.
fn is_build_cache_dir(path: &Path) -> bool {
    path.join("CACHEDIR.TAG").is_file()
}

pub(super) fn collect_files(dir: &Path) -> Vec<String> {
    let mut files = Vec::new();
    walk_files(dir, "", &mut files);
    files.sort();
    files
}

pub fn resolve_biome_command(start_dir: &Path) -> Vec<String> {
    resolve_local_bin(start_dir, "biome")
}

pub fn resolve_tsc_command(start_dir: &Path) -> Vec<String> {
    resolve_local_bin(start_dir, "tsc")
}

fn resolve_local_bin(start_dir: &Path, bin: &str) -> Vec<String> {
    let mut dir = start_dir.to_path_buf();
    loop {
        let candidate = dir.join(format!("node_modules/.bin/{bin}"));
        if candidate.is_file() {
            return vec![candidate.to_string_lossy().to_string()];
        }
        if !dir.pop() {
            break;
        }
    }
    vec!["bunx".to_string(), bin.to_string()]
}

pub fn is_git_workspace_root(root_dir: &Path) -> bool {
    let Some(toplevel) = crate::utils::git::toplevel(root_dir) else {
        return false;
    };
    let Ok(resolved_toplevel) = fs::canonicalize(&toplevel) else {
        return false;
    };
    let Ok(resolved_root) = fs::canonicalize(root_dir) else {
        return false;
    };
    resolved_toplevel == resolved_root
}

pub(super) fn collect_files_with_git(dir: &Path) -> Option<Vec<String>> {
    let repo = git2::Repository::discover(dir).ok()?;
    let workdir = repo.workdir()?;
    let prefix = dir.strip_prefix(workdir).ok()?;
    let prefix_str = prefix.to_string_lossy().replace('\\', "/");
    let strip = |path: &str| -> Option<String> {
        if prefix_str.is_empty() {
            Some(path.to_string())
        } else {
            path.strip_prefix(&prefix_str)
                .map(|rest| rest.trim_start_matches('/').to_string())
        }
    };

    let mut files = Vec::new();

    let index = repo.index().ok()?;
    for entry in index.iter() {
        let path = String::from_utf8_lossy(&entry.path).replace('\\', "/");
        if let Some(relative) = strip(&path) {
            files.push(relative);
        }
    }

    let mut status_options = git2::StatusOptions::new();
    status_options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false)
        .include_unmodified(false);
    if !prefix_str.is_empty() {
        status_options.pathspec(&prefix_str);
    }
    let statuses = repo.statuses(Some(&mut status_options)).ok()?;
    for status_entry in statuses.iter() {
        if !status_entry.status().contains(git2::Status::WT_NEW) {
            continue;
        }
        let Ok(path) = status_entry.path() else {
            continue;
        };
        if let Some(relative) = strip(path) {
            files.push(relative);
        }
    }

    let mut files: Vec<String> = files
        .into_iter()
        .filter(|file| {
            !file
                .split('/')
                .any(|segment| EXCLUDED_DIRS.contains(&segment))
        })
        .collect();
    files.sort();
    files.dedup();
    Some(files)
}

#[cfg(test)]
mod git_backed_file_listing_tests {
    use super::*;
    use std::process::Command;

    fn git_ls_files(dir: &Path) -> Option<Vec<String>> {
        let output = Command::new("git")
            .args([
                "ls-files",
                "--cached",
                "--others",
                "--exclude-standard",
                "-z",
            ])
            .current_dir(dir)
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut files: Vec<String> = stdout
            .split('\0')
            .filter(|s| !s.is_empty())
            .filter(|file| {
                !file
                    .split('/')
                    .any(|segment| EXCLUDED_DIRS.contains(&segment))
            })
            .map(|s| s.to_string())
            .collect();
        files.sort();
        files.dedup();
        Some(files)
    }

    #[test]
    fn collect_files_with_git_matches_the_git_cli_at_the_crate_root() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        let Some(expected) = git_ls_files(dir) else {
            return;
        };
        let actual = collect_files_with_git(dir).expect("git2 should discover the repository");
        assert_eq!(actual, expected);
    }

    #[test]
    fn collect_files_with_git_matches_the_git_cli_for_a_subdirectory() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let Some(expected) = git_ls_files(&dir) else {
            return;
        };
        let actual = collect_files_with_git(&dir).expect("git2 should discover the repository");
        assert_eq!(actual, expected);
    }

    #[test]
    fn is_git_workspace_root_matches_the_git_cli() {
        let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        assert!(!is_git_workspace_root(manifest_dir));
        let Some(toplevel) = git_ls_files(manifest_dir).map(|_| ()).and(
            Command::new("git")
                .args(["rev-parse", "--show-toplevel"])
                .current_dir(manifest_dir)
                .output()
                .ok(),
        ) else {
            return;
        };
        if !toplevel.status.success() {
            return;
        }
        let toplevel_dir = PathBuf::from(String::from_utf8_lossy(&toplevel.stdout).trim());
        assert!(is_git_workspace_root(&toplevel_dir));
    }
}
