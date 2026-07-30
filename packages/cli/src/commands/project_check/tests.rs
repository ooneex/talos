//! Tests check — that a module carrying a `tests/` directory actually tests
//! something.
//!
//! How thoroughly a module is covered is a judgement call the check does not
//! make; a `tests/` directory holding no spec file at all is not.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use super::modules::{
    PYTHON_EXTENSIONS, RUST_EXTENSIONS, TS_EXTENSIONS, WorkspaceModule, collect_files,
    discover_modules, filter_modules, python_source_dirs, wanted_names,
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

/// Rust files that only wire a crate together: `mod.rs` re-exports, the crate
/// roots, and the binary entry point.
const EXEMPT_RUST_STEMS: [&str; 5] = ["mod", "lib", "main", "types", "constants"];

/// Python files that only wire a package together or configure it.
const EXEMPT_PYTHON_STEMS: [&str; 7] = [
    "__init__",
    "__main__",
    "conftest",
    "setup",
    "types",
    "constants",
    "settings",
];

/// The language a module's sources are written in, which decides where its
/// tests live and what they are called.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Language {
    TypeScript,
    Rust,
    Python,
}

impl Language {
    fn of(module: &WorkspaceModule) -> Self {
        if module.is_rust() {
            Language::Rust
        } else if module.is_python_only() {
            Language::Python
        } else {
            Language::TypeScript
        }
    }

    fn extensions(self) -> &'static [&'static str] {
        match self {
            Language::TypeScript => TS_EXTENSIONS,
            Language::Rust => RUST_EXTENSIONS,
            Language::Python => PYTHON_EXTENSIONS,
        }
    }
}

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

/// Whether a Python source file is expected to have a spec. A module exposing
/// only private helpers is exercised through the module that calls it.
pub fn python_needs_test(stem: &str, content: &str) -> bool {
    if EXEMPT_PYTHON_STEMS.contains(&stem.to_ascii_lowercase().as_str()) {
        return false;
    }
    content.lines().any(|line| {
        let Some(name) = line
            .strip_prefix("def ")
            .or_else(|| line.strip_prefix("class "))
            .or_else(|| line.strip_prefix("async def "))
        else {
            return false;
        };
        !name.starts_with('_')
    })
}

/// Whether a Rust source file is expected to have a spec. A module that only
/// declares `pub mod` re-exports, types or constants holds no behaviour.
pub fn rust_needs_test(stem: &str, content: &str) -> bool {
    if EXEMPT_RUST_STEMS.contains(&stem.to_ascii_lowercase().as_str()) {
        return false;
    }
    // An inline `#[cfg(test)]` module is the test, so the file is covered.
    if content.contains("#[cfg(test)]") {
        return false;
    }
    content
        .lines()
        .any(|line| line.trim_start().starts_with("pub fn "))
}

/// A module carrying a `tests/` directory that holds no spec file at all.
pub fn missing_specs(module: &WorkspaceModule) -> Vec<String> {
    let language = Language::of(module);
    let extensions = language.extensions();
    // A Python package commonly keeps its sources in a top-level package
    // directory rather than in `src/`.
    let roots = match language {
        Language::Python => python_source_dirs(module),
        _ => vec![module.dir.join("src")],
    };

    let specs: BTreeSet<String> = collect_files(&module.dir.join("tests"), extensions, 8)
        .iter()
        .filter_map(|path| path.file_stem().and_then(|stem| stem.to_str()))
        .map(str::to_string)
        .collect();

    let sources: Vec<PathBuf> = roots
        .iter()
        .flat_map(|root| collect_files(root, extensions, 8))
        .collect();

    if !specs.is_empty() {
        return Vec::new();
    }

    // A crate testing everything inline, or a package holding nothing worth
    // testing, needs no file in `tests/`.
    if language != Language::TypeScript
        && sources
            .iter()
            .all(|path| !source_needs_test(language, path))
    {
        return Vec::new();
    }

    vec![format!(
        "{}: tests/ exists but holds no spec file",
        module.label()
    )]
}

/// Whether a file on disk declares behaviour worth a test of its own.
fn source_needs_test(language: Language, path: &Path) -> bool {
    let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
        return false;
    };
    let Ok(content) = fs::read_to_string(path) else {
        return false;
    };
    match language {
        Language::Rust => rust_needs_test(stem, &content),
        Language::Python => python_needs_test(stem, &content),
        Language::TypeScript => needs_test(stem, &content),
    }
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
