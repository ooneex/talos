//! Git check — what the repository is carrying that it should not.
//!
//! Build output and dependency trees that slip past `.gitignore` bloat every
//! clone permanently, and once committed they can never really be removed.

use std::path::Path;

use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Patterns that must be ignored, with the reason they matter.
const REQUIRED_IGNORES: [(&str, &str); 4] = [
    ("node_modules", "dependency trees"),
    (".env", "environment secrets"),
    ("dist", "build output"),
    (".DS_Store", "macOS metadata"),
];

/// Path fragments that mark a tracked file as build or dependency output.
const FORBIDDEN_FRAGMENTS: [&str; 4] = ["node_modules/", "/dist/", "/.next/", "/coverage/"];

/// Whether `.gitignore` covers a pattern, allowing for the usual decorations
/// (`/node_modules`, `node_modules/`, `**/dist`, `.env*`).
pub fn ignores(gitignore: &str, pattern: &str) -> bool {
    gitignore.lines().any(|line| {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with('!') {
            return false;
        }
        let cleaned = line
            .trim_start_matches("**/")
            .trim_start_matches('/')
            .trim_end_matches('/')
            .trim_end_matches("/**")
            .trim_end_matches('*');
        cleaned == pattern || cleaned == pattern.trim_end_matches('*')
    })
}

/// Tracked paths that should never have been committed.
pub fn forbidden(paths: &[String]) -> Vec<String> {
    paths
        .iter()
        .filter(|path| {
            let padded = format!("/{path}");
            FORBIDDEN_FRAGMENTS
                .iter()
                .any(|fragment| padded.contains(fragment))
        })
        .cloned()
        .collect()
}

/// Every path in the index.
fn tracked_files(repo: &git2::Repository) -> Vec<String> {
    let Ok(index) = repo.index() else {
        return Vec::new();
    };
    index
        .iter()
        .filter_map(|entry| String::from_utf8(entry.path.clone()).ok())
        .collect()
}

pub fn run(_args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let Some(repo) = crate::utils::discover_git_repo(root) else {
        return CheckOutcome::new(CheckId::Git, CheckStatus::Skipped, "not a git repository");
    };

    let tracked = tracked_files(&repo);
    if tracked.is_empty() {
        return CheckOutcome::new(CheckId::Git, CheckStatus::Skipped, "nothing is tracked yet");
    }

    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    for path in forbidden(&tracked) {
        errors.push(format!(
            "{path} is tracked but is build or dependency output"
        ));
    }

    let gitignore = std::fs::read_to_string(root.join(".gitignore")).unwrap_or_default();
    if gitignore.trim().is_empty() {
        warnings.push("no .gitignore at the workspace root".to_string());
    } else {
        for (pattern, reason) in REQUIRED_IGNORES {
            if !ignores(&gitignore, pattern) {
                warnings.push(format!(
                    "`.gitignore` does not cover `{pattern}` ({reason})"
                ));
            }
        }
    }

    let scope = format!(
        "{} tracked file{}",
        tracked.len(),
        if tracked.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Git,
        &scope,
        "the index is clean of build output",
        errors,
        warnings,
    )
    .with_hint("Removing a committed file from history requires a rewrite — catch it early")
}
