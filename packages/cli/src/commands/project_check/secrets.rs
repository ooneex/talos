//! Secrets check — credentials that must never be committed.
//!
//! The security check only knows about vulnerable *dependencies*. This one
//! looks at the repository itself: high-confidence credential formats, and any
//! environment or key file that git is actually tracking.

use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::modules::{collect_files, relative};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, SCANNED_EXTENSIONS, static_outcome,
};

/// Substrings that mark a value as an obvious placeholder rather than a leak.
const PLACEHOLDERS: [&str; 14] = [
    "process.env",
    "${",
    "env.",
    "<",
    "your",
    "changeme",
    "change-me",
    "example",
    "sample",
    "placeholder",
    "dummy",
    "xxx",
    "***",
    "redacted",
];

/// Paths where a fake credential is expected and must not fail the check.
const FIXTURE_HINTS: [&str; 6] = [
    "tests",
    "test",
    "fixtures",
    "mocks",
    "templates",
    "__mocks__",
];

/// A credential-looking string found in a file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SecretFinding {
    pub line: usize,
    pub rule: &'static str,
    pub message: String,
    /// High-confidence formats fail the check; heuristics only warn.
    pub confident: bool,
}

/// The credential formats that are unambiguous enough to fail a build.
fn known_formats() -> &'static [(&'static str, Regex)] {
    static FORMATS: OnceLock<Vec<(&'static str, Regex)>> = OnceLock::new();
    FORMATS
        .get_or_init(|| {
            [
                ("private-key", r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
                ("aws-access-key", r"\bAKIA[0-9A-Z]{16}\b"),
                ("github-token", r"\bgh[pousr]_[A-Za-z0-9]{36,}\b"),
                ("slack-token", r"\bxox[abprs]-[A-Za-z0-9-]{10,}"),
                ("stripe-key", r"\bsk_live_[A-Za-z0-9]{16,}\b"),
                ("google-api-key", r"\bAIza[0-9A-Za-z_\-]{35}\b"),
                ("openai-key", r"\bsk-[A-Za-z0-9_\-]{40,}\b"),
                ("npm-token", r"\bnpm_[A-Za-z0-9]{36}\b"),
            ]
            .into_iter()
            .filter_map(|(rule, pattern)| Regex::new(pattern).ok().map(|regex| (rule, regex)))
            .collect()
        })
        .as_slice()
}

/// `password = "…"`-style assignments, which only ever warn.
fn assignment_format() -> &'static Regex {
    static ASSIGNMENT: OnceLock<Regex> = OnceLock::new();
    ASSIGNMENT.get_or_init(|| {
        Regex::new(
            r#"(?i)\b(password|passwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|client[_-]?secret)\s*[:=]\s*["']([^"']{8,})["']"#,
        )
        .expect("the assignment pattern is valid")
    })
}

/// Whether a value looks like a real credential rather than a stand-in.
pub fn looks_like_secret(value: &str) -> bool {
    let lowered = value.to_ascii_lowercase();
    if PLACEHOLDERS
        .iter()
        .any(|placeholder| lowered.contains(placeholder))
    {
        return false;
    }
    // A short, purely alphabetic value is almost always a fixture password.
    value.len() >= 16 || value.chars().any(|character| character.is_ascii_digit())
}

/// Scan one file's content. In a `fixture` path a credential-shaped string is
/// expected, so findings are downgraded to warnings instead of being trusted.
pub fn scan_content(content: &str, fixture: bool) -> Vec<SecretFinding> {
    let mut findings = Vec::new();

    for (index, line) in content.lines().enumerate() {
        let number = index + 1;

        for (rule, regex) in known_formats() {
            if regex.is_match(line) {
                findings.push(SecretFinding {
                    line: number,
                    rule,
                    message: if fixture {
                        format!("credential-shaped string ({rule}) — expected in a fixture?")
                    } else {
                        format!("hardcoded credential ({rule})")
                    },
                    confident: !fixture,
                });
            }
        }

        if fixture {
            continue;
        }
        if let Some(captured) = assignment_format().captures(line) {
            let key = captured.get(1).map_or("", |group| group.as_str());
            let value = captured.get(2).map_or("", |group| group.as_str());
            if looks_like_secret(value) {
                findings.push(SecretFinding {
                    line: number,
                    rule: "hardcoded-assignment",
                    message: format!("`{key}` is assigned a literal value"),
                    confident: false,
                });
            }
        }
    }

    findings
}

/// Whether a path is a fixture, template or test where fake secrets live.
pub fn is_fixture_path(path: &str) -> bool {
    let lowered = path.to_ascii_lowercase();
    lowered.contains(".spec.")
        || lowered.contains(".test.")
        || lowered
            .split(['/', '\\'])
            .any(|segment| FIXTURE_HINTS.contains(&segment))
}

/// Whether a tracked file name must never be in version control.
pub fn is_secret_file(name: &str) -> bool {
    if name.contains(".example") || name.ends_with(".dist") || name.ends_with(".sample") {
        return false;
    }
    if name == ".env" || name.starts_with(".env.") {
        return true;
    }
    if name == "id_rsa" || name == "id_ed25519" {
        return true;
    }
    matches!(
        name.rsplit('.').next().unwrap_or_default(),
        "pem" | "p12" | "pfx" | "jks" | "keystore"
    )
}

/// Environment and key files git is tracking, which are leaks by definition.
fn tracked_secret_files(root: &Path) -> Vec<String> {
    let Some(repo) = crate::utils::discover_git_repo(root) else {
        return Vec::new();
    };
    let Ok(index) = repo.index() else {
        return Vec::new();
    };

    let mut tracked: Vec<String> = index
        .iter()
        .filter_map(|entry| String::from_utf8(entry.path).ok())
        .filter(|path| {
            path.rsplit(['/', '\\'])
                .next()
                .map(is_secret_file)
                .unwrap_or(false)
        })
        .collect();
    tracked.sort();
    tracked.dedup();
    tracked
}

pub fn run(_args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let files = collect_files(root, SCANNED_EXTENSIONS, 8);
    let mut errors: Vec<String> = tracked_secret_files(root)
        .into_iter()
        .map(|path| format!("{path} is tracked by git — remove it from the index and rotate it"))
        .collect();
    let mut warnings = Vec::new();

    for path in &files {
        let Ok(content) = fs::read_to_string(path) else {
            continue;
        };
        let label = relative(root, path);
        for finding in scan_content(&content, is_fixture_path(&label)) {
            let line = format!("{label}:{}  {}", finding.line, finding.message);
            if finding.confident {
                errors.push(line);
            } else {
                warnings.push(line);
            }
        }
    }

    if files.is_empty() && errors.is_empty() {
        return CheckOutcome::new(CheckId::Secrets, CheckStatus::Skipped, "no file to scan");
    }

    let scope = format!(
        "{} file{} scanned",
        files.len(),
        if files.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Secrets,
        &scope,
        "no credential in the working tree",
        errors,
        warnings,
    )
    .with_hint("Move the value to `.env.yml` and read it through AppEnv, then rotate the exposed credential")
}
