//! Todos check — the markers that point at an issue, and the issue they point
//! at.
//!
//! The hygiene check already refuses a bare `TODO`, so what is left is the good
//! kind: `TODO(OON-123456)`, a note tied to work that is tracked somewhere. That
//! only stays honest while the two agree. An id nobody can resolve is a bare
//! TODO wearing a costume, and a marker still sitting in the source after its
//! issue was closed is a promise the codebase is quietly breaking — the work
//! shipped, the note says it did not.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::modules::{
    MODULE_GROUPS, collect_files, discover_modules, filter_modules, relative, wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, EXCLUDED_DIRS, ProjectCheckArgs, SCANNED_EXTENSIONS,
    static_outcome,
};

/// States meaning the work behind the marker is finished.
const CLOSED_STATES: [&str; 2] = ["Done", "Canceled"];

fn marker_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // The forms the conventions allow: `TODO(OON-123456)` and the same with
        // a colon or a dash after the identifier.
        Regex::new(r"\b(TODO|FIXME|HACK|XXX)\s*[(\[]\s*([A-Z][A-Z0-9]{1,9}-\d+)\s*[)\]]")
            .expect("the marker pattern is valid")
    })
}

/// One marker naming an issue.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Marker {
    pub kind: String,
    pub issue: String,
    pub file: String,
    pub line: usize,
}

/// Every issue-bearing marker in a file.
pub fn markers(content: &str, file: &str) -> Vec<Marker> {
    let mut found = Vec::new();

    for (number, line) in content.lines().enumerate() {
        for captured in marker_pattern().captures_iter(line) {
            let (Some(kind), Some(issue)) = (captured.get(1), captured.get(2)) else {
                continue;
            };
            found.push(Marker {
                kind: kind.as_str().to_string(),
                issue: issue.as_str().to_string(),
                file: file.to_string(),
                line: number + 1,
            });
        }
    }

    found
}

/// The `state:` an issue file declares.
pub fn state_of(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    content.lines().find_map(|line| {
        let value = line.strip_prefix("state:")?;
        let value = value.split('#').next().unwrap_or(value);
        Some(value.trim().trim_matches(['"', '\'']).to_string())
    })
}

/// Every issue the repository holds, id → its state.
pub fn issues(root: &Path) -> BTreeMap<String, Option<String>> {
    let mut found = BTreeMap::new();

    for group in MODULE_GROUPS {
        let Ok(entries) = fs::read_dir(root.join(group)) else {
            continue;
        };
        for entry in entries.flatten() {
            let directory = entry.path().join("issues");
            if !directory.is_dir() {
                continue;
            }
            let Ok(files) = fs::read_dir(&directory) else {
                continue;
            };
            for file in files.flatten() {
                let path = file.path();
                let Some(id) = path.file_stem().and_then(|stem| stem.to_str()) else {
                    continue;
                };
                if path.extension().and_then(|ext| ext.to_str()) != Some("yml") {
                    continue;
                }
                found.insert(id.to_string(), state_of(&path));
            }
        }
    }

    found
}

/// Markers pointing at an issue that does not exist, or at one already closed.
pub fn inspect(
    markers: &[Marker],
    issues: &BTreeMap<String, Option<String>>,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    for marker in markers {
        let Some(state) = issues.get(&marker.issue) else {
            errors.push(format!(
                "{}:{}: {}({}) names an issue the repository does not hold",
                marker.file, marker.line, marker.kind, marker.issue
            ));
            continue;
        };

        let Some(state) = state.as_deref() else {
            warnings.push(format!(
                "{}:{}: {} declares no state",
                marker.file, marker.line, marker.issue
            ));
            continue;
        };

        if CLOSED_STATES.contains(&state) {
            warnings.push(format!(
                "{}:{}: {}({}) is still here though the issue is {state}",
                marker.file, marker.line, marker.kind, marker.issue
            ));
        }
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );

    let mut found = Vec::new();
    let mut counted = 0;

    for module in &modules {
        for path in collect_files(&module.dir, SCANNED_EXTENSIONS, 8) {
            // The issue files themselves name their own id in every line.
            if path
                .components()
                .any(|component| component.as_os_str() == "issues")
            {
                continue;
            }
            if path.components().any(|component| {
                component
                    .as_os_str()
                    .to_str()
                    .is_some_and(|name| EXCLUDED_DIRS.contains(&name))
            }) {
                continue;
            }
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            counted += 1;
            found.extend(markers(&content, &relative(root, &path)));
        }
    }

    if found.is_empty() {
        return CheckOutcome::new(
            CheckId::Todos,
            CheckStatus::Skipped,
            format!("{counted} files · no issue-bearing marker"),
        );
    }

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    inspect(&found, &issues(root), &mut errors, &mut warnings);

    let scope = format!(
        "{} marker{}",
        found.len(),
        if found.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Todos,
        &scope,
        "every marker names an open issue",
        errors,
        warnings,
    )
    .with_hint("Pull the issue with `talos issue:pull`, or delete the marker once it has landed")
}
