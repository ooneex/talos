//! The cache that lets a second `project:check` skip the work of the first.
//!
//! Almost every check is a pure function of the working tree: the same files in
//! produce the same findings out. That makes the result cacheable, and the only
//! interesting question is when to throw the cache away. Answering it per
//! workspace member is what makes the cache worth having — a change in
//! `modules/user` should not re-run the checks that only ever read
//! `modules/billing`, and on a tree nobody has touched nothing should run at
//! all.
//!
//! So an entry records one fingerprint per module and package it consumed, plus
//! one for everything outside them, and is reused only when every single one
//! still matches. Entries live in `var/cache/project/<check>.json` next to the
//! workspace task cache, and `--no-cache` bypasses both reading and writing.
//!
//! The checks that are *not* a function of the tree stay out of it: the ones
//! that run the workspace tasks, the ones that ask the network, and the ones
//! that read git rather than the files git is tracking.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::UNIX_EPOCH;

use dashmap::DashMap;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

use super::artifacts::{is_backend, is_frontend};
use super::modules::{WorkspaceModule, relative};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, EXCLUDED_DIRS, ProjectCheckArgs, Reads,
};

/// Where the entries live, relative to the project root.
pub const CACHE_DIR: &str = "var/cache/project";

/// Bumped whenever the shape of an entry changes, so an old one is ignored
/// rather than misread.
pub const VERSION: u32 = 2;

/// The identity of the checker that produced an entry.
///
/// An entry is only an answer for the code that wrote it. The tree can be
/// untouched and the finding still change — a rule gets stricter, a warning
/// stops being one — and replaying the old entry then reports a problem the
/// current checker does not have, with no way for anyone to tell that is what
/// happened. The crate version covers an upgrade; the executable's own mtime
/// covers a rebuild, where the version has not moved but the rules have.
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

/// The memo of file hashes, shared by every fingerprint in the run.
const FILE_HASHES: &str = "filehashes.json";

/// How deep a fingerprint walk goes. Deeper than any layout, and bounded so a
/// symlink loop cannot run away with the run.
const MAX_DEPTH: usize = 16;

/// What a file looked like the last time it was hashed. Hashing is skipped
/// while its size and modification time are unchanged, which turns the second
/// run of a fingerprint into a directory walk and nothing more.
#[derive(Clone, Serialize, Deserialize)]
pub struct FileHash {
    pub size: u64,
    #[serde(rename = "mtimeMs")]
    pub mtime_ms: f64,
    pub hash: String,
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

    pub fn save(&self) {
        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string(&self.entries) {
            let _ = fs::write(&self.path, json);
        }
    }

    /// The content hash of one file, memoised by its size and modification
    /// time. `None` when the file cannot be read.
    pub fn hash(&self, path: &Path) -> Option<String> {
        let metadata = fs::metadata(path).ok()?;
        let size = metadata.len();
        let mtime_ms = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|since| since.as_secs_f64() * 1000.0)
            .unwrap_or(0.0);
        let key = path.to_string_lossy().to_string();

        if let Some(record) = self.entries.get(&key)
            && record.size == size
            && record.mtime_ms == mtime_ms
        {
            return Some(record.hash.clone());
        }

        let mut hasher = blake3::Hasher::new();
        hasher.update_mmap(path).ok()?;
        let hash = hasher.finalize().to_hex().to_string();
        self.entries.insert(
            key,
            FileHash {
                size,
                mtime_ms,
                hash: hash.clone(),
            },
        );
        Some(hash)
    }
}

/// The fingerprint of one directory tree: every file it holds, by path and
/// content, in a stable order.
pub fn fingerprint(dir: &Path, hashes: &FileHashes, skip: &[&str]) -> String {
    let mut files = Vec::new();
    walk(dir, dir, 0, skip, &mut files);
    files.sort();

    let digests: Vec<Option<String>> = files
        .par_iter()
        .map(|file| hashes.hash(&dir.join(file)))
        .collect();

    let mut hasher = blake3::Hasher::new();
    for (file, digest) in files.iter().zip(digests) {
        if let Some(digest) = digest {
            hasher.update(format!("{file}={digest}\n").as_bytes());
        }
    }
    hasher.finalize().to_hex().to_string()
}

fn walk(base: &Path, dir: &Path, depth: usize, skip: &[&str], files: &mut Vec<String>) {
    if depth > MAX_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };

        // A symlinked directory is followed by `is_dir`, which is how a loop
        // gets in; the depth bound is what keeps it finite.
        if path.is_dir() {
            // Dependencies and build output are not part of what a check reads,
            // and walking them would dominate the fingerprint's cost.
            if EXCLUDED_DIRS.contains(&name) || skip.contains(&name) {
                continue;
            }
            walk(base, &path, depth + 1, skip, files);
            continue;
        }

        if let Ok(relative) = path.strip_prefix(base) {
            files.push(relative.to_string_lossy().replace('\\', "/"));
        }
    }
}

/// One workspace member as the cache sees it: what it holds, and which checks
/// could possibly read it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Member {
    pub fingerprint: String,
    pub backend: bool,
    pub frontend: bool,
}

impl Member {
    /// Whether a check with this reach reads the member.
    fn read_by(&self, reads: Reads) -> bool {
        match reads {
            Reads::Workspace => true,
            Reads::Backend => self.backend,
            Reads::Frontend => self.frontend,
        }
    }
}

/// The state of the working tree, one fingerprint per workspace member.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Fingerprints {
    /// Everything outside `modules/` and `packages/` — the root manifests, the
    /// compose files, the assistant configuration, the documents. The checks
    /// that scan the whole repository depend on it, and so does every check
    /// that reads the root `tsconfig.json`.
    pub root: String,
    /// `modules/user` → what that directory holds.
    pub modules: BTreeMap<String, Member>,
}

impl Fingerprints {
    /// Fingerprint the workspace. Members are hashed in parallel, and the file
    /// hashes underneath are memoised, so the whole thing costs one `stat` per
    /// file on a tree that has not moved.
    pub fn build(root: &Path, modules: &[WorkspaceModule], hashes: &FileHashes) -> Self {
        let members: Vec<(String, Member)> = modules
            .par_iter()
            .map(|module| {
                (
                    relative(root, &module.dir),
                    Member {
                        fingerprint: fingerprint(&module.dir, hashes, &[]),
                        backend: is_backend(module),
                        frontend: is_frontend(module),
                    },
                )
            })
            .collect();

        Self {
            // The members are fingerprinted on their own, so the root walk
            // steps over them rather than hashing everything twice.
            root: fingerprint(root, hashes, &["modules", "packages"]),
            modules: members.into_iter().collect(),
        }
    }

    /// The members a check with this reach actually reads.
    ///
    /// This is what makes the cache worth having at module granularity: a check
    /// that only ever looks at backend modules is not invalidated by an edit to
    /// a design system, and one that only looks at the front end is not
    /// invalidated by a migration. Narrowing is only ever safe in one direction
    /// — a declared reach has to be a superset of what the check reads — which
    /// is why the default is the whole workspace.
    pub fn scoped(&self, reads: Reads) -> BTreeMap<String, String> {
        self.modules
            .iter()
            .filter(|(_, member)| member.read_by(reads))
            .map(|(name, member)| (name.clone(), member.fingerprint.clone()))
            .collect()
    }
}

/// One cached check result, with the tree it was produced from.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Entry {
    pub version: u32,
    /// The build that produced the entry — see [`checker`].
    #[serde(default)]
    pub checker: String,
    pub check: String,
    /// The options that change what a check reports, so a run scoped with
    /// `--modules` cannot be served from a full run's entry.
    pub options: String,
    pub root: String,
    pub modules: BTreeMap<String, String>,
    pub status: String,
    pub summary: String,
    pub details: Vec<String>,
    pub hints: Vec<String>,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
}

impl Entry {
    /// Whether the entry was produced from exactly the tree in front of us.
    ///
    /// Every fingerprint has to match, and so does the set of members: a module
    /// that has appeared or been deleted changes what a check sees just as much
    /// as an edit does.
    pub fn matches(&self, options: &str, reads: Reads, fingerprints: &Fingerprints) -> bool {
        self.version == VERSION
            && self.checker == checker()
            && self.options == options
            && self.root == fingerprints.root
            && self.modules == fingerprints.scoped(reads)
    }

    /// The outcome the entry stands for.
    pub fn outcome(&self, id: CheckId) -> Option<CheckOutcome> {
        Some(CheckOutcome {
            id,
            status: CheckStatus::from_label(&self.status)?,
            summary: self.summary.clone(),
            details: self.details.clone(),
            hints: self.hints.clone(),
            duration_ms: self.duration_ms,
            cached: true,
        })
    }
}

fn entry_path(root: &Path, id: CheckId) -> PathBuf {
    root.join(CACHE_DIR).join(format!("{}.json", id.key()))
}

/// The entry stored for a check, when there is one and it can still be read.
pub fn read(root: &Path, id: CheckId) -> Option<Entry> {
    let raw = fs::read_to_string(entry_path(root, id)).ok()?;
    let entry: Entry = serde_json::from_str(&raw).ok()?;
    (entry.version == VERSION && entry.check == id.key()).then_some(entry)
}

/// Store what a check found, against the tree it found it in.
pub fn write(
    root: &Path,
    id: CheckId,
    options: &str,
    fingerprints: &Fingerprints,
    outcome: &CheckOutcome,
) {
    let entry = Entry {
        version: VERSION,
        checker: checker().to_string(),
        check: id.key().to_string(),
        options: options.to_string(),
        root: fingerprints.root.clone(),
        modules: fingerprints.scoped(id.reads()),
        status: outcome.status.label().to_string(),
        summary: outcome.summary.clone(),
        details: outcome.details.clone(),
        hints: outcome.hints.clone(),
        duration_ms: outcome.duration_ms,
    };

    let path = entry_path(root, id);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(&entry) {
        let _ = fs::write(path, json);
    }
}

/// The options that change what the checks report, rendered into one key.
///
/// Anything that only shapes the *report* — `--json`, `--strict`, `--logs` — is
/// left out on purpose: it does not change a finding, so it must not invalidate
/// one.
pub fn options_key(args: &ProjectCheckArgs) -> String {
    format!(
        "modules={}|packages={}|audit={}",
        args.modules.clone().unwrap_or_default(),
        args.packages.clone().unwrap_or_default(),
        args.audit_level.clone().unwrap_or_default(),
    )
}
