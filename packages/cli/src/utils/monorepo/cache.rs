//! File hashing, fingerprinting and cache-entry persistence for monorepo task caching.

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use dashmap::DashMap;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

use super::{
    MONOREPO_CACHE_VERSION, MonorepoTarget, ROOT_INPUT_FILES, collect_files, collect_files_with_git,
};

fn hash_file(path: &Path) -> Option<String> {
    let mut hasher = blake3::Hasher::new();
    hasher.update_mmap(path).ok()?;
    Some(hasher.finalize().to_hex().to_string())
}

#[derive(Clone, Serialize, Deserialize)]
pub struct FileHashRecord {
    pub size: u64,
    #[serde(rename = "mtimeMs")]
    pub mtime_ms: f64,
    pub hash: String,
}

pub type FileHashCache = DashMap<String, FileHashRecord>;

pub type FingerprintMemo = DashMap<String, String>;

/// Maps a task hash to the nanoid-named `<id>.json` file that stores its cache
/// entry. Built by scanning the cache directory's entry files, since the id is a
/// random nanoid and can no longer be derived from the hash.
pub type CacheIndex = DashMap<String, String>;

const FILEHASH_CACHE_FILE: &str = "filehashes.json";

pub fn load_cache_index(cache_dir: &Path) -> CacheIndex {
    let index = CacheIndex::new();
    let Ok(entries) = fs::read_dir(cache_dir) else {
        return index;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if name == FILEHASH_CACHE_FILE {
            continue;
        }
        let Some(id) = name.strip_suffix(".json") else {
            continue;
        };
        if id.starts_with(".tmp-") {
            continue;
        }
        let Ok(raw) = fs::read_to_string(&path) else {
            continue;
        };
        if let Ok(meta) = serde_json::from_str::<CacheEntryMeta>(&raw) {
            index.insert(meta.hash, id.to_string());
        }
    }
    index
}

pub fn load_file_hash_cache(cache_dir: &Path) -> FileHashCache {
    let path = cache_dir.join(FILEHASH_CACHE_FILE);
    let Ok(raw) = fs::read_to_string(&path) else {
        return FileHashCache::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

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

    let mut hasher = blake3::Hasher::new();
    for (file, hash) in files.iter().zip(hashes) {
        if let Some(hash) = hash {
            hasher.update(format!("{file}={hash}\n").as_bytes());
        }
    }
    hasher.finalize().to_hex().to_string()
}

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

pub fn hash_root_inputs(root_dir: &Path) -> String {
    let mut hasher = blake3::Hasher::new();
    for name in ROOT_INPUT_FILES {
        if let Some(hash) = hash_file(&root_dir.join(name)) {
            hasher.update(format!("{name}={hash}\n").as_bytes());
        }
    }
    hasher.finalize().to_hex().to_string()
}

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

    let mut hasher = blake3::Hasher::new();
    hasher.update(lines.join("\n").as_bytes());
    hasher.finalize().to_hex().to_string()
}

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
}

pub fn read_cache_entry(
    cache_dir: &Path,
    index: &CacheIndex,
    hash: &str,
) -> Option<CacheEntryMeta> {
    let id = index.get(hash)?.value().clone();
    let raw_meta = fs::read_to_string(cache_dir.join(format!("{id}.json"))).ok()?;
    serde_json::from_str(&raw_meta).ok()
}

const CACHE_ID_ALPHABET: [char; 16] = [
    'a', 'b', 'c', 'd', 'e', 'f', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
];

pub fn write_cache_entry(cache_dir: &Path, index: &CacheIndex, meta: &CacheEntryMeta) {
    let id = index
        .get(&meta.hash)
        .map(|existing| existing.value().clone())
        .unwrap_or_else(|| nanoid::nanoid!(15, &CACHE_ID_ALPHABET));
    let _ = fs::create_dir_all(cache_dir);

    let temp_path = cache_dir.join(format!(".tmp-{id}.json"));
    let entry_path = cache_dir.join(format!("{id}.json"));

    if let Ok(json) = serde_json::to_string_pretty(meta)
        && fs::write(&temp_path, json).is_ok()
    {
        let _ = fs::rename(&temp_path, &entry_path);
    }

    index.insert(meta.hash.clone(), id);
}
