//! Boundaries check — which modules are allowed to know about which.
//!
//! Path aliases make every module reachable from every other one with a single
//! `@module/…` import, and nothing in `package.json` records that it happened.
//! Two of those crossings are genuinely dangerous: server code pulled into a
//! browser bundle ships secrets and Node APIs to the client, and browser code
//! pulled into a server module drags a whole render tree into the API process.
//! The rest are architectural drift, reported as warnings.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use super::graph::SourceIndex;
use super::modules::{WorkspaceModule, discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Module types that run in a browser.
const BROWSER_TYPES: [&str; 5] = ["spa", "admin", "design", "storybook", "swagger"];

/// Module types that run on a server.
const SERVER_TYPES: [&str; 3] = ["api", "microservice", "module"];

/// Where a module runs, which is what makes a crossing dangerous rather than
/// merely untidy.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Runtime {
    Browser,
    Server,
    /// A published client, and the one module both sides may import.
    Shared,
    Unknown,
}

pub fn runtime_of(kind: Option<&str>) -> Runtime {
    match kind {
        Some(kind) if BROWSER_TYPES.contains(&kind) => Runtime::Browser,
        Some(kind) if SERVER_TYPES.contains(&kind) => Runtime::Server,
        Some("sdk") => Runtime::Shared,
        _ => Runtime::Unknown,
    }
}

/// What one module is allowed to import from another, by type.
///
/// The softer rules read as architecture: a design system that imports an
/// application cannot be reused by a second one, and a storybook exists to
/// document a design module rather than to build a feature.
pub fn verdict(from: Option<&str>, to: Option<&str>) -> Option<(bool, String)> {
    let (Some(from_kind), Some(to_kind)) = (from, to) else {
        return None;
    };
    if from_kind == to_kind {
        return None;
    }

    match (runtime_of(from), runtime_of(to)) {
        (Runtime::Browser, Runtime::Server) => Some((
            true,
            format!("a {from_kind} bundles a {to_kind}: server code would ship to the browser"),
        )),
        (Runtime::Server, Runtime::Browser) => Some((
            true,
            format!("a {from_kind} imports a {to_kind}: browser code would load in the server"),
        )),
        _ => match (from_kind, to_kind) {
            // A design system is the bottom of the stack: it depends on nothing
            // in the workspace, which is what makes it reusable.
            ("design", _) => Some((
                false,
                format!("a design module depends on a {to_kind} — it should depend on nothing"),
            )),
            ("storybook", to) if to != "design" => Some((
                false,
                format!("a storybook documents a design module, not a {to}"),
            )),
            // A swagger documents its target's routes through generated route
            // metas, which copy the contract rather than import it. The design
            // module it is styled from is the one thing it may reach for.
            ("swagger", to) if to != "design" => Some((
                false,
                format!(
                    "a swagger is generated from its target's routes and should not import a {to}"
                ),
            )),
            ("sdk", _) => Some((
                false,
                format!(
                    "an sdk is generated from its target's routes and should not import a {to_kind}"
                ),
            )),
            _ => None,
        },
    }
}

/// Every module-to-module edge, with the file that first draws it.
pub fn edges(index: &SourceIndex) -> BTreeMap<(String, String), String> {
    let mut edges = BTreeMap::new();

    for file in &index.files {
        for import in &file.imports {
            let Some(target) = &import.module else {
                continue;
            };
            if target == &file.module {
                continue;
            }
            edges
                .entry((file.module.clone(), target.clone()))
                .or_insert_with(|| format!("{} imports `{}`", file.label, import.specifier));
        }
    }

    edges
}

/// Compare every crossing against the rules.
pub fn inspect(
    index: &SourceIndex,
    modules: &[WorkspaceModule],
) -> (Vec<String>, Vec<String>, usize) {
    let kinds: BTreeMap<&str, Option<&str>> = modules
        .iter()
        .map(|module| (module.name.as_str(), module.kind.as_deref()))
        .collect();

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let edges = edges(index);

    for ((from, to), evidence) in &edges {
        let (Some(from_kind), Some(to_kind)) = (kinds.get(from.as_str()), kinds.get(to.as_str()))
        else {
            continue;
        };
        let Some((blocking, reason)) = verdict(*from_kind, *to_kind) else {
            continue;
        };
        let line = format!("{from} → {to}: {reason} ({evidence})");
        if blocking {
            errors.push(line);
        } else {
            warnings.push(line);
        }
    }

    (errors, warnings, edges.len())
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );
    // Typed modules are what the rules are written against, and a workspace has
    // to hold at least two of them to have a boundary at all.
    let typed: BTreeSet<&str> = modules
        .iter()
        .filter_map(|module| module.kind.as_deref())
        .collect();
    if typed.len() < 2 {
        return CheckOutcome::new(
            CheckId::Boundaries,
            CheckStatus::Skipped,
            "fewer than two typed modules to keep apart",
        );
    }

    let index = SourceIndex::build(root, &modules);
    let (errors, warnings, crossings) = inspect(&index, &modules);

    let scope = format!(
        "{crossings} crossing{}",
        if crossings == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Boundaries,
        &scope,
        "every module import respects its runtime",
        errors,
        warnings,
    )
    .with_hint("A browser module reaches the server through the generated sdk, never directly")
}
