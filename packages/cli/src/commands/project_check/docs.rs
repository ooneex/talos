//! Docs check — the links a reader will actually click.
//!
//! A relative link that points at a file that no longer exists is the most
//! common form of documentation rot, and the cheapest to detect.

use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::modules::{collect_files, discover_modules, filter_modules, relative, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

fn link_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"\[[^\]]*\]\(([^)\s]+)\)").expect("the markdown link pattern is valid")
    })
}

/// Whether a link target points somewhere on disk, rather than at the network,
/// an anchor, or a template placeholder.
pub fn is_relative_target(target: &str) -> bool {
    if target.is_empty() || target.starts_with('#') || target.starts_with('/') {
        return false;
    }
    if target.contains("://") || target.starts_with("mailto:") || target.starts_with("tel:") {
        return false;
    }
    // `{{ NAME }}` and `<placeholder>` come from the scaffolding templates.
    !target.contains("{{") && !target.starts_with('<')
}

/// The on-disk path a link resolves to, with any `#anchor` or `?query` removed.
pub fn resolve(document: &Path, target: &str) -> Option<std::path::PathBuf> {
    let cleaned = target
        .split('#')
        .next()
        .unwrap_or(target)
        .split('?')
        .next()
        .unwrap_or(target);
    if cleaned.is_empty() {
        return None;
    }
    Some(document.parent()?.join(cleaned))
}

/// Relative links in `content` that do not resolve to a file.
pub fn broken_links(document: &Path, content: &str) -> Vec<String> {
    let mut broken = Vec::new();
    for captured in link_pattern().captures_iter(content) {
        let Some(target) = captured.get(1).map(|group| group.as_str()) else {
            continue;
        };
        if !is_relative_target(target) {
            continue;
        }
        let Some(path) = resolve(document, target) else {
            continue;
        };
        if !path.exists() {
            broken.push(target.to_string());
        }
    }
    broken.sort();
    broken.dedup();
    broken
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );

    let mut errors = Vec::new();
    let mut counted = 0;

    let mut documents = collect_files(root, &["md"], 1);
    for module in &modules {
        documents.extend(collect_files(&module.dir, &["md"], 2));
    }

    for document in documents {
        let Ok(content) = fs::read_to_string(&document) else {
            continue;
        };
        counted += 1;
        let label = relative(root, &document);
        for target in broken_links(&document, &content) {
            errors.push(format!("{label}: link `{target}` does not resolve"));
        }
    }

    if counted == 0 {
        return CheckOutcome::new(CheckId::Docs, CheckStatus::Skipped, "no markdown to check");
    }

    let scope = format!("{counted} document{}", if counted == 1 { "" } else { "s" });

    static_outcome(
        CheckId::Docs,
        &scope,
        "every relative link resolves",
        errors,
        Vec::new(),
    )
    .with_hint("Links are resolved from the file that declares them")
}
