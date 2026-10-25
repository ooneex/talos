// Credential-shaped strings in a file. `security:check` uses this when it
// audits assistant instructions.

use std::sync::OnceLock;

use regex::Regex;

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
fn looks_like_secret(value: &str) -> bool {
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

/// The findings a single line produces against every known credential format.
fn known_format_findings(line: &str, number: usize, fixture: bool) -> Vec<SecretFinding> {
    known_formats()
        .iter()
        .filter(|(_, regex)| regex.is_match(line))
        .map(|(rule, _)| SecretFinding {
            line: number,
            rule,
            message: if fixture {
                format!("credential-shaped string ({rule}) — expected in a fixture?")
            } else {
                format!("hardcoded credential ({rule})")
            },
            confident: !fixture,
        })
        .collect()
}

/// The finding a hardcoded assignment produces, when its value looks like a
/// secret rather than a placeholder.
fn assignment_finding(line: &str, number: usize) -> Option<SecretFinding> {
    let captured = assignment_format().captures(line)?;
    let key = captured.get(1).map_or("", |group| group.as_str());
    let value = captured.get(2).map_or("", |group| group.as_str());
    looks_like_secret(value).then(|| SecretFinding {
        line: number,
        rule: "hardcoded-assignment",
        message: format!("`{key}` is assigned a literal value"),
        confident: false,
    })
}

/// Scan one file's content. In a `fixture` path a credential-shaped string is
/// expected, so findings are downgraded to warnings instead of being trusted.
pub fn scan_content(content: &str, fixture: bool) -> Vec<SecretFinding> {
    let mut findings = Vec::new();

    for (index, line) in content.lines().enumerate() {
        let number = index + 1;
        findings.extend(known_format_findings(line, number, fixture));

        if fixture {
            continue;
        }
        if let Some(finding) = assignment_finding(line, number) {
            findings.push(finding);
        }
    }

    findings
}
