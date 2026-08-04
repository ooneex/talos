//! Python dependency checking — comparing declared distributions in
//! `pyproject.toml`/`requirements.txt` against the packages a workspace
//! member's source actually imports.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::sync::OnceLock;

use regex::Regex;

use super::{
    Manifest, ModuleSources, PYTHON_IMPORT_ALIASES, PYTHON_STDLIB, PYTHON_TOOL_DISTRIBUTIONS,
};
use crate::commands::project_check::modules::{
    PYTHON_EXTENSIONS, PythonManifest, WorkspaceModule, collect_files, normalize_distribution,
    python_source_dirs,
};

/// Turn a `pyproject.toml` into the shape the version rules read.
pub fn read_python_entry(label: &str, manifest: &PythonManifest) -> Manifest {
    Manifest {
        label: label.to_string(),
        name: manifest.name.clone(),
        dependencies: manifest.dependencies.clone(),
    }
}

/// Requirements declared without any version specifier: the next release of the
/// dependency decides what the package installs.
pub fn unpinned_requirements(manifests: &[Manifest]) -> Vec<String> {
    let mut findings = Vec::new();
    for manifest in manifests {
        for (name, specifier) in &manifest.dependencies {
            if specifier.trim().is_empty() {
                findings.push(format!(
                    "{}: `{name}` is declared without a version specifier",
                    manifest.label
                ));
            }
        }
    }
    findings
}

fn python_import_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // Only absolute imports name a distribution: `from .models import User`
        // stays inside the package.
        Regex::new(r"^\s*(?:import|from)\s+([A-Za-z_][A-Za-z0-9_]*)")
            .expect("the python import pattern is valid")
    })
}

/// Every top-level package a Python file imports.
pub fn imported_packages(content: &str) -> BTreeSet<String> {
    content
        .lines()
        .filter(|line| !line.trim_start().starts_with("from ."))
        .filter_map(|line| python_import_pattern().captures(line))
        .filter_map(|captured| captured.get(1))
        .map(|group| group.as_str().to_string())
        .filter(|root| !PYTHON_STDLIB.contains(&root.as_str()))
        .collect()
}

/// The distribution an import name belongs to, normalised for comparison.
fn distribution_of(import: &str) -> String {
    let normalized = normalize_distribution(import);
    PYTHON_IMPORT_ALIASES
        .iter()
        .find(|(name, _)| *name == normalized)
        .map(|(_, distribution)| (*distribution).to_string())
        .unwrap_or(normalized)
}

/// Packages a module imports without declaring, and declarations nothing
/// imports. Both sides are compared after PEP 503 normalisation.
pub fn compare_python_packages(
    imported: &BTreeSet<String>,
    corpus: &[String],
    declared: &BTreeMap<String, String>,
    local: &BTreeSet<String>,
) -> (Vec<String>, Vec<String>) {
    let declared_keys: BTreeSet<String> = declared
        .keys()
        .map(|name| normalize_distribution(name))
        .collect();
    let imported_keys: BTreeSet<String> =
        imported.iter().map(|name| distribution_of(name)).collect();

    let undeclared: Vec<String> = imported
        .iter()
        .filter(|name| !declared_keys.contains(&distribution_of(name)))
        .filter(|name| !local.contains(normalize_distribution(name).as_str()))
        .cloned()
        .collect();

    let unused: Vec<String> = declared
        .keys()
        .filter(|name| !imported_keys.contains(&normalize_distribution(name)))
        .filter(|name| !is_python_tool(name))
        // A dependency can be a plugin or a fixture that no source imports by
        // name, so any mention in the package counts as used.
        .filter(|name| {
            let normalized = normalize_distribution(name);
            !corpus.iter().any(|content| {
                content.contains(name.as_str()) || content.contains(normalized.as_str())
            })
        })
        .cloned()
        .collect();

    (undeclared, unused)
}

/// Whether a distribution is a tool the package runs instead of imports.
fn is_python_tool(name: &str) -> bool {
    let normalized = normalize_distribution(name);
    PYTHON_TOOL_DISTRIBUTIONS.contains(&normalized.as_str())
        || normalized == "pytest"
        || normalized.starts_with("pytest-")
        || normalized.starts_with("types-")
}

/// The names a Python package can import from itself: its own top-level
/// packages and modules.
pub(super) fn local_python_names(module: &WorkspaceModule) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    for root in python_source_dirs(module) {
        if let Some(name) = root.file_name().and_then(|name| name.to_str())
            && name != "src"
        {
            names.insert(normalize_distribution(name));
        }
        let Ok(entries) = fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let is_package = path.is_dir() && path.join("__init__.py").is_file();
            let is_module = path.extension().and_then(|extension| extension.to_str()) == Some("py");
            if !is_package && !is_module {
                continue;
            }
            if let Some(name) = path.file_stem().and_then(|name| name.to_str()) {
                names.insert(normalize_distribution(name));
            }
        }
    }
    names
}

/// Every package one Python module imports, and every file body, read once.
pub(super) fn read_python_sources(module: &WorkspaceModule) -> ModuleSources {
    let mut imports = BTreeSet::new();
    let mut corpus = Vec::new();

    for path in collect_files(&module.dir, PYTHON_EXTENSIONS, 8) {
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        imports.extend(imported_packages(&content));
        corpus.push(content);
    }
    ModuleSources { imports, corpus }
}
