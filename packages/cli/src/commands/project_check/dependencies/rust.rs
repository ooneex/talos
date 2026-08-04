//! Cargo/Rust dependency checking — comparing declared crates in `Cargo.toml`
//! against the crates a workspace member's source actually `use`s.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::sync::OnceLock;

use regex::Regex;

use super::{Manifest, ModuleSources, RUST_BUILTIN_ROOTS, WorkspaceModule};
use crate::commands::project_check::modules::{CargoManifest, RUST_EXTENSIONS, collect_files};

/// Turn a `Cargo.toml` into the same shape the npm side is checked in, so the
/// version rules apply to both without being written twice.
pub fn read_cargo_entry(label: &str, manifest: &CargoManifest) -> Manifest {
    Manifest {
        label: label.to_string(),
        name: manifest.name.clone(),
        dependencies: manifest.dependencies.clone(),
    }
}

/// Cargo requirements that resolve differently over time. An empty requirement
/// is not loose: it means the dependency is sourced from a path, a git revision
/// or the workspace, all of which are pinned elsewhere.
pub fn cargo_loose_requirements(manifests: &[Manifest]) -> Vec<String> {
    let mut findings = Vec::new();
    for manifest in manifests {
        for (name, requirement) in &manifest.dependencies {
            let trimmed = requirement.trim();
            if trimmed == "*" || trimmed == "x" {
                findings.push(format!(
                    "{}: `{name}` is pinned to \"{requirement}\" — pin a real requirement",
                    manifest.label
                ));
            }
        }
    }
    findings
}

fn use_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"^\s*(?:pub\s+)?(?:use|extern\s+crate)\s+(?:::)?([a-zA-Z0-9_]+)")
            .expect("the use pattern is valid")
    })
}

/// Every external crate a Rust file reaches for through `use`.
pub fn used_crates(content: &str) -> BTreeSet<String> {
    content
        .lines()
        .filter_map(|line| use_pattern().captures(line))
        .filter_map(|captured| captured.get(1))
        .map(|group| group.as_str().to_string())
        .filter(|root| !RUST_BUILTIN_ROOTS.contains(&root.as_str()))
        .collect()
}

/// Cargo lets a crate be declared as `serde_json` or `serde-json` and used the
/// other way round, so both spellings have to compare equal.
pub(super) fn crate_key(name: &str) -> String {
    name.replace('-', "_")
}

/// Crates a module uses without declaring, and crates it declares without
/// using. Both sides are matched on the normalised crate name.
pub fn compare_crates(
    used: &BTreeSet<String>,
    corpus: &[String],
    declared: &BTreeMap<String, String>,
    local_modules: &BTreeSet<String>,
) -> (Vec<String>, Vec<String>) {
    let declared_keys: BTreeSet<String> = declared.keys().map(|name| crate_key(name)).collect();

    let undeclared: Vec<String> = used
        .iter()
        .filter(|name| !declared_keys.contains(&crate_key(name)))
        // A `use foo::…` of a sibling module inside the same crate — or of the
        // crate itself, which is how its own integration tests address it — is
        // not an external dependency.
        .filter(|name| !local_modules.contains(crate_key(name).as_str()))
        .cloned()
        .collect();

    let unused: Vec<String> = declared
        .keys()
        .filter(|name| {
            let key = crate_key(name);
            !used.contains(&key) && !used.contains(name.as_str())
        })
        // A crate can be reached through a fully qualified path or enabled only
        // through a feature, so any mention in the sources counts as used.
        .filter(|name| {
            let key = crate_key(name);
            !corpus
                .iter()
                .any(|content| content.contains(name.as_str()) || content.contains(key.as_str()))
        })
        .cloned()
        .collect();

    (undeclared, unused)
}

/// The `mod` declarations of a crate: the names `use` can address without them
/// being dependencies.
pub(super) fn local_module_names(corpus: &[String]) -> BTreeSet<String> {
    let pattern = mod_pattern();
    corpus
        .iter()
        .flat_map(|content| content.lines())
        .filter_map(|line| pattern.captures(line))
        .filter_map(|captured| captured.get(1))
        .map(|group| crate_key(group.as_str()))
        .collect()
}

fn mod_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"^\s*(?:pub(?:\([a-z]+\))?\s+)?mod\s+([a-zA-Z0-9_]+)")
            .expect("the mod pattern is valid")
    })
}

/// Every crate one Rust module uses, and every file body, read once.
pub(super) fn read_rust_sources(module: &WorkspaceModule) -> ModuleSources {
    let mut imports = BTreeSet::new();
    let mut corpus = Vec::new();

    for path in collect_files(&module.dir, RUST_EXTENSIONS, 8) {
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        imports.extend(used_crates(&content));
        corpus.push(content);
    }

    ModuleSources { imports, corpus }
}
