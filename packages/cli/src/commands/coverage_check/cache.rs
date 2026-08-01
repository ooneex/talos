//! The cache that lets a second `coverage:check` skip the suites the first one
//! already measured.
//!
//! Running a suite is the most expensive thing this command does, and its
//! result is a function of the code it runs over: the same sources in produce
//! the same table out. So an entry records the fingerprint of everything a
//! module's suite reads and is reused only when every one of them still
//! matches.
//!
//! What a suite reads is more than the module directory. A module imports its
//! workspace dependencies, so an edit to `packages/color` has to re-run every
//! module that depends on it — the entry therefore carries one fingerprint per
//! member in the module's transitive dependency closure. It also loads a
//! handful of root files (the manifests, the lockfile, the TypeScript
//! configuration, the environment), which are fingerprinted together as one
//! more input. The rest of the root is left out on purpose: editing a README
//! does not change what a test covers, and re-running the whole workspace for
//! it would cost more than the cache ever saves.
//!
//! Entries live in `var/cache/coverage/<module>.json`, next to the project and
//! monorepo caches, and `--no-cache` bypasses both reading and writing. Only a
//! suite that actually reported is stored: a run that could not start is a
//! transient failure, not an answer.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use rayon::prelude::*;
use serde::{Deserialize, Serialize};

use super::{FileCoverage, ModuleCoverage, RunStatus, coverage_dir};
use crate::commands::project_check::cache::{FileHashes, checker, fingerprint};
use crate::commands::project_check::modules::WorkspaceModule;

/// Where the entries live, relative to the project root.
pub const CACHE_DIR: &str = "var/cache/coverage";

/// Bumped whenever the shape of an entry changes, so an old one is ignored
/// rather than misread.
pub const VERSION: u32 = 1;

/// The key the root files are fingerprinted under, which cannot collide with a
/// member label because every one of those carries a `/`.
const ROOT: &str = ".";

/// The root files a suite loads: what resolves its imports, what pins its
/// dependencies, and what its environment is read from.
const ROOT_FILES: &[&str] = &[
    "package.json",
    "bun.lock",
    "bun.lockb",
    "bunfig.toml",
    "tsconfig.json",
    "tsconfig.base.json",
    ".env",
    ".env.yml",
    ".env.test",
    ".env.test.yml",
];

/// The manifest fields a workspace dependency can be declared in.
const DEPENDENCY_FIELDS: &[&str] = &["dependencies", "devDependencies", "peerDependencies"];

/// The state of everything the suites read, one fingerprint per workspace
/// member plus one for the root files.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Fingerprints {
    root: String,
    /// `modules/user` → what that directory holds.
    members: BTreeMap<String, String>,
    /// `modules/user` → the members it depends on, directly or through them.
    deps: BTreeMap<String, BTreeSet<String>>,
}

impl Fingerprints {
    /// Fingerprint the workspace. Members are hashed in parallel, and the file
    /// hashes underneath are memoised with the project check's, so a tree that
    /// has not moved costs one `stat` per file.
    pub fn build(root: &Path, modules: &[WorkspaceModule], hashes: &FileHashes) -> Self {
        let members: Vec<(String, String)> = modules
            .par_iter()
            .map(|module| {
                // A module's own coverage output is written by the very run
                // being fingerprinted, so it can never be one of its inputs.
                let generated = coverage_dir(&module.dir);
                (
                    module.label(),
                    fingerprint(&module.dir, hashes, &[generated.as_str()]),
                )
            })
            .collect();

        Self {
            root: root_fingerprint(root, hashes),
            members: members.into_iter().collect(),
            deps: dependencies(modules),
        }
    }

    /// Everything one module's suite reads: the root files, the module itself,
    /// and every workspace member it depends on.
    pub fn inputs(&self, label: &str) -> BTreeMap<String, String> {
        let mut inputs = BTreeMap::from([(ROOT.to_string(), self.root.clone())]);
        for member in std::iter::once(label).chain(
            self.deps
                .get(label)
                .into_iter()
                .flatten()
                .map(String::as_str),
        ) {
            if let Some(digest) = self.members.get(member) {
                inputs.insert(member.to_string(), digest.clone());
            }
        }
        inputs
    }
}

/// The root files, hashed together in a stable order. A file that does not
/// exist contributes nothing, so creating one changes the fingerprint.
fn root_fingerprint(root: &Path, hashes: &FileHashes) -> String {
    let mut hasher = blake3::Hasher::new();
    for name in ROOT_FILES {
        if let Some(digest) = hashes.hash(&root.join(name)) {
            hasher.update(format!("{name}={digest}\n").as_bytes());
        }
    }
    hasher.finalize().to_hex().to_string()
}

/// Every member's transitive workspace dependencies, by label.
fn dependencies(modules: &[WorkspaceModule]) -> BTreeMap<String, BTreeSet<String>> {
    let labels: BTreeMap<String, String> = modules
        .iter()
        .filter_map(|module| {
            let name = module.package_json()?.get("name")?.as_str()?.to_string();
            Some((name, module.label()))
        })
        .collect();

    let direct: BTreeMap<String, BTreeSet<String>> = modules
        .iter()
        .map(|module| {
            let label = module.label();
            let mut deps = BTreeSet::new();
            if let Some(manifest) = module.package_json() {
                for field in DEPENDENCY_FIELDS {
                    let Some(declared) = manifest.get(field).and_then(|value| value.as_object())
                    else {
                        continue;
                    };
                    for name in declared.keys() {
                        if let Some(dependency) = labels.get(name.as_str()) {
                            deps.insert(dependency.clone());
                        }
                    }
                }
            }
            deps.remove(&label);
            (label, deps)
        })
        .collect();

    direct
        .keys()
        .map(|label| (label.clone(), closure(label, &direct)))
        .collect()
}

/// Everything reachable from a member, itself excluded. A dependency cycle is
/// walked once, not forever.
fn closure(start: &str, direct: &BTreeMap<String, BTreeSet<String>>) -> BTreeSet<String> {
    let mut reached = BTreeSet::new();
    let mut pending = vec![start.to_string()];
    while let Some(label) = pending.pop() {
        let Some(deps) = direct.get(&label) else {
            continue;
        };
        for dependency in deps {
            if reached.insert(dependency.clone()) {
                pending.push(dependency.clone());
            }
        }
    }
    reached.remove(start);
    reached
}

/// One source file of a cached report.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct File {
    pub path: String,
    pub lines: f64,
    pub functions: f64,
    pub uncovered: Vec<String>,
}

/// One cached suite, with the fingerprints it was measured from.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Entry {
    pub version: u32,
    /// The build that produced the entry — see [`checker`].
    #[serde(default)]
    pub checker: String,
    pub module: String,
    pub inputs: BTreeMap<String, String>,
    pub status: String,
    pub passed: usize,
    pub failed: usize,
    pub lines: f64,
    pub functions: f64,
    pub files: Vec<File>,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
    /// What the suite printed, kept so `--logs` still has something to show for
    /// a failure that was not re-run.
    pub output: String,
}

impl Entry {
    /// Whether the entry was measured from exactly the tree in front of us.
    ///
    /// Every fingerprint has to match, and so does the set of them: a workspace
    /// dependency that has appeared or been dropped changes what the suite runs
    /// over just as much as an edit does.
    pub fn matches(&self, inputs: &BTreeMap<String, String>) -> bool {
        self.version == VERSION && self.checker == checker() && &self.inputs == inputs
    }

    /// The run the entry stands for, restored against the target it belongs to.
    pub fn coverage(&self, name: &str, label: &str, dir: &Path) -> Option<ModuleCoverage> {
        Some(ModuleCoverage {
            name: name.to_string(),
            label: label.to_string(),
            dir: dir.to_path_buf(),
            status: status(&self.status)?,
            passed: self.passed,
            failed: self.failed,
            lines: self.lines,
            functions: self.functions,
            files: self
                .files
                .iter()
                .map(|file| FileCoverage {
                    path: file.path.clone(),
                    lines: file.lines,
                    functions: file.functions,
                    uncovered: file.uncovered.clone(),
                })
                .collect(),
            duration_ms: self.duration_ms,
            output: self.output.clone(),
            cached: true,
        })
    }
}

/// How a status is stored, and `None` for the ones that are never worth
/// storing: a suite that could not be run has reported nothing, and one that
/// was skipped was never run at all.
fn status_key(status: &RunStatus) -> Option<&'static str> {
    match status {
        RunStatus::Passed => Some("passed"),
        RunStatus::Failed => Some("failed"),
        RunStatus::Unmeasured => Some("unmeasured"),
        RunStatus::Errored(_) | RunStatus::Skipped(_) => None,
    }
}

fn status(key: &str) -> Option<RunStatus> {
    match key {
        "passed" => Some(RunStatus::Passed),
        "failed" => Some(RunStatus::Failed),
        "unmeasured" => Some(RunStatus::Unmeasured),
        _ => None,
    }
}

/// `modules/user` → `modules-user.json`, so one file per member and no
/// directory to create per group.
fn entry_path(root: &Path, label: &str) -> PathBuf {
    let file: String = label
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

/// The entry stored for a module, when there is one and it can still be read.
pub fn read(root: &Path, label: &str) -> Option<Entry> {
    let raw = fs::read_to_string(entry_path(root, label)).ok()?;
    let entry: Entry = serde_json::from_str(&raw).ok()?;
    (entry.version == VERSION && entry.module == label).then_some(entry)
}

/// Store what a suite reported, against the tree it reported it from.
pub fn write(root: &Path, coverage: &ModuleCoverage, inputs: &BTreeMap<String, String>) {
    let Some(status) = status_key(&coverage.status) else {
        return;
    };

    let entry = Entry {
        version: VERSION,
        checker: checker().to_string(),
        module: coverage.label.clone(),
        inputs: inputs.clone(),
        status: status.to_string(),
        passed: coverage.passed,
        failed: coverage.failed,
        lines: coverage.lines,
        functions: coverage.functions,
        files: coverage
            .files
            .iter()
            .map(|file| File {
                path: file.path.clone(),
                lines: file.lines,
                functions: file.functions,
                uncovered: file.uncovered.clone(),
            })
            .collect(),
        duration_ms: coverage.duration_ms,
        output: coverage.output.clone(),
    };

    let path = entry_path(root, &coverage.label);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(&entry) {
        let _ = fs::write(path, json);
    }
}
