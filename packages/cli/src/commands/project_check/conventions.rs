// Conventions check — the rules the framework enforces at runtime.
//
// A class whose name disagrees with its decorator throws a `ContainerException`
// on boot, and a service reading `process.env` directly bypasses the typed
// `AppEnv`. Both are cheap to spot statically and expensive to discover late.

use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::modules::{
    WorkspaceModule, collect_files, discover_modules, filter_modules, relative, wanted_names,
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

        if let Some(finding) = check_process_env_usage(line, number, allowed_env) {
            findings.push(finding);
        }
        if let Some(finding) = check_decorator_naming(&lines, index, line, number) {
            findings.push(finding);
        }
        findings.extend(check_type_naming(line, number));
        if let Some(finding) = check_non_null_assertion(line, number) {
            findings.push(finding);
        }
    }

    findings
}

/// A direct `process.env` read outside the files allowed to read it.
fn check_process_env_usage(
    line: &str,
    number: usize,
    allowed_env: bool,
) -> Option<ConventionFinding> {
    if allowed_env || !line.contains("process.env") {
        return None;
    }
    Some(ConventionFinding {
        line: number,
        rule: "conventions.process-env",
        message: "reads `process.env` directly — inject `AppEnv` instead".to_string(),
        blocking: true,
    })
}

/// A `@decorator.<kind>()` whose next declared class does not carry the
/// suffix that kind requires — the container throws on boot.
fn check_decorator_naming(
    lines: &[&str],
    index: usize,
    line: &str,
    number: usize,
) -> Option<ConventionFinding> {
    let captured = decorator_pattern().captures(line)?;
    let kind = captured.get(1).map(|group| group.as_str())?;
    let (_, suffix) = DECORATOR_SUFFIXES
        .iter()
        .find(|(decorator, _)| *decorator == kind)?;

    // The decorated class is the next one declared in the file.
    let declared = lines[index..]
        .iter()
        .take(6)
        .find_map(|candidate| class_pattern().captures(candidate))
        .and_then(|captured| captured.get(1))
        .map(|group| group.as_str().to_string())?;

    if declared.ends_with(suffix) {
        return None;
    }
    Some(ConventionFinding {
        line: number,
        rule: "conventions.di-name",
        message: format!(
            "`{declared}` is registered with `@decorator.{kind}()` but does not end with `{suffix}` — the container throws on boot"
        ),
        blocking: true,
    })
}

/// A `type`/`interface` declaration whose name breaks the `Type` suffix or
/// `I` prefix convention.
fn check_type_naming(line: &str, number: usize) -> Vec<ConventionFinding> {
    let mut findings = Vec::new();
    let Some(captured) = type_pattern().captures(line) else {
        return findings;
    };
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
    findings
}

/// A non-null assertion (`!`), which should be a default value or optional
/// type instead.
fn check_non_null_assertion(line: &str, number: usize) -> Option<ConventionFinding> {
    if !has_non_null_assertion(line) {
        return None;
    }
    Some(ConventionFinding {
        line: number,
        rule: "conventions.non-null",
        message: "non-null assertion — use a default value or an optional type".to_string(),
        blocking: false,
    })
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
        inspected += inspect_ts_files(module, root, &mut errors, &mut warnings);
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

/// Splits a batch of findings into blocking `errors` and non-blocking
/// `warnings`, each rendered as `path:line  message`.
fn record_findings(
    label: &str,
    findings: Vec<ConventionFinding>,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    for finding in findings {
        let line = format!("{label}:{}  {}", finding.line, finding.message);
        if finding.blocking {
            errors.push(line);
        } else {
            warnings.push(line);
        }
    }
}

/// Inspects a module's TypeScript/TSX sources, skipping generated files.
/// Returns the number of files inspected.
fn inspect_ts_files(
    module: &WorkspaceModule,
    root: &Path,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> usize {
    let mut inspected = 0;
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
        record_findings(&label, inspect(&label, &content), errors, warnings);
    }
    inspected
}
