//! Container check — whether every injected class is actually bound.
//!
//! `@inject(UserRepository)` only resolves because `UserRepository` carries a
//! decorator that called `container.add` at import time. Drop the decorator, or
//! write the class by hand without one, and nothing complains until the
//! container is built — at which point the whole application refuses to boot on
//! a token nobody can trace back to a file.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::graph::SourceIndex;
use super::modules::{discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

fn binding_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // Every binding decorator ends the same way: it hands the class to
        // `container.add`. `@injectable()` is the bare form of the same thing.
        Regex::new(
            r"(?m)^\s*@(?:decorator\.[a-zA-Z]+|injectable)\s*\([^)]*\)\s*(?:\r?\n\s*)*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)",
        )
        .expect("the binding pattern is valid")
    })
}

fn manual_binding_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"container\.(?:add|bind)\s*(?:<[^>]*>)?\s*\(\s*([A-Za-z0-9_$]+)")
            .expect("the manual binding pattern is valid")
    })
}

fn inject_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"@inject\s*\(\s*([^)]+?)\s*\)").expect("the inject pattern is valid")
    })
}

/// The classes a file binds into the container.
pub fn bindings(content: &str) -> BTreeSet<String> {
    binding_pattern()
        .captures_iter(content)
        .chain(manual_binding_pattern().captures_iter(content))
        .filter_map(|captured| captured.get(1))
        .map(|group| group.as_str().to_string())
        .collect()
}

/// The tokens a file injects, with the line each one sits on.
///
/// A string token is left out: `@inject("database")` names something the
/// framework binds, and there is no file in the workspace to check it against.
pub fn injected(content: &str) -> Vec<(usize, String)> {
    let mut found = Vec::new();

    for (number, line) in content.lines().enumerate() {
        for captured in inject_pattern().captures_iter(line) {
            let Some(token) = captured.get(1).map(|group| group.as_str().trim()) else {
                continue;
            };
            if token.starts_with(['"', '\'', '`']) || token.is_empty() {
                continue;
            }
            // A `Symbol.for(...)` or a member expression is not a class the
            // workspace declares either.
            if !token.chars().all(|character| {
                character.is_alphanumeric() || character == '_' || character == '$'
            }) {
                continue;
            }
            found.push((number + 1, token.to_string()));
        }
    }

    found
}

/// Every class the workspace binds, and every one it injects without binding.
pub fn inspect(index: &SourceIndex) -> Vec<String> {
    let mut bound: BTreeSet<String> = BTreeSet::new();
    let mut contents: BTreeMap<&str, String> = BTreeMap::new();

    for file in &index.files {
        let Ok(content) = fs::read_to_string(&file.path) else {
            continue;
        };
        bound.extend(bindings(&content));
        contents.insert(file.label.as_str(), content);
    }

    let mut findings = Vec::new();
    for file in &index.files {
        let Some(content) = contents.get(file.label.as_str()) else {
            continue;
        };

        // Only a token the workspace itself declares can be checked: anything
        // imported from `@talosjs/*` is bound by the package that exports it.
        let local: BTreeSet<&str> = file
            .imports
            .iter()
            .filter(|import| import.resolved.is_some())
            .flat_map(|import| import.names.iter())
            .map(String::as_str)
            .collect();

        for (line, token) in injected(content) {
            let declared_here = file.exports.contains(&token);
            if !local.contains(token.as_str()) && !declared_here {
                continue;
            }
            if bound.contains(&token) {
                continue;
            }
            findings.push(format!(
                "{}:{line}: `{token}` is injected but no decorator binds it into the container",
                file.label
            ));
        }
    }

    findings.sort();
    findings.dedup();
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
            CheckId::Container,
            CheckStatus::Skipped,
            "no TypeScript source to inspect",
        );
    }

    let errors = inspect(&index);
    let scope = format!(
        "{} file{}",
        index.files.len(),
        if index.files.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Container,
        &scope,
        "every injected class is bound",
        errors,
        Vec::new(),
    )
    .with_hint("A class is bound by its `@decorator.<kind>()` — the generators add it")
}
