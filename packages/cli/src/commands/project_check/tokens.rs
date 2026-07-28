//! Tokens check — whether a component styles itself out of the design system.
//!
//! The design system exists so that a colour, a radius or a step of the type
//! scale is decided once and themed everywhere. A literal `#1d4ed8` in a
//! component is not wrong on the day it is written — it is wrong on the day the
//! brand changes, or the dark theme ships, and it is invisible to every other
//! check because it is a perfectly valid string.

use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::artifacts::{Corpus, is_frontend};
use super::modules::{WorkspaceModule, discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Where a raw colour is part of the job rather than a mistake: the stylesheets
/// that define the tokens, and the icons that carry their own artwork.
const EXEMPT_SEGMENTS: [&str; 4] = ["/styles/", "/icons/", "/fonts/", "/themes/"];

fn hex_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // Anchored on a non-word character so a fragment identifier or an id
        // selector is not read as a colour.
        Regex::new(r"(?i)#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b")
            .expect("the hex pattern is valid")
    })
}

fn function_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"\b(rgba?|hsla?|oklch|lab|color-mix)\s*\(")
            .expect("the colour function pattern is valid")
    })
}

fn arbitrary_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // A Tailwind arbitrary value: `bg-[#fff]`, `text-[13px]`, `w-[247px]`.
        // A CSS variable inside one is the escape hatch the design system
        // itself provides, so it is left alone.
        Regex::new(r"[a-z][a-z0-9-]*-\[(?:#|[0-9]+(?:\.[0-9]+)?(?:px|rem|em|pt))")
            .expect("the arbitrary value pattern is valid")
    })
}

fn inline_style_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r"style=\{\{").expect("the inline style pattern is valid"))
}

/// One place a file styles itself by hand.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Literal {
    pub file: String,
    pub line: usize,
    pub message: String,
    /// Whether it is a colour, which is the one a theme cannot override.
    pub is_colour: bool,
}

/// Every hand-written style value in a source file.
///
/// `primitives` says whether the module is allowed to reach below the design
/// system. The design module builds the primitives themselves, so a `ring-[3px]`
/// there is the decision rather than a way around it; a module consuming the
/// system has the token and chose not to use it.
pub fn inspect(content: &str, file: &str, primitives: bool) -> Vec<Literal> {
    let mut found = Vec::new();

    for (number, raw) in content.lines().enumerate() {
        let line = number + 1;
        let trimmed = raw.trim_start();
        if trimmed.starts_with("//") || trimmed.starts_with('*') || trimmed.starts_with("/*") {
            continue;
        }

        if let Some(captured) = hex_pattern().find(raw) {
            found.push(Literal {
                file: file.to_string(),
                line,
                message: format!(
                    "the colour `{}` is written by hand — no theme can override it",
                    captured.as_str()
                ),
                is_colour: true,
            });
        }
        if let Some(captured) = function_pattern().captures(raw) {
            let function = captured.get(1).map(|group| group.as_str()).unwrap_or("rgb");
            found.push(Literal {
                file: file.to_string(),
                line,
                message: format!("`{function}()` computes a colour outside the token set"),
                is_colour: true,
            });
        }
        if primitives {
            continue;
        }
        if let Some(captured) = arbitrary_pattern().find(raw) {
            found.push(Literal {
                file: file.to_string(),
                line,
                message: format!(
                    "`{}…]` is an arbitrary value — the scale does not reach it",
                    captured.as_str()
                ),
                is_colour: false,
            });
        }
        if inline_style_pattern().is_match(raw) {
            found.push(Literal {
                file: file.to_string(),
                line,
                message: "an inline `style` bypasses the design system entirely".to_string(),
                is_colour: false,
            });
        }
    }

    found
}

/// Whether a file is one the rule applies to.
pub fn is_checked(file: &str) -> bool {
    !EXEMPT_SEGMENTS.iter().any(|segment| file.contains(segment)) && !file.ends_with(".d.ts")
}

/// A consuming module must not define colour; the design system may.
pub fn defines_tokens(module: &WorkspaceModule) -> bool {
    matches!(module.kind.as_deref(), Some("design"))
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<_> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(is_frontend)
    .collect();

    if modules.is_empty() {
        return CheckOutcome::new(
            CheckId::Tokens,
            CheckStatus::Skipped,
            "no front-end module to inspect",
        );
    }

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut counted = 0;

    for module in &modules {
        let corpus = Corpus::build(root, std::slice::from_ref(module));
        for (file, content) in &corpus.files {
            if !is_checked(file) {
                continue;
            }
            counted += 1;
            for literal in inspect(content, file, defines_tokens(module)) {
                let line = format!("{}:{}: {}", literal.file, literal.line, literal.message);
                // A module that consumes the design system has no business
                // deciding a colour; the one that defines them does.
                if literal.is_colour && !defines_tokens(module) {
                    errors.push(line);
                } else {
                    warnings.push(line);
                }
            }
        }
    }

    if counted == 0 {
        return CheckOutcome::new(
            CheckId::Tokens,
            CheckStatus::Skipped,
            "no component to inspect",
        );
    }

    let scope = format!("{counted} file{}", if counted == 1 { "" } else { "s" });

    static_outcome(
        CheckId::Tokens,
        &scope,
        "every value comes from the design system",
        errors,
        warnings,
    )
    .with_hint("Add the value to the design module's tokens and reference it by name")
}
