//! Orphans check — the code nothing reaches any more.
//!
//! Deleting a feature usually leaves its helpers behind: they still compile,
//! still lint, still pass their own tests, and are never loaded again. Walking
//! the import graph backwards from the files the runtime does load is the only
//! way to tell them apart from code that is simply imported from somewhere
//! surprising.

use std::collections::BTreeSet;
use std::path::Path;

use super::graph::{Import, IndexedFile, Layer, SourceIndex};
use super::modules::{discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, WARN_DETAIL, static_outcome,
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

/// Every import in the graph plus the ones made from `tests/`: a file or a
/// name only a test reaches is still in use.
fn all_imports<'a>(
    index: &'a SourceIndex,
    tests: &'a [Import],
) -> impl Iterator<Item = &'a Import> {
    index
        .files
        .iter()
        .flat_map(|file| file.imports.iter())
        .chain(tests.iter())
}

/// Files no other file (or test) imports and the runtime does not load on its own.
pub fn unreachable(index: &SourceIndex, tests: &[Import]) -> Vec<String> {
    let imported: BTreeSet<&Path> = all_imports(index, tests)
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
pub fn unused_exports(index: &SourceIndex, tests: &[Import]) -> Vec<String> {
    let consumed: BTreeSet<&str> = all_imports(index, tests)
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
    let tests = index.test_imports(root, &modules);
    let mut warnings = unreachable(&index, &tests);
    warnings.extend(unused_exports(&index, &tests));

    let scope = format!(
        "{} file{}",
        index.files.len(),
        if index.files.len() == 1 { "" } else { "s" }
    );

    let mut outcome = static_outcome(
        CheckId::Orphans,
        &scope,
        "every file is reachable",
        Vec::new(),
        warnings.clone(),
    );
    // `--logs` is read by whoever cleans the dead code up, so it gets every
    // entry rather than the capped preview.
    if args.logs {
        outcome.details = warnings
            .into_iter()
            .map(|message| format!("{WARN_DETAIL}{message}"))
            .collect();
    }

    outcome.with_hint("Delete what is dead, or export it from the module it belongs to")
}
