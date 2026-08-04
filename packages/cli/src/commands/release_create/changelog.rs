// Changelog and Cargo.toml version-bump writers, split out of the parent
// module to keep it under the file-size budget.

use std::fs;
use std::path::Path;

use super::CommitInfo;

pub fn update_changelog(
    dir: &Path,
    version: &str,
    tag: &str,
    commits: &[CommitInfo],
    repo_url: Option<&str>,
) {
    let changelog_path = dir.join("CHANGELOG.md");
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let mut groups: std::collections::BTreeMap<&str, Vec<&CommitInfo>> =
        std::collections::BTreeMap::new();
    let category = |ty: &str| match ty {
        "feat" => "Added",
        "fix" => "Fixed",
        "revert" => "Removed",
        _ => "Changed",
    };
    for commit in commits {
        groups
            .entry(category(&commit.r#type))
            .or_default()
            .push(commit);
    }
    let version_link = repo_url
        .map(|repo| format!("[{version}]({repo}/releases/tag/{tag})"))
        .unwrap_or_else(|| format!("[{version}]"));
    let mut section = format!("## {version_link} - {today}\n");
    for cat in [
        "Added",
        "Changed",
        "Deprecated",
        "Removed",
        "Fixed",
        "Security",
    ] {
        if let Some(list) = groups.get(cat) {
            if list.is_empty() {
                continue;
            }
            section.push_str(&format!("\n### {cat}\n\n"));
            for commit in list {
                let link = repo_url
                    .map(|repo| format!(" ([{}]({repo}/commit/{}))", commit.hash, commit.hash))
                    .unwrap_or_default();
                section.push_str(&format!(
                    "- {} — {}{}\n",
                    commit.subject, commit.author, link
                ));
            }
        }
    }
    let existing = fs::read_to_string(&changelog_path).unwrap_or_default();
    let new_content = if existing.is_empty() {
        format!("# Changelog\n\n{section}\n")
    } else if let Some(index) = existing.find("## [Unreleased]") {
        let end = existing[index..]
            .find('\n')
            .map(|n| index + n + 1)
            .unwrap_or(existing.len());
        format!("{}\n{}\n{}", &existing[..end], section, &existing[end..])
    } else {
        format!("{}\n\n{}\n", existing.trim_end(), section)
    };
    let _ = fs::write(changelog_path, new_content);
}

pub fn update_cargo_version(path: &Path, new_version: &str) {
    let Ok(content) = fs::read_to_string(path) else {
        return;
    };
    let mut in_package = false;
    let mut updated = false;
    let mut lines: Vec<String> = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_package = trimmed == "[package]";
        }
        if in_package
            && !updated
            && trimmed
                .split_once('=')
                .map(|(key, _)| key.trim() == "version")
                .unwrap_or(false)
        {
            lines.push(format!("version = \"{new_version}\""));
            updated = true;
            continue;
        }
        lines.push(line.to_string());
    }
    if updated {
        let mut output = lines.join("\n");
        if content.ends_with('\n') {
            output.push('\n');
        }
        let _ = fs::write(path, output);
    }
}
