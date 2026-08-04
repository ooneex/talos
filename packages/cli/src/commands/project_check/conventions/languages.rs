// Rust and Python convention rules — split out of the parent module to keep
// it under the file-size budget.

use super::ConventionFinding;

/// Inspect one Rust file against the conventions the crate holds itself to.
///
/// Rust has no container to throw on boot, so the equivalent rules are the ones
/// that decide whether the binary dies in a user's terminal: an unhandled
/// `unwrap`, an `unsafe` block, a lint silenced instead of fixed. Everything
/// below a `#[cfg(test)]` marker is test code and exempt — a test *should*
/// unwrap.
pub fn inspect_rust(content: &str) -> Vec<ConventionFinding> {
    let mut findings = Vec::new();

    for (index, line) in content.lines().enumerate() {
        let number = index + 1;
        let trimmed = line.trim_start();
        if trimmed.starts_with("//") || trimmed.starts_with('*') {
            continue;
        }
        // The test module conventionally closes the file.
        if trimmed.starts_with("#[cfg(test)]") {
            break;
        }
        // A rule must not match its own message: string contents are data, not
        // code.
        let code = strip_string_literals(line);
        let trimmed = code.trim_start();

        if let Some(macro_name) = panicking_macro(trimmed) {
            findings.push(ConventionFinding {
                line: number,
                rule: "conventions.rust-panic",
                message: format!(
                    "`{macro_name}` aborts the process — return an error the command can report"
                ),
                blocking: false,
            });
        }

        if has_bare_unwrap(trimmed) {
            findings.push(ConventionFinding {
                line: number,
                rule: "conventions.rust-panic",
                message: "`.unwrap()` panics on failure — use `?`, a default, or `.expect()` with a reason".to_string(),
                blocking: false,
            });
        }

        if is_unsafe_block(trimmed) {
            findings.push(ConventionFinding {
                line: number,
                rule: "conventions.rust-unsafe",
                message: "`unsafe` code — the CLI has no need for it".to_string(),
                blocking: true,
            });
        }

        if let Some(lint) = silenced_lint(trimmed) {
            findings.push(ConventionFinding {
                line: number,
                rule: "conventions.rust-suppressed-lint",
                message: format!("`#[allow({lint})]` hides a warning instead of fixing it"),
                blocking: false,
            });
        }
    }

    findings
}

/// Inspect one Python file against the conventions the language enforces
/// through convention rather than through a compiler.
///
/// The rules are the ones that silently change behaviour: an exception handler
/// that swallows everything, a mutable default argument shared between calls,
/// a wildcard import that makes a name's origin unknowable, and PEP 8 naming,
/// which is the closest Python equivalent of the DI naming rules.
pub fn inspect_python(content: &str) -> Vec<ConventionFinding> {
    let mut findings = Vec::new();

    for (index, line) in content.lines().enumerate() {
        let number = index + 1;
        let trimmed = line.trim_start();
        if trimmed.starts_with('#') {
            continue;
        }
        let code = strip_string_literals(line);
        let trimmed = code.trim_start();

        if trimmed.starts_with("except:") || trimmed.starts_with("except :") {
            findings.push(ConventionFinding {
                line: number,
                rule: "conventions.python-bare-except",
                message: "bare `except:` swallows every error, including Ctrl-C — catch the exception you expect".to_string(),
                blocking: false,
            });
        }

        if trimmed.starts_with("from ") && trimmed.contains(" import *") {
            findings.push(ConventionFinding {
                line: number,
                rule: "conventions.python-wildcard-import",
                message: "wildcard import — name the symbols the module uses".to_string(),
                blocking: false,
            });
        }

        if has_mutable_default(trimmed) {
            findings.push(ConventionFinding {
                line: number,
                rule: "conventions.python-mutable-default",
                message: "mutable default argument — it is created once and shared by every call"
                    .to_string(),
                blocking: false,
            });
        }

        if let Some(name) = declared_python_name(trimmed, "class ")
            && !is_cap_words(&name)
        {
            findings.push(ConventionFinding {
                line: number,
                rule: "conventions.python-class-name",
                message: format!("class `{name}` is not CapWords"),
                blocking: false,
            });
        }

        if let Some(name) = declared_python_name(trimmed, "def ")
            .or_else(|| declared_python_name(trimmed, "async def "))
            && !is_snake_case(&name)
        {
            findings.push(ConventionFinding {
                line: number,
                rule: "conventions.python-function-name",
                message: format!("function `{name}` is not snake_case"),
                blocking: false,
            });
        }
    }

    findings
}

/// The name declared by a `class`/`def` line, if the line declares one.
fn declared_python_name(trimmed: &str, keyword: &str) -> Option<String> {
    let rest = trimmed.strip_prefix(keyword)?;
    let name: String = rest
        .chars()
        .take_while(|character| character.is_alphanumeric() || *character == '_')
        .collect();
    if name.is_empty() { None } else { Some(name) }
}

/// `def handler(items=[])` and `def handler(options={})`: a literal container
/// used as a default value.
fn has_mutable_default(trimmed: &str) -> bool {
    if !trimmed.starts_with("def ") && !trimmed.starts_with("async def ") {
        return false;
    }
    ["=[]", "={}", "=set()", "=[ ]", "={ }", "= []", "= {}"]
        .iter()
        .any(|default| trimmed.contains(default))
}

/// `UserService` is CapWords; `user_service` and `userService` are not. A
/// trailing acronym such as `HTTPClient` is accepted.
fn is_cap_words(name: &str) -> bool {
    let mut characters = name.chars();
    characters
        .next()
        .map(|first| first.is_uppercase())
        .unwrap_or(false)
        && !name.contains('_')
}

/// `read_file` is snake_case; `readFile` is not. Dunder names are accepted as
/// they are defined by the language.
fn is_snake_case(name: &str) -> bool {
    name.starts_with("__")
        || name
            .chars()
            .all(|character| !character.is_alphabetic() || character.is_lowercase())
}

/// Blank out the contents of string literals so a rule never matches the text
/// of a message describing it.
pub fn strip_string_literals(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut inside = false;
    let mut escaped = false;
    for character in line.chars() {
        if inside {
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                inside = false;
                out.push('"');
                continue;
            }
            out.push(' ');
            continue;
        }
        if character == '"' {
            inside = true;
        }
        out.push(character);
    }
    out
}

/// The panicking macro a line invokes, if any.
fn panicking_macro(trimmed: &str) -> Option<&'static str> {
    ["panic!", "todo!", "unimplemented!", "unreachable!"]
        .into_iter()
        .find(|name| trimmed.contains(&format!("{name}(")))
}

/// An `.unwrap()` that is not the idiomatic mutex-poisoning one: a poisoned
/// lock means another thread already panicked, and there is nothing to recover.
fn has_bare_unwrap(line: &str) -> bool {
    line.contains(".unwrap()") && !line.contains(".lock().unwrap()")
}

/// An `unsafe` block or function, ignoring the word inside an identifier.
fn is_unsafe_block(trimmed: &str) -> bool {
    trimmed.starts_with("unsafe {")
        || trimmed.starts_with("unsafe fn ")
        || trimmed.contains(" unsafe {")
        || trimmed.contains(" unsafe fn ")
}

/// A silenced compiler lint. Clippy pragmas such as
/// `#[allow(clippy::too_many_arguments)]` are deliberate design trade-offs and
/// are left alone; `dead_code` and `unused_*` hide real rot.
fn silenced_lint(trimmed: &str) -> Option<&'static str> {
    if !trimmed.starts_with("#[allow(") && !trimmed.starts_with("#![allow(") {
        return None;
    }
    [
        "dead_code",
        "unused_variables",
        "unused_imports",
        "unused_mut",
    ]
    .into_iter()
    .find(|lint| trimmed.contains(lint))
}
