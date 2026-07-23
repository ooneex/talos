use std::fs;
use std::path::Path;

use regex::Regex;

pub const COMMIT_TYPES: &[&str] = &[
    "build", "chore", "ci", "docs", "feat", "fix", "perf", "refactor", "revert", "style", "test",
];
pub const HEADER_MAX_LENGTH: usize = 100;
pub const BODY_MAX_LINE_LENGTH: usize = 100;
pub const COMMON_SCOPE: &str = "common";
const SCOPE_ROOTS: &[&str] = &["packages", "modules"];

fn split_scopes(scope: &str) -> Vec<String> {
    scope
        .split([',', '/', '\\'])
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(str::to_string)
        .collect()
}

pub fn get_valid_scopes(root_dir: &Path) -> Vec<String> {
    let mut scopes = std::collections::BTreeSet::from([COMMON_SCOPE.to_string()]);

    for root in SCOPE_ROOTS {
        let root_path = root_dir.join(root);
        let Ok(entries) = fs::read_dir(root_path) else {
            continue;
        };
        for entry in entries.flatten() {
            if !entry.path().is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            if entry.path().join("package.json").exists() {
                scopes.insert(name);
            }
        }
    }

    scopes.into_iter().collect()
}

pub fn lint_commit_message(message: &str, valid_scopes: &[String]) -> Vec<String> {
    let mut errors = Vec::new();
    let normalized = message.replace("\r\n", "\n");
    let lines: Vec<&str> = normalized.split('\n').collect();
    let header = lines.first().copied().unwrap_or_default();

    let ignored_header = Regex::new(r"^(Merge |Revert |Reverts |fixup! |squash! |amend! )").ok();
    if ignored_header
        .as_ref()
        .is_some_and(|re| re.is_match(header))
    {
        return errors;
    }

    if header.len() > HEADER_MAX_LENGTH {
        errors.push(format!(
            "Header must be at most {HEADER_MAX_LENGTH} characters (got {}).",
            header.len()
        ));
    }

    let header_regex = Regex::new(r"^(\w+)(?:\(([^)]*)\))?(!)?: (.+)$").ok();
    let Some(caps) = header_regex.as_ref().and_then(|re| re.captures(header)) else {
        errors.push(
            "Header must follow the \"type(scope): Subject\" format, e.g. \"feat(common): Add login\"."
                .to_string(),
        );
        return errors;
    };

    let r#type = caps.get(1).map(|m| m.as_str()).unwrap_or_default();
    let scope = caps.get(2).map(|m| m.as_str());
    let subject = caps.get(4).map(|m| m.as_str()).unwrap_or_default();

    if r#type != r#type.to_lowercase() {
        errors.push(format!("Type \"{}\" must be lower-case.", r#type));
    }
    if !COMMIT_TYPES.contains(&r#type.to_lowercase().as_str()) {
        errors.push(format!(
            "Type \"{}\" must be one of: {}.",
            r#type,
            COMMIT_TYPES.join(", ")
        ));
    }

    if scope.is_none_or(|scope| scope.trim().is_empty()) {
        errors.push(format!(
            "Scope must not be empty — use \"{COMMON_SCOPE}\" or a package/module name."
        ));
    } else if let Some(scope) = scope {
        for entry in split_scopes(scope) {
            if entry != entry.to_lowercase() {
                errors.push(format!("Scope \"{entry}\" must be lower-case."));
            }
            if !valid_scopes.contains(&entry.to_lowercase()) {
                errors.push(format!(
                    "Scope \"{entry}\" is not valid — use \"{COMMON_SCOPE}\" or a package/module name."
                ));
            }
        }
    }

    let trimmed_subject = subject.trim();
    if trimmed_subject.is_empty() {
        errors.push("Subject must not be empty.".to_string());
    } else {
        if trimmed_subject.ends_with('.') {
            errors.push("Subject must not end with a period (\".\").".to_string());
        }
        if trimmed_subject
            .chars()
            .next()
            .is_some_and(|ch| ch.is_ascii_lowercase())
        {
            errors.push(
                "Subject must start with an upper-case letter (sentence, start, pascal or upper case)."
                    .to_string(),
            );
        }
    }

    if lines.len() > 1 {
        if lines.get(1).copied().unwrap_or_default().trim() != "" {
            errors.push("There must be a blank line between the header and the body.".to_string());
        }
        for (index, line) in lines.iter().enumerate().skip(2) {
            if line.len() > BODY_MAX_LINE_LENGTH {
                errors.push(format!(
                    "Body line {} must be at most {BODY_MAX_LINE_LENGTH} characters (got {}).",
                    index + 1,
                    line.len()
                ));
            }
        }
    }

    errors
}

pub fn strip_commit_comments(raw: &str) -> String {
    let scissors_regex = Regex::new(r"^# -+ >8 -+").ok();
    let mut result = Vec::new();

    let normalized = raw.replace("\r\n", "\n");
    for line in normalized.split('\n') {
        if scissors_regex.as_ref().is_some_and(|re| re.is_match(line)) {
            break;
        }
        if line.starts_with('#') {
            continue;
        }
        result.push(line);
    }

    result.join("\n").trim().to_string()
}

pub fn check_commit_message_file(file_path: &Path, root_dir: &Path) -> Vec<String> {
    let Ok(raw) = fs::read_to_string(file_path) else {
        return vec![format!("Failed to read {}", file_path.display())];
    };
    let message = strip_commit_comments(&raw);
    if message.is_empty() {
        return Vec::new();
    }
    let scopes = get_valid_scopes(root_dir);
    lint_commit_message(&message, &scopes)
}
