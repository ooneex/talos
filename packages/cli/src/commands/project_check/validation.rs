//! Validation check — the route's TypeScript type against the schema that
//! guards it.
//!
//! A controller declares the same shape twice: once as a `RouteType` the
//! handler reads, and once as the `Assert` schema the framework validates the
//! request against. The compiler only sees the first. A field added to the type
//! and not to the schema arrives unvalidated; a field asserted but never typed
//! is rejected for a reason the handler cannot explain.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::modules::{collect_files, discover_modules, filter_modules, relative, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// The sections carrying request input, which is what has to be validated. The
/// response is deliberately left out: it is shaped by the handler, not by the
/// caller, so a mismatch there is a typing question rather than a safety one.
const INPUTS: [&str; 3] = ["params", "payload", "queries"];

/// One route's two declarations of the same shape.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Contract {
    /// Section name → the keys the `RouteType` declares.
    pub typed: Vec<(String, BTreeSet<String>)>,
    /// Section name → the keys the decorator asserts.
    pub asserted: Vec<(String, BTreeSet<String>)>,
}

impl Contract {
    fn section<'a>(
        sections: &'a [(String, BTreeSet<String>)],
        name: &str,
    ) -> Option<&'a BTreeSet<String>> {
        sections
            .iter()
            .find(|(section, _)| section == name)
            .map(|(_, keys)| keys)
    }
}

/// Remove comments so a commented-out field is never read as a declared one —
/// the generated controller ships with exactly that.
pub fn strip_comments(content: &str) -> String {
    let mut out = String::with_capacity(content.len());
    let mut chars = content.chars().peekable();
    let mut in_block = false;

    while let Some(character) = chars.next() {
        if in_block {
            if character == '*' && chars.peek() == Some(&'/') {
                chars.next();
                in_block = false;
            }
            continue;
        }
        if character == '/' {
            match chars.peek() {
                Some('/') => {
                    for skipped in chars.by_ref() {
                        if skipped == '\n' {
                            out.push('\n');
                            break;
                        }
                    }
                    continue;
                }
                Some('*') => {
                    chars.next();
                    in_block = true;
                    continue;
                }
                _ => {}
            }
        }
        out.push(character);
    }

    out
}

/// The body of the object opening at `open`, balanced across nested braces.
pub fn body(content: &str, open: usize) -> Option<&str> {
    let mut depth = 0;
    for (offset, character) in content[open..].char_indices() {
        match character {
            '{' => depth += 1,
            '}' => {
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

/// The keys declared at the top level of an object body. Nested objects, unions
/// and generics are skipped over rather than descended into: the check compares
/// the fields a request carries, not their types.
pub fn keys(body: &str) -> BTreeSet<String> {
    let mut keys = BTreeSet::new();
    let mut depth = 0;
    let mut current = String::new();

    for character in body.chars() {
        match character {
            '{' | '(' | '[' | '<' => depth += 1,
            '}' | ')' | ']' | '>' => depth -= 1,
            ':' if depth == 0 => {
                let key = current
                    .trim()
                    .trim_end_matches('?')
                    .trim_matches(['"', '\'', ','])
                    .trim()
                    .to_string();
                if !key.is_empty()
                    && key
                        .chars()
                        .all(|character| character.is_alphanumeric() || "_$".contains(character))
                {
                    keys.insert(key);
                }
                current.clear();
            }
            ',' | ';' | '\n' if depth == 0 => current.clear(),
            _ => current.push(character),
        }
    }

    keys
}

fn route_type_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"export\s+type\s+\w*RouteType\s*=\s*\{").expect("the route type is valid")
    })
}

fn decorator_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r#"@Route\.\w+\(\s*"[^"]*"\s*,\s*\{"#).expect("the route decorator is valid")
    })
}

/// Read both declarations out of a controller file.
pub fn parse(content: &str) -> Option<Contract> {
    let content = strip_comments(content);

    let type_body = route_type_pattern()
        .find(&content)
        .and_then(|found| body(&content, found.end() - 1))?;
    let config_body = decorator_pattern()
        .find(&content)
        .and_then(|found| body(&content, found.end() - 1))?;

    let sections = |source: &str| -> Vec<(String, BTreeSet<String>)> {
        INPUTS
            .iter()
            .filter_map(|section| {
                // `payload: Assert({ … })` and `params: { … }` both open their
                // object right after the section name.
                let at = source.find(&format!("{section}:"))?;
                let open = source[at..].find('{').map(|offset| at + offset)?;
                Some(((*section).to_string(), keys(body(source, open)?)))
            })
            .collect()
    };

    Some(Contract {
        typed: sections(type_body),
        asserted: sections(config_body),
    })
}

/// Compare the two declarations of one route.
pub fn inspect(
    label: &str,
    contract: &Contract,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    for section in INPUTS {
        let typed = Contract::section(&contract.typed, section);
        let asserted = Contract::section(&contract.asserted, section);

        let (Some(typed), Some(asserted)) = (typed, asserted) else {
            // A section the decorator omits entirely validates nothing, which
            // only matters once the type says something arrives there.
            if typed.is_some_and(|keys| !keys.is_empty()) {
                errors.push(format!(
                    "{label}: `{section}` is typed but the route asserts no schema for it"
                ));
            }
            continue;
        };

        for key in typed.difference(asserted) {
            errors.push(format!(
                "{label}: `{section}.{key}` is typed but never validated"
            ));
        }
        for key in asserted.difference(typed) {
            warnings.push(format!(
                "{label}: `{section}.{key}` is validated but missing from the route type"
            ));
        }
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut counted = 0;

    for module in &modules {
        for path in collect_files(&module.dir.join("src").join("controllers"), &["ts"], 4) {
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            let Some(contract) = parse(&content) else {
                continue;
            };
            counted += 1;
            inspect(
                &relative(root, &path),
                &contract,
                &mut errors,
                &mut warnings,
            );
        }
    }

    if counted == 0 {
        return CheckOutcome::new(
            CheckId::Validation,
            CheckStatus::Skipped,
            "no route contract to compare",
        );
    }

    let scope = format!("{counted} contract{}", if counted == 1 { "" } else { "s" });

    static_outcome(
        CheckId::Validation,
        &scope,
        "every typed field is validated",
        errors,
        warnings,
    )
    .with_hint("The `RouteType` and the decorator's `Assert` schema describe the same request")
}
