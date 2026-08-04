// Exceptions check — whether a failure carries enough to be handled.
//
// The framework maps a thrown `Exception` onto a status code and a response
// body using the code it carries. A bare `new Error("not found")` carries
// nothing: it comes back as a 500 with a stack trace, whatever it actually
// meant. A swallowed one is worse — the request succeeds and the failure is
// never seen at all.

use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::artifacts::{self, Corpus, is_backend};
use super::modules::{discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Exception classes the framework already maps, which a module throws as they
/// are rather than subclassing.
const FRAMEWORK_EXCEPTIONS: [&str; 5] = [
    "Exception",
    "BadRequestException",
    "NotFoundException",
    "UnauthorizedException",
    "MethodNotAllowedException",
];

fn bare_error_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // `TypeError` and friends are the runtime's own, and a test asserting on
        // one is not the code under check.
        Regex::new(r"throw\s+new\s+(Error|TypeError|RangeError)\s*\(")
            .expect("the bare error pattern is valid")
    })
}

fn thrown_literal_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r#"throw\s+(["'`{])"#).expect("the thrown literal pattern is valid")
    })
}

fn exception_class_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"(?m)^\s*(?:export\s+)?class\s+([A-Za-z0-9_$]*Exception)\b([^{]*)\{")
            .expect("the exception class pattern is valid")
    })
}

fn catch_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"catch\s*(?:\([^)]*\))?\s*\{").expect("the catch pattern is valid")
    })
}

/// Everything in one file that throws or swallows without saying what happened.
pub fn inspect(content: &str, file: &str, errors: &mut Vec<String>, warnings: &mut Vec<String>) {
    for (number, line) in content.lines().enumerate() {
        let line_number = number + 1;
        let trimmed = line.trim_start();
        if trimmed.starts_with("//") || trimmed.starts_with('*') {
            continue;
        }

        if let Some(captured) = bare_error_pattern().captures(line) {
            let kind = captured
                .get(1)
                .map(|group| group.as_str())
                .unwrap_or("Error");
            errors.push(format!(
                "{file}:{line_number}: `throw new {kind}` carries no code — the client sees a 500"
            ));
        }
        if thrown_literal_pattern().is_match(line) {
            errors.push(format!(
                "{file}:{line_number}: a thrown literal has no stack and no code"
            ));
        }
    }

    for captured in exception_class_pattern().captures_iter(content) {
        let (Some(class), Some(heritage)) = (captured.get(1), captured.get(2)) else {
            continue;
        };
        if heritage.as_str().contains("extends") {
            continue;
        }
        let line = artifacts::line_of(content, class.start());
        warnings.push(format!(
            "{file}:{line}: `{}` does not extend Exception — the handler will not map it",
            class.as_str()
        ));
    }

    for captured in catch_pattern().find_iter(content) {
        let Some(body) = artifacts::balanced(content, captured.end() - 1) else {
            continue;
        };
        if !artifacts::is_empty_body(body) {
            continue;
        }
        let line = artifacts::line_of(content, captured.start());
        warnings.push(format!(
            "{file}:{line}: the catch block is empty — the failure disappears here"
        ));
    }
}

/// Whether a file is one the rule applies to. A migration runs outside the
/// request cycle and has no response to shape, and a seed is throwaway data.
fn is_checked(file: &str) -> bool {
    !file.contains("/migrations/") && !file.contains("/seeds/")
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<_> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(is_backend)
    .collect();

    if modules.is_empty() {
        return CheckOutcome::new(
            CheckId::Exceptions,
            CheckStatus::Skipped,
            "no backend module to inspect",
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
        inspect(content, file, &mut errors, &mut warnings);
    }

    if counted == 0 {
        return CheckOutcome::new(
            CheckId::Exceptions,
            CheckStatus::Skipped,
            "no TypeScript source to inspect",
        );
    }

    let scope = format!("{counted} file{}", if counted == 1 { "" } else { "s" });

    static_outcome(
        CheckId::Exceptions,
        &scope,
        "every failure carries a code",
        errors,
        warnings,
    )
    .with_hint(format!(
        "Throw one of {} from `@talosjs/exception`, or a subclass carrying its own code",
        FRAMEWORK_EXCEPTIONS.join(", ")
    ))
}
