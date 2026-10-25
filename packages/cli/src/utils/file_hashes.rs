//! The memo of file content hashes shared by `lint` and `coverage`.
//!
//! Hashing is skipped while a file's size and modification time are unchanged,
//! so a second run over a tree that has not moved is a directory walk. The memo
//! lives in `var/cache/project/filehashes.json`.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::UNIX_EPOCH;

use dashmap::DashMap;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

use super::workspace_modules::EXCLUDED_DIRS;

/// Where the memo lives, relative to the project root.
const CACHE_DIR: &str = "var/cache/project";

/// The memo of file hashes, shared by every fingerprint in the run.
const FILE_HASHES: &str = "filehashes.json";

/// How deep a fingerprint walk goes. Deeper than any layout, and bounded so a
/// symlink loop cannot run away with the run.
const MAX_DEPTH: usize = 16;

/// The identity of the checker that produced a cache entry.
///
/// An entry is only an answer for the code that wrote it. The tree can be
/// untouched and the finding still change — a rule gets stricter, a warning
/// stops being one — and replaying the old entry then reports a problem the
/// current checker does not have. The crate version covers an upgrade; the
/// executable's own mtime covers a rebuild, where the version has not moved
/// but the rules have.
pub fn checker() -> &'static str {
    static CHECKER: OnceLock<String> = OnceLock::new();
    CHECKER.get_or_init(|| {
        let built = std::env::current_exe()
            .and_then(|path| path.metadata())
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|since| since.as_secs())
            .unwrap_or_default();
        format!("{}+{built}", env!("CARGO_PKG_VERSION"))
    })
}

/// What a file looked like the last time it was hashed. Hashing is skipped
/// while its size and modification time are unchanged, which turns the second
/// run of a fingerprint into a directory walk and nothing more.
///
/// The timestamp is whole nanoseconds and not milliseconds-as-a-float on
/// purpose. A float here does not survive the round trip through the memo
/// file: `serde_json` reads a handful of them back a single unit off what was
/// written, the record then looks stale for a file nobody touched, and it is
/// hashed again on every run for as long as it exists. An integer compares
/// for equality after being written and read the way a timestamp should.
#[derive(Clone, Serialize, Deserialize)]
pub struct FileHash {
    pub size: u64,
    #[serde(rename = "mtimeNs")]
    pub mtime_ns: u64,
    pub hash: String,
}

/// Nanoseconds since the epoch, or `0` for a file whose timestamp cannot be
/// read — which never matches a record and so is simply hashed.
fn mtime_nanos(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|since| since.as_nanos() as u64)
        .unwrap_or(0)
}

/// A file the walk found, with what its `stat` already said about it.
///
/// The walk has to touch every entry anyway, so it reads size and timestamp
/// there and hands them on rather than leaving hashing to `stat` the same
/// file a second time.
struct Found {
    path: PathBuf,
    /// How the fingerprint names the file: its path relative to the walk root.
    relative: String,
    size: u64,
    mtime_ns: u64,
}

/// The memo itself, loaded once and written back once.
pub struct FileHashes {
    entries: DashMap<String, FileHash>,
    path: PathBuf,
}

impl FileHashes {
    pub fn load(root: &Path) -> Self {
        let path = root.join(CACHE_DIR).join(FILE_HASHES);
        let entries = fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();
        Self { entries, path }
    }

    /// Write the memo back, through a temporary file so that two commands
    /// saving at once leave a whole file behind rather than two interleaved
    /// halves of one — a memo that cannot be parsed is a memo that is thrown
    /// away, and the run after it hashes the whole workspace again.
    pub fn save(&self) {
        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let Ok(json) = serde_json::to_string(&self.entries) else {
            return;
        };
        let temporary = self
            .path
            .with_extension(format!("{}.tmp", std::process::id()));
        if fs::write(&temporary, json).is_ok() && fs::rename(&temporary, &self.path).is_err() {
            let _ = fs::remove_file(&temporary);
        }
    }

    /// The content hash of one file, memoised by its size and modification
    /// time. `None` when the file cannot be read.
    pub fn hash(&self, path: &Path) -> Option<String> {
        let metadata = fs::metadata(path).ok()?;
        self.hashed(
            path,
            &path.to_string_lossy(),
            metadata.len(),
            mtime_nanos(&metadata),
        )
    }

    /// The same, for a file the walk has already `stat`ed. The key is borrowed
    /// rather than owned, so a file that has not moved costs no allocation at
    /// all.
    fn hashed(&self, path: &Path, key: &str, size: u64, mtime_ns: u64) -> Option<String> {
        if let Some(record) = self.entries.get(key)
            && record.size == size
            && record.mtime_ns == mtime_ns
        {
            return Some(record.hash.clone());
        }

        let mut hasher = blake3::Hasher::new();
        hasher.update_mmap(path).ok()?;
        let hash = hasher.finalize().to_hex().to_string();
        self.entries.insert(
            key.to_string(),
            FileHash {
                size,
                mtime_ns,
                hash: hash.clone(),
            },
        );
        Some(hash)
    }
}

/// The fingerprint of one directory tree: every file it holds, by path and
/// content, in a stable order.
pub fn fingerprint(dir: &Path, hashes: &FileHashes, skip: &[&str]) -> String {
    let mut files = walk(dir, dir, 0, skip);
    files.sort_by(|left, right| left.relative.cmp(&right.relative));

    let digests: Vec<Option<String>> = files
        .par_iter()
        .map(|found| {
            hashes.hashed(
                &found.path,
                &found.path.to_string_lossy(),
                found.size,
                found.mtime_ns,
            )
        })
        .collect();

    let mut hasher = blake3::Hasher::new();
    for (found, digest) in files.iter().zip(digests) {
        if let Some(digest) = digest {
            hasher.update(found.relative.as_bytes());
            hasher.update(b"=");
            hasher.update(digest.as_bytes());
            hasher.update(b"\n");
        }
    }
    hasher.finalize().to_hex().to_string()
}

/// Every file under `dir`, with the `stat` the walk had to make anyway.
///
/// A single module can hold tens of thousands of files spread over hundreds of
/// directories, and a walk is nothing but syscalls, so the subdirectories are
/// walked at once rather than one after another — on a tree that size it is
/// the difference between the fingerprint being noticed and not.
fn walk(base: &Path, dir: &Path, depth: usize, skip: &[&str]) -> Vec<Found> {
    if depth > MAX_DEPTH {
        return Vec::new();
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut dirs = Vec::new();
    let mut files = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };

        // The kind comes back with the directory entry itself, so an ordinary
        // file or directory costs no `stat` at all here. Only a symlink has to
        // be resolved, and it is resolved the way it always was — followed, so
        // a symlinked directory is walked; the depth bound is what keeps a
        // loop finite.
        let listed = entry.file_type().ok().filter(|kind| !kind.is_symlink());
        let is_dir = listed
            .map(|kind| kind.is_dir())
            .unwrap_or_else(|| path.is_dir());

        if is_dir {
            // Dependencies and build output are not part of what a check reads,
            // and walking them would dominate the fingerprint's cost.
            if EXCLUDED_DIRS.contains(&name) || skip.contains(&name) {
                continue;
            }
            dirs.push(path);
            continue;
        }

        let Ok(relative) = path.strip_prefix(base) else {
            continue;
        };
        // A file that cannot be `stat`ed cannot be hashed either, and used to
        // drop out of the fingerprint one step later; it drops out here now.
        let Some(metadata) = (match listed {
            Some(_) => entry.metadata().ok(),
            None => fs::metadata(&path).ok(),
        }) else {
            continue;
        };
        files.push(Found {
            relative: relative.to_string_lossy().replace('\\', "/"),
            size: metadata.len(),
            mtime_ns: mtime_nanos(&metadata),
            path,
        });
    }

    let nested: Vec<Vec<Found>> = dirs
        .par_iter()
        .map(|dir| walk(base, dir, depth + 1, skip))
        .collect();
    files.extend(nested.into_iter().flatten());
    files
}
