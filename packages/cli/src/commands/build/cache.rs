// The cache that lets a second `build` skip the targets a prior run already
// compiled from the same inputs.
//
// Building is the expensive part of this command, and its result is a
// function of what a target's build reads: the same sources and the same
// script in produce the same output out. So an entry records the fingerprint
// [`super::build_hash`] computed for a target and is reused only while that
// fingerprint still matches — an edit to the target, its build script, a
// workspace dependency it pulls in, or the root manifests all invalidate it.
//
// Entries live in `var/cache/build/<target>.json`, next to the project and
// workspace caches but owned by this command alone, and `--no-cache` bypasses
// both reading and writing.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Where the entries live, relative to the project root.
pub const CACHE_DIR: &str = "var/cache/build";

/// Bumped whenever the shape of an entry changes, so an old one is ignored
/// rather than misread.
pub const VERSION: u32 = 1;

/// One cached build, with the input fingerprint it was produced from.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Entry {
    pub version: u32,
    pub target: String,
    pub hash: String,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
    pub output: String,
}

impl Entry {
    /// Whether the entry was produced from exactly the target and inputs in
    /// front of us.
    pub fn matches(&self, target: &str, hash: &str) -> bool {
        self.version == VERSION && self.target == target && self.hash == hash
    }
}

/// `packages/color` → `packages-color.json`, so one file per target and no
/// directory to create per group.
fn entry_path(root: &Path, key: &str) -> PathBuf {
    let file: String = key
        .chars()
        .map(|letter| {
            if letter.is_alphanumeric() {
                letter
            } else {
                '-'
            }
        })
        .collect();
    root.join(CACHE_DIR).join(format!("{file}.json"))
}

/// The entry stored for a target, when there is one and it can still be read.
pub fn read(root: &Path, key: &str) -> Option<Entry> {
    let raw = fs::read_to_string(entry_path(root, key)).ok()?;
    let entry: Entry = serde_json::from_str(&raw).ok()?;
    (entry.version == VERSION && entry.target == key).then_some(entry)
}

/// Store what a build produced, against the fingerprint it was produced from.
pub fn write(root: &Path, key: &str, hash: &str, duration_ms: u64, output: &str) {
    let entry = Entry {
        version: VERSION,
        target: key.to_string(),
        hash: hash.to_string(),
        duration_ms,
        output: output.to_string(),
    };

    let path = entry_path(root, key);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(&entry) {
        let _ = fs::write(path, json);
    }
}
