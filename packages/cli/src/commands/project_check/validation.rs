// Validation check — the route's TypeScript type against the schema that
// guards it.
//
// A controller declares the same shape twice: once as a `RouteType` the
// handler reads, and once as the `Assert` schema the framework validates the
// request against. The compiler only sees the first. A field added to the type
// and not to the schema arrives unvalidated; a field asserted but never typed
// is rejected for a reason the handler cannot explain.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
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
    /// Sections declared on either side through a name that could not be
    /// resolved to an object, such as a schema imported from a package. Their
    /// keys are unknown, so they are not compared.
    pub unresolved: BTreeSet<String>,
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
                    skip_line_comment(&mut chars, &mut out);
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

/// Consumes a `//` line comment, keeping the newline that ends it so line
/// numbers downstream are unaffected.
fn skip_line_comment(chars: &mut std::iter::Peekable<std::str::Chars>, out: &mut String) {
    for skipped in chars.by_ref() {
        if skipped == '\n' {
            out.push('\n');
            break;
        }
    }
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
/// the fields a request carries, not their types. Brackets inside a string
/// literal (`Assert("1 <= number <= 5")`) and the `>` of an arrow (`() => void`)
/// are not brackets, and do not move the depth.
pub fn keys(body: &str) -> BTreeSet<String> {
    let mut keys = BTreeSet::new();
    let mut depth = 0;
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut escaped = false;
    let mut previous = '\0';

    for character in body.chars() {
        if let Some(open) = quote {
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == open {
                quote = None;
            }
            current.push(character);
            previous = character;
            continue;
        }
        let after = previous;
        previous = character;
        match character {
            '"' | '\'' | '`' => {
                quote = Some(character);
                current.push(character);
            }
            '>' if after == '=' => current.push(character),
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
        Regex::new(r"(?m)^\s*(?:export\s+)?type\s+\w*RouteType\s*=\s*\{")
            .expect("the route type is valid")
    })
}

fn decorator_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r#"@Route\.\w+\(\s*"[^"]*"\s*,\s*\{"#).expect("the route decorator is valid")
    })
}

fn identifier_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"^([A-Za-z_$][\w$]*)(?:\s+as\s+const)?$").expect("the identifier is valid")
    })
}

/// The expression a top-level `section:` of an object body holds, up to the
/// `,` or `;` that ends it. Keys nested in another field are not looked at, so
/// `response: { payload: … }` never stands in for the route's `payload`.
pub fn section_value<'a>(source: &'a str, section: &str) -> Option<&'a str> {
    let mut depth = 0i32;
    let mut start = 0;
    let mut value_start = None;

    for (index, character) in source.char_indices() {
        match character {
            '{' | '(' | '[' => depth += 1,
            '}' | ')' | ']' => depth -= 1,
            ':' if depth == 0 && value_start.is_none() => {
                let key = source[start..index].trim().trim_end_matches('?').trim();
                if key == section {
                    value_start = Some(index + 1);
                }
            }
            ',' | ';' if depth == 0 => {
                if let Some(from) = value_start {
                    return Some(source[from..index].trim());
                }
                start = index + 1;
            }
            '\n' if depth == 0 => match value_start {
                // A type written without separators ends a field at the line
                // break, once its value has started.
                Some(from) if !source[from..index].trim().is_empty() => {
                    return Some(source[from..index].trim());
                }
                Some(_) => {}
                None => start = index + 1,
            },
            _ => {}
        }
    }

    value_start.map(|from| source[from..].trim())
}

/// An object body, with the source it was read from so the names it spreads
/// resolve where they are declared.
struct Resolved {
    body: String,
    content: String,
    dir: Option<PathBuf>,
}

/// The object body a section's value describes: an inline `{ … }`, an
/// `Assert({ … })`, or a constant or type alias holding one — declared in the
/// file or imported from a relative path, up to `depth` hops away.
fn resolve_object(value: &str, content: &str, dir: Option<&Path>, depth: u8) -> Option<Resolved> {
    let value = value.trim();
    let inner = value
        .strip_prefix("Assert(")
        .and_then(|rest| rest.strip_suffix(')'))
        .map(str::trim)
        .unwrap_or(value);
    if inner.starts_with('{') {
        return Some(Resolved {
            body: body(inner, 0)?.to_string(),
            content: content.to_string(),
            dir: dir.map(Path::to_path_buf),
        });
    }

    let name = identifier_pattern().captures(inner)?.get(1)?.as_str();
    if let Some(found) = declared_object(content, name) {
        return Some(Resolved {
            body: found,
            content: content.to_string(),
            dir: dir.map(Path::to_path_buf),
        });
    }
    if depth == 0 {
        return None;
    }
    let source = imported_source(content, name, dir?)?;
    let next_dir = source.parent().map(Path::to_path_buf);
    let imported = fs::read_to_string(&source).ok()?;
    resolve_object(
        name,
        &strip_comments(&imported),
        next_dir.as_deref(),
        depth - 1,
    )
}

/// The entries of an object body that carry no `key:` — shorthand properties
/// (`{ id }`) and spreads (`{ ...PAGE_FIELDS }`), split on the commas and
/// semicolons at its top level.
pub fn unkeyed_entries(body: &str) -> (BTreeSet<String>, Vec<String>) {
    let mut shorthand = BTreeSet::new();
    let mut spreads = Vec::new();
    let mut depth = 0i32;
    let mut entry = String::new();

    for character in body.chars().chain([',']) {
        match character {
            '{' | '(' | '[' => depth += 1,
            '}' | ')' | ']' => depth -= 1,
            _ => {}
        }
        if depth == 0 && matches!(character, ',' | ';') {
            let text = entry.trim();
            if let Some(name) = text.strip_prefix("...") {
                spreads.push(name.trim().to_string());
            } else if !text.is_empty()
                && text
                    .chars()
                    .all(|character| character.is_alphanumeric() || "_$".contains(character))
            {
                shorthand.insert(text.to_string());
            }
            entry.clear();
        } else {
            entry.push(character);
        }
    }

    (shorthand, spreads)
}

/// Every key an object declares, its shorthand properties and the keys of the
/// objects it spreads included. `None` when a spread cannot be resolved, since
/// the object then carries keys nobody can list.
fn object_keys(resolved: &Resolved, depth: u8) -> Option<BTreeSet<String>> {
    let mut found = keys(&resolved.body);
    let (shorthand, spreads) = unkeyed_entries(&resolved.body);
    found.extend(shorthand);
    for spread in spreads {
        let inner = resolve_object(&spread, &resolved.content, resolved.dir.as_deref(), depth)?;
        found.extend(object_keys(&inner, depth.saturating_sub(1))?);
    }
    Some(found)
}

/// The object a `const NAME = …`, `type NAME = …` or `interface NAME` of this
/// file declares.
fn declared_object(content: &str, name: &str) -> Option<String> {
    let name = regex::escape(name);
    let declaration = Regex::new(&format!(
        r"(?m)^\s*(?:export\s+)?(?:const\s+{name}\s*(?::[^=]+)?=|type\s+{name}\s*=|interface\s+{name}\b[^{{]*)\s*"
    ))
    .ok()?;
    let found = declaration.find(content)?;
    let rest = &content[found.end()..];
    let expression = rest
        .strip_prefix("Assert(")
        .map(str::trim_start)
        .unwrap_or(rest);
    let open = content.len() - expression.len();
    if !expression.starts_with('{') {
        return None;
    }
    body(content, open).map(str::to_string)
}

/// The file a relative `import { NAME } from "./…"` points at.
fn imported_source(content: &str, name: &str, dir: &Path) -> Option<PathBuf> {
    let import =
        Regex::new(r#"import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'](\.[^"']*)["']"#).ok()?;
    let specifier = import.captures_iter(content).find_map(|captured| {
        let names = captured.get(1)?.as_str();
        names
            .split(',')
            .map(|part| part.trim().trim_start_matches("type ").trim())
            .any(|part| part == name)
            .then(|| captured.get(2).map(|group| group.as_str().to_string()))
            .flatten()
    })?;
    let base = dir.join(specifier);
    ["ts", "tsx"]
        .iter()
        .map(|extension| base.with_extension(extension))
        .chain(
            ["index.ts", "index.tsx"]
                .iter()
                .map(|index| base.join(index)),
        )
        .find(|candidate| candidate.is_file())
}

/// Read both declarations out of a controller file, resolving only what the
/// file itself declares.
pub fn parse(content: &str) -> Option<Contract> {
    parse_at(content, None)
}

/// Read both declarations out of a controller file in `dir`, also following a
/// schema or type that a relative import brings in.
pub fn parse_at(content: &str, dir: Option<&Path>) -> Option<Contract> {
    let content = strip_comments(content);

    let type_body = route_type_pattern()
        .find(&content)
        .and_then(|found| body(&content, found.end() - 1))?;
    let config_body = decorator_pattern()
        .find(&content)
        .and_then(|found| body(&content, found.end() - 1))?;

    let mut unresolved = BTreeSet::new();
    let mut sections = |source: &str| -> Vec<(String, BTreeSet<String>)> {
        INPUTS
            .iter()
            .filter_map(|section| {
                let value = section_value(source, section)?;
                match resolve_object(value, &content, dir, 2)
                    .and_then(|found| object_keys(&found, 2))
                {
                    Some(found) => Some(((*section).to_string(), found)),
                    None => {
                        unresolved.insert((*section).to_string());
                        None
                    }
                }
            })
            .collect()
    };
    let typed = sections(type_body);
    let asserted = sections(config_body);

    Some(Contract {
        typed,
        asserted,
        unresolved,
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
        if contract.unresolved.contains(section) {
            continue;
        }
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
            let Some(contract) = parse_at(&content, path.parent()) else {
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
