// Issue-id adoption: renaming a locally-created issue file to the id the
// tracker assigned, and repointing every dependency reference across the
// project — split out of the parent module to keep it under the
// file-size budget.

use std::path::{Path, PathBuf};

/// Roots holding the modules and packages that own an `issues/` directory.
const ISSUE_ROOTS: &[&str] = &["modules", "packages"];

/// The project root an `issues/` directory belongs to, i.e. the parent of the
/// `modules/` or `packages/` group holding its owner.
fn project_root(issues_dir: &Path) -> Option<&Path> {
    let group = issues_dir.parent()?.parent()?;
    let name = group.file_name()?.to_string_lossy().to_string();
    ISSUE_ROOTS
        .contains(&name.as_str())
        .then(|| group.parent())
        .flatten()
}

/// Every issue file in the project, across `modules/` and `packages/`.
fn project_issue_files(root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for group in ISSUE_ROOTS {
        let Ok(owners) = std::fs::read_dir(root.join(group)) else {
            continue;
        };
        for owner in owners.flatten() {
            let Ok(entries) = std::fs::read_dir(owner.path().join("issues")) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().is_some_and(|ext| ext == "yml") {
                    files.push(path);
                }
            }
        }
    }
    files.sort();
    files
}

/// True when `id` sits at `at` as a whole token rather than inside a longer
/// identifier, so `OON-1` never matches within `OON-12`.
fn is_token_at(line: &str, at: usize, id: &str) -> bool {
    let is_word = |c: char| c.is_ascii_alphanumeric() || c == '-' || c == '_';
    let before = line[..at].chars().next_back();
    let after = line[at + id.len()..].chars().next();
    !before.is_some_and(is_word) && !after.is_some_and(is_word)
}

/// Swap every whole-token occurrence of `old_id` in a single line.
fn replace_id_token(line: &str, old_id: &str, new_id: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut rest = 0;
    while let Some(found) = line[rest..].find(old_id) {
        let at = rest + found;
        out.push_str(&line[rest..at]);
        if is_token_at(line, at, old_id) {
            out.push_str(new_id);
        } else {
            out.push_str(old_id);
        }
        rest = at + old_id.len();
    }
    out.push_str(&line[rest..]);
    out
}

/// Rewrite the `dependencies` entries pointing at `old_id`, touching only the
/// lines of that block so the rest of the file keeps its formatting. Returns
/// `None` when the file does not depend on `old_id`.
pub fn repoint_dependencies(source: &str, old_id: &str, new_id: &str) -> Option<String> {
    let mut lines: Vec<String> = source.lines().map(str::to_string).collect();
    let mut in_block = false;
    let mut changed = false;
    for line in &mut lines {
        if let Some(inline) = line.strip_prefix("dependencies:") {
            // A value on the key line is a flow sequence (`[A, B]`), which ends
            // the block right away; an empty one opens an indented block.
            in_block = inline.trim().is_empty();
            let updated = replace_id_token(line, old_id, new_id);
            changed |= updated != *line;
            *line = updated;
            continue;
        }
        if !in_block {
            continue;
        }
        if !line.trim().is_empty() && !line.starts_with([' ', '\t']) {
            in_block = false;
            continue;
        }
        let updated = replace_id_token(line, old_id, new_id);
        changed |= updated != *line;
        *line = updated;
    }
    if !changed {
        return None;
    }
    let mut out = lines.join("\n");
    if source.ends_with('\n') {
        out.push('\n');
    }
    Some(out)
}

/// Set the top-level `id` of an issue file, adding it as the first key when the
/// file does not declare one yet.
pub fn set_issue_id(source: &str, new_id: &str) -> String {
    let entry = format!("id: \"{new_id}\"");
    if !source.lines().any(|line| line.starts_with("id:")) {
        return format!("{entry}\n{source}");
    }
    let mut out = source
        .lines()
        .map(|line| {
            if line.starts_with("id:") {
                entry.clone()
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    if source.ends_with('\n') {
        out.push('\n');
    }
    out
}

/// Adopt the id the tracker assigned: stamp it into the issue file, move the
/// file to `<new_id>.yml`, and repoint every issue in the project that depends
/// on the old id. A no-op when the tracker kept the local id.
pub fn adopt_issue_id(
    module: &str,
    issues_dir: &Path,
    file_path: &Path,
    old_id: &str,
    new_id: &str,
) {
    if new_id.is_empty() || new_id == old_id {
        return;
    }
    let Ok(source) = std::fs::read_to_string(file_path) else {
        crate::utils::error(format!("Failed to read {}", file_path.display()));
        return;
    };
    let new_file_path = issues_dir.join(format!("{new_id}.yml"));
    if let Err(error) = std::fs::write(&new_file_path, set_issue_id(&source, new_id)) {
        crate::utils::error(format!(
            "Failed to write {}: {error}",
            new_file_path.display()
        ));
        return;
    }
    if new_file_path != file_path {
        let _ = std::fs::remove_file(file_path);
    }
    let root = project_root(issues_dir);
    let renamed = root.map_or_else(
        || format!("modules/{module}/issues/{old_id}.yml"),
        |root| crate::commands::issue_check::relative_to(root, file_path),
    );
    crate::utils::success(format!("{renamed} renamed to {new_id}.yml"));

    let Some(root) = root else {
        return;
    };
    for path in project_issue_files(root) {
        if path == new_file_path {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Some(updated) = repoint_dependencies(&content, old_id, new_id) else {
            continue;
        };
        if std::fs::write(&path, updated).is_ok() {
            crate::utils::success(format!(
                "{} now depends on {new_id}",
                crate::commands::issue_check::relative_to(root, &path)
            ));
        }
    }
}
