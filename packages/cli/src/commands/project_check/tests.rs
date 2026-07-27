//! Tests check — the mirror between `src/` and `tests/`.
//!
//! The convention is one `.spec.ts` per source file that holds behaviour. A
//! class that never grew a test is the one that breaks silently.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use super::modules::{
    WorkspaceModule, collect_files, discover_modules, filter_modules, wanted_names,
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

/// The spec file names that count as covering `stem`.
pub fn spec_names(stem: &str) -> [String; 2] {
    [format!("{stem}.spec"), format!("{stem}.test")]
}

/// Source stems with no matching spec, for one module.
pub fn missing_specs(module: &WorkspaceModule) -> Vec<String> {
    let specs: BTreeSet<String> = collect_files(&module.dir.join("tests"), &["ts", "tsx"], 8)
        .iter()
        .filter_map(|path| path.file_stem().and_then(|stem| stem.to_str()))
        .map(str::to_string)
        .collect();

    if specs.is_empty() {
        return vec![format!(
            "{}: tests/ exists but holds no spec file",
            module.label()
        )];
    }

    let mut missing = Vec::new();
    for path in collect_files(&module.dir.join("src"), &["ts", "tsx"], 8) {
        let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        if path.to_string_lossy().ends_with(".d.ts") {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        if !needs_test(stem, &content) {
            continue;
        }
        if spec_names(stem).iter().any(|name| specs.contains(name)) {
            continue;
        }
        missing.push(format!(
            "{}: `{stem}` has no test in tests/",
            module.label()
        ));
    }
    missing
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
        "every source file has a spec",
        Vec::new(),
        warnings,
    )
    .with_hint("Tests mirror src/ — a public method with logic needs a happy path and an edge case")
}
