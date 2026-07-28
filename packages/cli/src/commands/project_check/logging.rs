//! Logging check — what the application writes down, and what it should not.
//!
//! `console.log` is not a logger. It has no level, no correlation id and no
//! destination, so in production it either disappears or lands in a stream
//! nobody aggregates. The second half matters more: a log line built from a
//! request body or a user record puts a password, a token or a card number into
//! plain text on disk, where it outlives the process, the incident and usually
//! the retention policy.

use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::artifacts::{self, Corpus, is_backend, is_frontend};
use super::modules::{discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Field names that must never reach a log line.
const SENSITIVE: [&str; 14] = [
    "password",
    "passwd",
    "secret",
    "token",
    "apiKey",
    "api_key",
    "authorization",
    "accessToken",
    "refreshToken",
    "privateKey",
    "creditCard",
    "cardNumber",
    "cvv",
    "ssn",
];

/// Files whose console output is the point.
const EXEMPT_SEGMENTS: [&str; 3] = ["/commands/", "/seeds/", "/migrations/"];

fn console_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"\bconsole\s*\.\s*(log|info|warn|error|debug|trace|dir|table)\s*\(")
            .expect("the console pattern is valid")
    })
}

fn logger_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(
            r"\b(?:console|logger|log|this\.logger)\s*\.\s*(?:log|info|warn|error|debug|trace)\s*\(",
        )
        .expect("the logger pattern is valid")
    })
}

/// One line that logs something it should not.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Leak {
    pub file: String,
    pub line: usize,
    pub field: String,
}

/// The sensitive fields a call's arguments name.
///
/// The arguments are read by balancing parentheses so a call spread over
/// several lines is still read whole — which is exactly the shape a log line
/// building an object takes.
pub fn leaks(content: &str, file: &str) -> Vec<Leak> {
    let mut found = Vec::new();

    for call in logger_pattern().find_iter(content) {
        let open = call.end() - 1;
        let Some(arguments) = arguments(content, open) else {
            continue;
        };
        let lowercase = arguments.to_ascii_lowercase();

        for field in SENSITIVE {
            if !lowercase.contains(&field.to_ascii_lowercase()) {
                continue;
            }
            found.push(Leak {
                file: file.to_string(),
                line: artifacts::line_of(content, call.start()),
                field: field.to_string(),
            });
            break;
        }
    }

    found
}

/// The text between a `(` and the `)` that closes it.
fn arguments(content: &str, open: usize) -> Option<&str> {
    let mut depth = 0;
    for (offset, character) in content[open..].char_indices() {
        match character {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&content[open + 1..open + offset]);
                }
            }
            _ => {}
        }
    }
    None
}

/// Every `console.*` call in a file.
pub fn consoles(content: &str, file: &str) -> Vec<String> {
    console_pattern()
        .captures_iter(content)
        .filter_map(|captured| {
            let whole = captured.get(0)?;
            let method = captured.get(1)?.as_str();
            Some(format!(
                "{file}:{}: `console.{method}` has no level and no destination",
                artifacts::line_of(content, whole.start())
            ))
        })
        .collect()
}

/// Whether a file is one the rule applies to.
pub fn is_checked(file: &str) -> bool {
    !EXEMPT_SEGMENTS.iter().any(|segment| file.contains(segment))
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<_> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(|module| is_backend(module) || is_frontend(module))
    .collect();

    if modules.is_empty() {
        return CheckOutcome::new(
            CheckId::Logging,
            CheckStatus::Skipped,
            "no module to inspect",
        );
    }

    let corpus = Corpus::build(root, &modules);
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut counted = 0;

    for (file, content) in &corpus.files {
        if !is_checked(file) {
            continue;
        }
        counted += 1;

        for leak in leaks(content, file) {
            errors.push(format!(
                "{}:{}: the log line carries `{}` — it will be written in plain text",
                leak.file, leak.line, leak.field
            ));
        }
        warnings.extend(consoles(content, file));
    }

    if counted == 0 {
        return CheckOutcome::new(
            CheckId::Logging,
            CheckStatus::Skipped,
            "no TypeScript source to inspect",
        );
    }

    let scope = format!("{counted} file{}", if counted == 1 { "" } else { "s" });

    static_outcome(
        CheckId::Logging,
        &scope,
        "nothing is logged that should not be",
        errors,
        warnings,
    )
    .with_hint("Inject the `ILogger` from `@talosjs/logger`, and redact the field before logging")
}
