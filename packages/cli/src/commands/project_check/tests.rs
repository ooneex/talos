//! Tests check — that a module carrying a `tests/` directory actually tests
//! something.
//!
//! How thoroughly a module is covered is a judgement call the check does not
//! make; a `tests/` directory holding no spec file at all is not.

use std::collections::BTreeSet;
use std::path::Path;

use super::modules::{
    TS_EXTENSIONS, WorkspaceModule, collect_files, discover_modules, filter_modules, wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Files that hold no behaviour and therefore need no test of their own.
const EXEMPT_STEMS: [&str; 6] = [
    "index",
    "types",
    "constants",
    "enums",
    "config",
    "decorators",
];

/// Whether a source file is expected to have a spec next to it.
pub fn needs_test(stem: &str, content: &str) -> bool {
    if EXEMPT_STEMS.contains(&stem.to_ascii_lowercase().as_str()) {
        return false;
    }
    // Only files that declare behaviour: a class, or an exported function.
    content.contains("class ")
        || content.contains("export function ")
        || content.contains("export const ") && content.contains("=>")
}

/// A module carrying a `tests/` directory that holds no spec file at all.
pub fn missing_specs(module: &WorkspaceModule) -> Vec<String> {
    let specs: BTreeSet<String> = collect_files(&module.dir.join("tests"), TS_EXTENSIONS, 8)
        .iter()
        .filter_map(|path| path.file_stem().and_then(|stem| stem.to_str()))
        .map(str::to_string)
        .collect();

    if !specs.is_empty() {
        return Vec::new();
    }

    vec![format!(
        "{}: tests/ exists but holds no spec file",
        module.label()
    )]
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );
    let tested: Vec<&WorkspaceModule> = modules
        .iter()
        .filter(|module| module.dir.join("tests").is_dir())
        .collect();

    if tested.is_empty() {
        return CheckOutcome::new(
            CheckId::Tests,
            CheckStatus::Skipped,
            "no module carries a tests/ directory",
        );
    }

    let warnings: Vec<String> = tested
        .iter()
        .flat_map(|module| missing_specs(module))
        .collect();

    let scope = format!(
        "{} module{}",
        tested.len(),
        if tested.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Tests,
        &scope,
        "every tests/ directory holds a spec",
        Vec::new(),
        warnings,
    )
    .with_hint("Tests mirror src/ — a public method with logic needs a happy path and an edge case")
}
