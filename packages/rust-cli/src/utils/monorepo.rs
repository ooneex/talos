//! Monorepo task engine backing the `monorepo:run` command family. Mirrors
//! `packages/cli/src/monorepo.ts`: project discovery, a workspace dependency
//! graph and content-addressed task caching under `var/cache/monorepo/<hash>/`.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use dashmap::DashMap;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const MONOREPO_CACHE_VERSION: u32 = 1;
pub const MONOREPO_CACHE_DIR: &str = "var/cache/monorepo";

const TARGET_ROOTS: &[(&str, TargetType)] = &[
    ("packages", TargetType::Package),
    ("modules", TargetType::Module),
];

/// Build artifacts and dependency folders never participate in the input hash.
const EXCLUDED_DIRS: &[&str] = &[
    "node_modules",
    "dist",
    "var",
    "coverage",
    ".git",
    ".temp",
    ".turbo",
];

/// Root-level files whose content invalidates every task when they change.
const ROOT_INPUT_FILES: &[&str] = &["package.json", "bun.lock", "tsconfig.json", "biome.jsonc"];

const DEFAULT_OUTPUTS: &[&str] = &["dist"];

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

/// Mirrors `MonorepoTargetType`.
#[derive(Clone, Debug)]
pub struct MonorepoTarget {
    /// Unique key, e.g. `packages/billing`.
    pub key: String,
    /// Directory name, e.g. `billing`.
    pub name: String,
    pub target_type: TargetType,
    /// Absolute directory of the target.
    pub dir: PathBuf,
    pub scripts: HashMap<String, String>,
    /// Keys of other discovered targets this one depends on.
    pub workspace_deps: Vec<String>,
    /// Directories (relative to the target) captured and restored by the cache.
    pub outputs: Vec<String>,
}

#[derive(Deserialize)]
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
    #[serde(default)]
    talos: Option<TalosField>,
}

#[derive(Deserialize)]
struct TalosField {
    #[serde(default)]
    monorepo: Option<TalosMonorepoField>,
}

#[derive(Deserialize)]
struct TalosMonorepoField {
    #[serde(default)]
    outputs: Option<Vec<String>>,
}

/// Discover every package and module of the workspace rooted at `root_dir`
/// that has a `package.json`, and resolve their dependencies on one another
/// (any declared dependency whose name matches another discovered target).
pub fn discover_targets(root_dir: &Path) -> Vec<MonorepoTarget> {
    let mut targets: Vec<MonorepoTarget> = Vec::new();
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
            let dir = root_dir.join(dir_name).join(&name);
            let package_json_path = dir.join("package.json");
            let Ok(raw) = fs::read_to_string(&package_json_path) else {
                continue;
            };
            let Ok(package_json) = serde_json::from_str::<PackageJson>(&raw) else {
                continue;
            };

            let key = format!("{dir_name}/{name}");
            if let Some(pkg_name) = &package_json.name {
                key_by_package_name.insert(pkg_name.clone(), key.clone());
            }
            let mut deps: Vec<String> = package_json.dependencies.keys().cloned().collect();
            deps.extend(package_json.dev_dependencies.keys().cloned());
            deps.extend(package_json.peer_dependencies.keys().cloned());
            declared_deps.insert(key.clone(), deps);

            let outputs = package_json
                .talos
                .and_then(|t| t.monorepo)
                .and_then(|m| m.outputs)
                .unwrap_or_else(|| DEFAULT_OUTPUTS.iter().map(|s| s.to_string()).collect());

            targets.push(MonorepoTarget {
                key,
                name,
                target_type: *target_type,
                dir,
                scripts: package_json.scripts,
                workspace_deps: Vec::new(),
                outputs,
            });
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

/// Order targets so every target comes after its workspace dependencies.
/// Cycles are tolerated: members of a cycle keep their discovery order.
pub fn sort_targets_by_dependencies(targets: &[MonorepoTarget]) -> Vec<MonorepoTarget> {
    let by_key: HashMap<&str, &MonorepoTarget> =
        targets.iter().map(|t| (t.key.as_str(), t)).collect();
    let mut visited: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut visiting: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut sorted: Vec<MonorepoTarget> = Vec::new();

    fn visit(
        target: &MonorepoTarget,
        by_key: &HashMap<&str, &MonorepoTarget>,
        visited: &mut std::collections::HashSet<String>,
        visiting: &mut std::collections::HashSet<String>,
        sorted: &mut Vec<MonorepoTarget>,
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

/// Walk a directory tree, appending every hashable file as a relative path.
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
            if !EXCLUDED_DIRS.contains(&name_str.as_ref()) {
                walk_files(&path, &rel_path, files);
            }
        } else if path.is_file() {
            files.push(rel_path);
        }
    }
}

/// List every hashable file of a directory, recursively, as sorted relative paths.
fn collect_files(dir: &Path) -> Vec<String> {
    let mut files = Vec::new();
    walk_files(dir, "", &mut files);
    files.sort();
    files
}

/// True when `root_dir` is itself the top level of a git repository.
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

/// List a target's files through git: tracked files plus untracked ones that
/// are not ignored. Returns `None` when git fails. Mirrors
/// `git ls-files --cached --others --exclude-standard -z` run with `dir` as
/// the current directory (paths scoped to, and relative to, `dir`).
fn collect_files_with_git(dir: &Path) -> Option<Vec<String>> {
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

    // Tracked files (`--cached`), via the index.
    let index = repo.index().ok()?;
    for entry in index.iter() {
        let path = String::from_utf8_lossy(&entry.path).replace('\\', "/");
        if let Some(relative) = strip(&path) {
            files.push(relative);
        }
    }

    // Untracked, non-ignored files (`--others --exclude-standard`).
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
        let Some(path) = status_entry.path() else {
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

/// Hash a file's content, or `None` when it cannot be read.
fn hash_file(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Some(format!("{:x}", hasher.finalize()))
}

/// Persisted per-file content-hash record.
#[derive(Clone, Serialize, Deserialize)]
pub struct FileHashRecord {
    pub size: u64,
    #[serde(rename = "mtimeMs")]
    pub mtime_ms: f64,
    pub hash: String,
}

/// Granular, cross-run file-hash cache: an absolute path → its content hash
/// keyed by (size, mtime), so an unchanged file is never re-read. Backed by
/// `DashMap` (a sharded, lock-free-reads concurrent map) rather than a plain
/// `HashMap` behind a mutex, so targets hashed on different threads don't
/// serialize on a single global lock.
pub type FileHashCache = DashMap<String, FileHashRecord>;

/// Per-run memo of target key → content fingerprint, shared across the
/// thread pool the same way as `FileHashCache` so multiple targets can
/// fingerprint concurrently while still hashing shared dependencies once.
pub type FingerprintMemo = DashMap<String, String>;

const FILEHASH_CACHE_FILE: &str = "filehashes.json";

/// Load the persisted file-hash cache from the cache dir, or an empty one
/// when absent or corrupt.
pub fn load_file_hash_cache(cache_dir: &Path) -> FileHashCache {
    let path = cache_dir.join(FILEHASH_CACHE_FILE);
    let Ok(raw) = fs::read_to_string(&path) else {
        return FileHashCache::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

/// Persist the file-hash cache. Best-effort: a failed write only costs a
/// cold fingerprint next run.
pub fn save_file_hash_cache(cache_dir: &Path, cache: &FileHashCache) {
    let _ = fs::create_dir_all(cache_dir);
    if let Ok(json) = serde_json::to_string(cache) {
        let _ = fs::write(cache_dir.join(FILEHASH_CACHE_FILE), json);
    }
}

fn mtime_millis(metadata: &fs::Metadata) -> f64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

/// Content-hash a file, reusing the persisted hash when the file's size and
/// mtime are unchanged so an unmodified file is never re-read. Takes the
/// cache by shared reference — `DashMap` shards its locking internally, so
/// concurrent callers (different files, different targets) don't contend on
/// a single global lock the way a `Mutex<HashMap<_>>` would.
fn hash_file_cached(path: &Path, cache: &FileHashCache) -> Option<String> {
    let metadata = fs::metadata(path).ok()?;
    let size = metadata.len();
    let mtime_ms = mtime_millis(&metadata);
    let path_key = path.to_string_lossy().to_string();

    if let Some(record) = cache.get(&path_key)
        && record.size == size
        && record.mtime_ms == mtime_ms
    {
        return Some(record.hash.clone());
    }

    let hash = hash_file(path)?;
    cache.insert(
        path_key,
        FileHashRecord {
            size,
            mtime_ms,
            hash: hash.clone(),
        },
    );
    Some(hash)
}

/// Content-hash every file of a directory into a single fingerprint. Files
/// are hashed in parallel across the rayon thread pool (I/O plus SHA-256 per
/// file is independent work), then folded into the fingerprint in a fixed,
/// sorted order so the result stays deterministic regardless of thread
/// scheduling.
pub fn fingerprint_dir(dir: &Path, use_git: bool, file_hash_cache: &FileHashCache) -> String {
    let files = if use_git {
        collect_files_with_git(dir)
    } else {
        None
    }
    .unwrap_or_else(|| collect_files(dir));

    let hashes: Vec<Option<String>> = files
        .par_iter()
        .map(|file| hash_file_cached(&dir.join(file), file_hash_cache))
        .collect();

    let mut hasher = Sha256::new();
    for (file, hash) in files.iter().zip(hashes) {
        if let Some(hash) = hash {
            hasher.update(format!("{file}={hash}\n").as_bytes());
        }
    }
    format!("{:x}", hasher.finalize())
}

/// Content-hash every file of a target into a single fingerprint, memoized
/// per target key in `memo` so shared dependencies are hashed once per run.
/// `memo` and `file_hash_cache` are shared (`DashMap`) references so this
/// can safely run for several targets concurrently — a target already being
/// fingerprinted on another thread is simply recomputed rather than raced,
/// since correctness never depends on which thread wins.
pub fn fingerprint_target(
    target: &MonorepoTarget,
    memo: &FingerprintMemo,
    use_git: bool,
    file_hash_cache: &FileHashCache,
) -> String {
    if let Some(cached) = memo.get(&target.key) {
        return cached.clone();
    }
    let fingerprint = fingerprint_dir(&target.dir, use_git, file_hash_cache);
    memo.insert(target.key.clone(), fingerprint.clone());
    fingerprint
}

/// Fingerprint the root config files shared by every task of the workspace.
pub fn hash_root_inputs(root_dir: &Path) -> String {
    let mut hasher = Sha256::new();
    for name in ROOT_INPUT_FILES {
        if let Some(hash) = hash_file(&root_dir.join(name)) {
            hasher.update(format!("{name}={hash}\n").as_bytes());
        }
    }
    format!("{:x}", hasher.finalize())
}

/// Every workspace dependency reachable from the target, direct or transitive.
fn transitive_deps<'a>(
    target: &MonorepoTarget,
    by_key: &HashMap<&str, &'a MonorepoTarget>,
) -> Vec<&'a MonorepoTarget> {
    let mut seen: std::collections::HashSet<String> =
        std::collections::HashSet::from([target.key.clone()]);
    let mut queue: Vec<String> = target.workspace_deps.clone();
    let mut deps = Vec::new();

    while let Some(key) = queue.pop() {
        if seen.contains(&key) {
            continue;
        }
        seen.insert(key.clone());
        if let Some(dep) = by_key.get(key.as_str()) {
            deps.push(*dep);
            queue.extend(dep.workspace_deps.clone());
        }
    }

    deps
}

/// Compute the cache hash of one task (`target` × `command`). `memo` and
/// `file_hash_cache` are shared references so this itself may be called
/// concurrently for several targets; a target's transitive dependencies are
/// also fingerprinted in parallel here, on top of the per-file parallelism
/// inside `fingerprint_dir`.
pub fn compute_task_hash(
    target: &MonorepoTarget,
    command: &str,
    targets: &[MonorepoTarget],
    root_hash: &str,
    memo: &FingerprintMemo,
    use_git: bool,
    file_hash_cache: &FileHashCache,
) -> String {
    let by_key: HashMap<&str, &MonorepoTarget> =
        targets.iter().map(|t| (t.key.as_str(), t)).collect();
    let deps = transitive_deps(target, &by_key);
    let mut dep_lines: Vec<String> = deps
        .par_iter()
        .map(|dep| {
            format!(
                "{}={}",
                dep.key,
                fingerprint_target(dep, memo, use_git, file_hash_cache)
            )
        })
        .collect();
    dep_lines.sort();

    let self_fingerprint = fingerprint_target(target, memo, use_git, file_hash_cache);
    let script = target.scripts.get(command).cloned().unwrap_or_default();

    let mut lines = vec![
        format!("version={MONOREPO_CACHE_VERSION}"),
        format!("target={}", target.key),
        format!("command={command}"),
        format!("script={script}"),
        format!("root={root_hash}"),
        format!("self={self_fingerprint}"),
    ];
    lines.extend(dep_lines);

    let mut hasher = Sha256::new();
    hasher.update(lines.join("\n").as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Mirrors `CacheEntryMetaType`.
#[derive(Clone, Serialize, Deserialize)]
pub struct CacheEntryMeta {
    pub version: u32,
    pub target: String,
    pub command: String,
    pub hash: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
    pub outputs: Vec<String>,
}

/// Read a cache entry, returning its metadata and replayable output, or
/// `None` on miss.
pub fn read_cache_entry(cache_dir: &Path, hash: &str) -> Option<(CacheEntryMeta, String)> {
    let meta_path = cache_dir.join(hash).join("meta.json");
    let raw_meta = fs::read_to_string(&meta_path).ok()?;
    let meta: CacheEntryMeta = serde_json::from_str(&raw_meta).ok()?;
    let output = fs::read_to_string(cache_dir.join(hash).join("output.log")).unwrap_or_default();
    Some((meta, output))
}

/// Copy the cached output artifacts of an entry back into the target directory.
pub fn restore_cache_outputs(cache_dir: &Path, meta: &CacheEntryMeta, target_dir: &Path) {
    for output in &meta.outputs {
        let source = cache_dir.join(&meta.hash).join("outputs").join(output);
        if !source.exists() {
            continue;
        }
        let dest = target_dir.join(output);
        let _ = fs::remove_dir_all(&dest);
        let _ = copy_dir_recursive(&source, &dest);
    }
}

fn copy_dir_recursive(source: &Path, dest: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let dest_path = dest.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_recursive(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), &dest_path)?;
        }
    }
    Ok(())
}

/// Persist a successful task run: metadata, replayable output and the output
/// artifacts that exist. The entry is assembled in a temp directory and
/// renamed into place so a crashed run never leaves a half-written entry.
pub fn write_cache_entry(cache_dir: &Path, meta: &CacheEntryMeta, output: &str, target_dir: &Path) {
    let temp_dir = cache_dir.join(format!(".tmp-{}", meta.hash));
    let entry_dir = cache_dir.join(&meta.hash);

    let _ = fs::remove_dir_all(&temp_dir);
    let _ = fs::create_dir_all(&temp_dir);

    let mut captured_outputs: Vec<String> = Vec::new();
    for out in &meta.outputs {
        let source = target_dir.join(out);
        if !source.exists() {
            continue;
        }
        if copy_dir_recursive(&source, &temp_dir.join("outputs").join(out)).is_ok() {
            captured_outputs.push(out.clone());
        }
    }

    let mut persisted_meta = meta.clone();
    persisted_meta.outputs = captured_outputs;
    if let Ok(json) = serde_json::to_string_pretty(&persisted_meta) {
        let _ = fs::write(temp_dir.join("meta.json"), json);
    }
    let _ = fs::write(temp_dir.join("output.log"), output);

    let _ = fs::remove_dir_all(&entry_dir);
    let _ = fs::rename(&temp_dir, &entry_dir);
}

#[cfg(test)]
mod git_backed_file_listing_tests {
    use super::*;
    use std::process::Command;

    /// Ground truth via the real `git` CLI, to validate the `git2`-backed
    /// `collect_files_with_git` mirrors `git ls-files --cached --others
    /// --exclude-standard -z` scoped to `dir`.
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
            return; // not inside a git checkout (e.g. a packaged source archive)
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
