//! Conventions check — the rules the framework enforces at runtime.
//!
//! A class whose name disagrees with its decorator throws a `ContainerException`
//! on boot, and a service reading `process.env` directly bypasses the typed
//! `AppEnv`. Both are cheap to spot statically and expensive to discover late.
//! Rust and Python sources are held to the equivalent rules of their own
//! language: what panics a binary, and what silently changes behaviour.

use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::modules::{
    PYTHON_EXTENSIONS, RUST_EXTENSIONS, collect_files, discover_modules, filter_modules,
    python_source_dirs, relative, wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Decorators that bind a class into the container, and the suffix each one
/// requires. Breaking these throws when the container is built.
const DECORATOR_SUFFIXES: [(&str, &str); 4] = [
    ("service", "Service"),
    ("repository", "Repository"),
    ("middleware", "Middleware"),
    ("cron", "Cron"),
];

/// Files allowed to read `process.env` — the ones that build the typed config.
const ENV_ALLOWLIST: [&str; 4] = ["appenv", "env.ts", ".config.", "bunfig"];

/// A convention a file breaks, with the line that breaks it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConventionFinding {
    pub line: usize,
    pub rule: &'static str,
    pub message: String,
    /// Rules the runtime itself enforces fail; naming rules only warn.
    pub blocking: bool,
}

fn class_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"\bclass\s+([A-Za-z0-9_]+)").expect("the class pattern is valid")
    })
}

/// Only exported declarations are held to the naming convention: a local alias
/// inside one file is not part of anyone's contract.
fn type_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"^\s*export\s+(type|interface)\s+([A-Za-z0-9_]+)")
            .expect("the type pattern is valid")
    })
}

fn decorator_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"@decorator\.([a-zA-Z]+)\s*\(").expect("the decorator pattern is valid")
    })
}

/// Whether a file is one of the few allowed to touch `process.env`.
pub fn may_read_process_env(path: &str) -> bool {
    let lowered = path.to_ascii_lowercase();
    ENV_ALLOWLIST
        .iter()
        .any(|allowed| lowered.contains(allowed))
        || lowered.contains("/tests/")
        || lowered.contains(".spec.")
}

/// Whether a file announces itself as generated in its opening banner.
pub fn is_generated(content: &str) -> bool {
    content.lines().take(10).any(|line| {
        let lowered = line.to_ascii_lowercase();
        lowered.contains("@generated")
            || lowered.contains("auto-generated")
            || lowered.contains("do not edit")
            || lowered.contains("automatically generated")
    })
}

/// Inspect one TypeScript file against the project conventions.
pub fn inspect(path: &str, content: &str) -> Vec<ConventionFinding> {
    let mut findings = Vec::new();
    let lines: Vec<&str> = content.lines().collect();
    let allowed_env = may_read_process_env(path);

    for (index, line) in lines.iter().enumerate() {
        let number = index + 1;
        let trimmed = line.trim_start();
        if trimmed.starts_with("//") || trimmed.starts_with('*') {
            continue;
        }

        if !allowed_env && line.contains("process.env") {
            findings.push(ConventionFinding {
                line: number,
                rule: "conventions.process-env",
                message: "reads `process.env` directly — inject `AppEnv` instead".to_string(),
                blocking: true,
            });
        }

        if let Some(captured) = decorator_pattern().captures(line)
            && let Some(kind) = captured.get(1).map(|group| group.as_str())
            && let Some((_, suffix)) = DECORATOR_SUFFIXES
                .iter()
                .find(|(decorator, _)| *decorator == kind)
        {
            // The decorated class is the next one declared in the file.
            let declared = lines[index..]
                .iter()
                .take(6)
                .find_map(|candidate| class_pattern().captures(candidate))
                .and_then(|captured| captured.get(1))
                .map(|group| group.as_str().to_string());

            if let Some(name) = declared
                && !name.ends_with(suffix)
            {
                findings.push(ConventionFinding {
                    line: number,
                    rule: "conventions.di-name",
                    message: format!(
                        "`{name}` is registered with `@decorator.{kind}()` but does not end with `{suffix}` — the container throws on boot"
                    ),
                    blocking: true,
                });
            }
        }

        if let Some(captured) = type_pattern().captures(line) {
            let keyword = captured.get(1).map_or("", |group| group.as_str());
            let name = captured.get(2).map_or("", |group| group.as_str());
            if keyword == "type" && !name.ends_with("Type") {
                findings.push(ConventionFinding {
                    line: number,
                    rule: "conventions.type-name",
                    message: format!("type `{name}` does not end with `Type`"),
                    blocking: false,
                });
            }
            if keyword == "interface" && !starts_with_interface_prefix(name) {
                findings.push(ConventionFinding {
                    line: number,
                    rule: "conventions.interface-name",
                    message: format!("interface `{name}` does not start with `I`"),
                    blocking: false,
                });
            }
        }

        if has_non_null_assertion(line) {
            findings.push(ConventionFinding {
                line: number,
                rule: "conventions.non-null",
                message: "non-null assertion — use a default value or an optional type".to_string(),
                blocking: false,
            });
        }
    }

    findings
}

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

/// `IUser` counts, `Item` does not: the character after the `I` must be upper.
fn starts_with_interface_prefix(name: &str) -> bool {
    let mut characters = name.chars();
    characters.next() == Some('I')
        && characters
            .next()
            .map(|character| character.is_ascii_uppercase())
            .unwrap_or(false)
}

/// A `foo!.bar` or `foo!;` assertion, without matching `!==` or `!x`.
fn has_non_null_assertion(line: &str) -> bool {
    let bytes = line.as_bytes();
    bytes.iter().enumerate().skip(1).any(|(index, byte)| {
        if *byte != b'!' {
            return false;
        }
        let previous = bytes[index - 1];
        let next = bytes.get(index + 1).copied().unwrap_or(b' ');
        (previous.is_ascii_alphanumeric() || previous == b')' || previous == b']')
            && matches!(next, b'.' | b';' | b',' | b')' | b']')
    })
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut inspected = 0;

    for module in &modules {
        for path in collect_files(&module.dir.join("src"), &["ts", "tsx"], 8) {
            let name = path.to_string_lossy();
            // Generated sources are rewritten by their generator, so a finding
            // in one is not actionable.
            if name.ends_with(".d.ts") || name.contains(".gen.") || name.contains(".generated.") {
                continue;
            }
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            if is_generated(&content) {
                continue;
            }
            inspected += 1;
            let label = relative(root, &path);
            for finding in inspect(&label, &content) {
                let line = format!("{label}:{}  {}", finding.line, finding.message);
                if finding.blocking {
                    errors.push(line);
                } else {
                    warnings.push(line);
                }
            }
        }

        if module.is_rust() {
            for path in collect_files(&module.dir.join("src"), RUST_EXTENSIONS, 8) {
                let Ok(content) = fs::read_to_string(&path) else {
                    continue;
                };
                if is_generated(&content) {
                    continue;
                }
                inspected += 1;
                let label = relative(root, &path);
                for finding in inspect_rust(&content) {
                    let line = format!("{label}:{}  {}", finding.line, finding.message);
                    if finding.blocking {
                        errors.push(line);
                    } else {
                        warnings.push(line);
                    }
                }
            }
        }

        if module.is_python() {
            for root_dir in python_source_dirs(module) {
                for path in collect_files(&root_dir, PYTHON_EXTENSIONS, 8) {
                    let Ok(content) = fs::read_to_string(&path) else {
                        continue;
                    };
                    if is_generated(&content) {
                        continue;
                    }
                    inspected += 1;
                    let label = relative(root, &path);
                    for finding in inspect_python(&content) {
                        let line = format!("{label}:{}  {}", finding.line, finding.message);
                        if finding.blocking {
                            errors.push(line);
                        } else {
                            warnings.push(line);
                        }
                    }
                }
            }
        }
    }

    if inspected == 0 {
        return CheckOutcome::new(
            CheckId::Conventions,
            CheckStatus::Skipped,
            "no source to inspect",
        );
    }

    let scope = format!("{inspected} file{}", if inspected == 1 { "" } else { "s" });

    static_outcome(
        CheckId::Conventions,
        &scope,
        "naming and injection conventions hold",
        errors,
        warnings,
    )
    .with_hint("The `optimize` skill applies these conventions across a whole module")
}
