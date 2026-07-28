//! Imports check — the direction dependencies are allowed to point in.
//!
//! Three failures hide in an import graph that type-checks. A specifier that
//! resolves to nothing only breaks at runtime, when the bundler or Bun finally
//! tries to load it. A cycle between two modules deadlocks the container: the
//! decorators of one run before the other's class exists. And an entity that
//! reaches back up into a controller inverts the dependency rule, which is what
//! makes a domain testable in isolation in the first place.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use super::graph::{IndexedFile, Layer, SourceIndex};
use super::modules::{discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// The layers a layer may never import, innermost last. The rule is the Clean
/// Architecture one: a dependency always points inwards, so an entity knows
/// nothing about the service that loads it and a service knows nothing about
/// the controller that calls it.
const FORBIDDEN: [(Layer, &[Layer]); 5] = [
    (
        Layer::Entity,
        &[
            Layer::Controller,
            Layer::Service,
            Layer::Repository,
            Layer::Middleware,
        ],
    ),
    (
        Layer::Repository,
        &[Layer::Controller, Layer::Service, Layer::Middleware],
    ),
    (Layer::Service, &[Layer::Controller, Layer::Middleware]),
    (
        Layer::Migration,
        &[Layer::Controller, Layer::Service, Layer::Repository],
    ),
    (Layer::Seed, &[Layer::Controller, Layer::Middleware]),
];

/// Whether `layer` is allowed to import `imported`.
pub fn allows(layer: Layer, imported: Layer) -> bool {
    !FORBIDDEN
        .iter()
        .any(|(subject, forbidden)| *subject == layer && forbidden.contains(&imported))
}

/// Local specifiers that resolve to no file on disk.
pub fn unresolved(index: &SourceIndex) -> Vec<String> {
    let mut findings = Vec::new();

    for file in &index.files {
        for import in &file.imports {
            if import.resolved.is_some() || !import.is_local() || import.is_asset() {
                continue;
            }
            findings.push(format!(
                "{}: `{}` resolves to no file",
                file.label, import.specifier
            ));
        }
    }

    findings
}

/// Imports that point the wrong way through the layers.
pub fn inverted(index: &SourceIndex) -> Vec<String> {
    let mut findings = Vec::new();

    for file in &index.files {
        if file.layer == Layer::Other {
            continue;
        }
        for import in &file.imports {
            let Some(target) = import.resolved.as_ref().and_then(|path| index.file(path)) else {
                continue;
            };
            if allows(file.layer, target.layer) {
                continue;
            }
            findings.push(format!(
                "{}: {} imports {} {} — the dependency points outwards",
                file.label,
                file.layer.label(),
                target.layer.label(),
                target.label
            ));
        }
    }

    findings
}

/// The modules each module imports, which is the graph a cycle is looked for in.
///
/// A `import type` edge is left out of both graphs: the compiler erases it, so
/// it can never be the cycle that leaves a class undefined at load time.
pub fn module_edges(index: &SourceIndex) -> BTreeMap<String, BTreeSet<String>> {
    let mut edges: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();

    for file in &index.files {
        let targets = edges.entry(file.module.clone()).or_default();
        for import in file.imports.iter().filter(|import| !import.type_only) {
            let Some(module) = &import.module else {
                continue;
            };
            if module != &file.module {
                targets.insert(module.clone());
            }
        }
    }

    edges
}

/// The files each file imports, keyed by the label they are reported under.
fn file_edges(index: &SourceIndex) -> BTreeMap<String, BTreeSet<String>> {
    let by_path: BTreeMap<&Path, &IndexedFile> = index
        .files
        .iter()
        .map(|file| (file.path.as_path(), file))
        .collect();

    index
        .files
        .iter()
        .map(|file| {
            let targets = file
                .imports
                .iter()
                .filter(|import| !import.type_only)
                .filter_map(|import| import.resolved.as_deref())
                .filter_map(|path| by_path.get(path))
                .map(|target| target.label.clone())
                .filter(|label| label != &file.label)
                .collect();
            (file.label.clone(), targets)
        })
        .collect()
}

/// The cycles in a directed graph, each reported once from its lowest node.
///
/// The walk is a depth-first search that remembers the path it came down, so
/// the cycle it reports is the real chain rather than just the pair of nodes
/// that closed it. A node is only settled once it has been fully explored,
/// which bounds the walk to one pass over the graph — enough to surface every
/// tangle without enumerating the exponentially many ways to travel one.
pub fn cycles(edges: &BTreeMap<String, BTreeSet<String>>) -> Vec<Vec<String>> {
    let mut found: BTreeSet<Vec<String>> = BTreeSet::new();
    let mut settled: BTreeSet<&str> = BTreeSet::new();

    for start in edges.keys() {
        if settled.contains(start.as_str()) {
            continue;
        }
        walk(start, edges, &mut Vec::new(), &mut settled, &mut found);
    }

    found.into_iter().collect()
}

fn walk<'graph>(
    node: &'graph str,
    edges: &'graph BTreeMap<String, BTreeSet<String>>,
    path: &mut Vec<&'graph str>,
    settled: &mut BTreeSet<&'graph str>,
    found: &mut BTreeSet<Vec<String>>,
) {
    if let Some(start) = path.iter().position(|visited| *visited == node) {
        found.insert(normalize(&path[start..]));
        return;
    }
    if settled.contains(node) {
        return;
    }

    path.push(node);
    for target in edges.get(node).into_iter().flatten() {
        walk(target, edges, path, settled, found);
    }
    path.pop();
    settled.insert(node);
}

/// Rotate a cycle so it always starts at its lowest node, which is what makes
/// the same cycle reached from three different files report once.
fn normalize(cycle: &[&str]) -> Vec<String> {
    let Some(start) = cycle
        .iter()
        .enumerate()
        .min_by_key(|(_, node)| **node)
        .map(|(index, _)| index)
    else {
        return Vec::new();
    };
    cycle[start..]
        .iter()
        .chain(cycle[..start].iter())
        .map(|node| (*node).to_string())
        .collect()
}

/// Render a cycle the way it reads in a stack trace.
pub fn render_cycle(cycle: &[String]) -> String {
    let mut chain: Vec<String> = cycle.to_vec();
    if let Some(first) = cycle.first() {
        chain.push(first.clone());
    }
    chain.join(" → ")
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );
    let index = SourceIndex::build(root, &modules);

    if index.files.is_empty() {
        return CheckOutcome::new(
            CheckId::Imports,
            CheckStatus::Skipped,
            "no TypeScript source to walk",
        );
    }

    let mut errors = unresolved(&index);
    errors.extend(inverted(&index));
    errors.extend(
        cycles(&module_edges(&index))
            .iter()
            .map(|cycle| format!("module cycle: {}", render_cycle(cycle))),
    );

    // A cycle between two files of one module is survivable far more often than
    // one between modules — ESM hoists a function declaration out of it — so it
    // is reported without failing the run.
    let warnings: Vec<String> = cycles(&file_edges(&index))
        .iter()
        .map(|cycle| format!("import cycle: {}", render_cycle(cycle)))
        .collect();

    let edges: usize = index
        .files
        .iter()
        .map(|file| file.imports.len())
        .sum::<usize>();
    let scope = format!(
        "{} file{} · {edges} import{}",
        index.files.len(),
        if index.files.len() == 1 { "" } else { "s" },
        if edges == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Imports,
        &scope,
        "every import resolves and points inwards",
        errors,
        warnings,
    )
    .with_hint("A dependency points inwards: controller → service → repository → entity")
}
