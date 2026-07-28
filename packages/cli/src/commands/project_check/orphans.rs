//! Orphans check — the code nothing reaches any more.
//!
//! Deleting a feature usually leaves its helpers behind: they still compile,
//! still lint, still pass their own tests, and are never loaded again. Walking
//! the import graph backwards from the files the runtime does load is the only
//! way to tell them apart from code that is simply imported from somewhere
//! surprising.

use std::collections::BTreeSet;
use std::path::Path;

use super::graph::{IndexedFile, Layer, SourceIndex};
use super::modules::{discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// File stems the runtime loads by name rather than through an import.
const ENTRY_STEMS: [&str; 6] = ["index", "main", "app", "server", "worker", "types"];

/// Layers loaded by discovery: the framework reads the folder, so nothing in
/// the graph ever points at the file.
const DISCOVERED_LAYERS: [Layer; 4] = [Layer::Migration, Layer::Seed, Layer::Route, Layer::Feature];

/// Whether the runtime loads a file without anybody importing it.
pub fn is_entry(file: &IndexedFile) -> bool {
    let stem = file.stem();

    if ENTRY_STEMS.contains(&stem.as_str()) || stem.ends_with("Module") {
        return true;
    }
    if DISCOVERED_LAYERS.contains(&file.layer) {
        return true;
    }
    // Ambient declarations and generated files are never imported by name.
    if stem.ends_with(".d") || stem.ends_with(".gen") || stem.ends_with(".stories") {
        return true;
    }
    // A config sits next to the tool that reads it.
    stem.ends_with(".config") || stem == "vite-env"
}

/// Module types whose `src/` *is* the deliverable. A design system publishes
/// components for apps that may not exist in this workspace yet, and a
/// generated SDK publishes one method per route whether or not anybody calls it
/// — so "nothing imports this" says nothing about either.
const LIBRARY_TYPES: [&str; 2] = ["design", "sdk"];

/// Whether a file belongs to a module that exists to be consumed from outside.
pub fn is_published(file: &IndexedFile) -> bool {
    file.group == "packages"
        || file
            .kind
            .as_deref()
            .is_some_and(|kind| LIBRARY_TYPES.contains(&kind))
}

/// Files no other file imports and the runtime does not load on its own.
pub fn unreachable(index: &SourceIndex) -> Vec<String> {
    let imported: BTreeSet<&Path> = index
        .files
        .iter()
        .flat_map(|file| file.imports.iter())
        .filter_map(|import| import.resolved.as_deref())
        .collect();

    index
        .files
        .iter()
        .filter(|file| !is_entry(file) && !is_published(file))
        .filter(|file| !imported.contains(file.path.as_path()))
        .map(|file| format!("{}: nothing imports this file", file.label))
        .collect()
}

/// Exported names nobody imports, in the modules that are not libraries.
pub fn unused_exports(index: &SourceIndex) -> Vec<String> {
    let consumed: BTreeSet<&str> = index
        .files
        .iter()
        .flat_map(|file| file.imports.iter())
        .flat_map(|import| import.names.iter())
        .map(String::as_str)
        .collect();

    let mut findings = Vec::new();
    for file in index.files.iter().filter(|file| !is_published(file)) {
        // A barrel re-exports on purpose, and a file loaded by discovery
        // publishes its class to the framework rather than to a caller.
        if file.is_barrel() || is_entry(file) {
            continue;
        }
        let unused: Vec<&String> = file
            .exports
            .iter()
            .filter(|name| *name != "default")
            .filter(|name| !consumed.contains(name.as_str()))
            .collect();

        // Every export unused means the file itself is dead, which the
        // unreachable rule already says more usefully.
        if unused.is_empty() || unused.len() == file.exports.len() {
            continue;
        }
        for name in unused {
            findings.push(format!(
                "{}: `{name}` is exported but never imported",
                file.label
            ));
        }
    }

    findings
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );
    let index = SourceIndex::build(root, &modules);

    if index.files.is_empty() {
        return CheckOutcome::new(
            CheckId::Orphans,
            CheckStatus::Skipped,
            "no TypeScript source to walk",
        );
    }

    // Dead code never breaks a build, so everything here warns: the call on
    // whether a file is kept for a reason the graph cannot see is the author's.
    let mut warnings = unreachable(&index);
    warnings.extend(unused_exports(&index));

    let scope = format!(
        "{} file{}",
        index.files.len(),
        if index.files.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Orphans,
        &scope,
        "every file is reachable",
        Vec::new(),
        warnings,
    )
    .with_hint("Delete what is dead, or export it from the module it belongs to")
}
