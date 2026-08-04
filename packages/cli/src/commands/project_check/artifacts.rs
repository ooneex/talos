// The decorated classes the framework wires up, read once for the checks that
// reason about them.
//
// Every framework artifact — a middleware, an event, a queue, a cron job, a
// workflow, a permission, a mailer, a feature flag — is a class carrying a
// `@decorator.<kind>()`. The checks that follow all need the same three things:
// which classes carry which decorator, what a named method of one returns, and
// whether anything else in the workspace so much as mentions the class. Reading
// that once here keeps each rule down to the question it actually asks.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use regex::Regex;

use super::modules::{TS_EXTENSIONS, WorkspaceModule, collect_files, relative};

/// How deep a module's `src/` is walked, matching the import graph.
const MAX_SOURCE_DEPTH: usize = 10;

/// One decorated class.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Artifact {
    /// The decorator kind without its `@decorator.` prefix, e.g. `middleware`.
    pub kind: String,
    pub class: String,
    /// Path relative to the project root, which is how it is reported.
    pub file: String,
    pub path: PathBuf,
    /// The module that owns the class.
    pub module: String,
    /// `modules/user`, the way a module is shown in a report line.
    pub label: String,
    /// The whole file, kept so a rule can read a method body out of it.
    pub content: String,
}

fn class_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"(?m)^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)")
            .expect("the class pattern is valid")
    })
}

fn decorator_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"@decorator\.([a-zA-Z]+)\s*\(").expect("the decorator pattern is valid")
    })
}

/// The decorated classes a file declares, restricted to the kinds asked for.
///
/// A decorator always sits directly above the class it applies to, so the text
/// between the previous class and this one is what decorates it — the same
/// reading the registration check does.
pub fn declared(content: &str, kinds: &[&str]) -> Vec<(String, String)> {
    let mut found = Vec::new();
    let mut previous_end = 0;

    for captured in class_pattern().captures_iter(content) {
        let (Some(whole), Some(name)) = (captured.get(0), captured.get(1)) else {
            continue;
        };
        let decorators = &content[previous_end..whole.start()];
        previous_end = whole.end();

        for decorator in decorator_pattern().captures_iter(decorators) {
            let Some(kind) = decorator.get(1).map(|group| group.as_str()) else {
                continue;
            };
            if kinds.contains(&kind) {
                found.push((kind.to_string(), name.as_str().to_string()));
            }
        }
    }

    found
}

/// The artifacts a single source file declares, restricted to the given
/// kinds. Returns `None` when the file cannot be read or declares none.
fn artifacts_in_file(
    root: &Path,
    module: &WorkspaceModule,
    path: &Path,
    kinds: &[&str],
) -> Option<Vec<Artifact>> {
    let content = fs::read_to_string(path).ok()?;
    let declarations = declared(&content, kinds);
    if declarations.is_empty() {
        return None;
    }
    let file = relative(root, path);
    Some(
        declarations
            .into_iter()
            .map(|(kind, class)| Artifact {
                kind,
                class,
                file: file.clone(),
                path: path.to_path_buf(),
                module: module.name.clone(),
                label: module.label(),
                content: content.clone(),
            })
            .collect(),
    )
}

/// Every artifact of the given kinds declared by a set of modules.
pub fn collect(root: &Path, modules: &[WorkspaceModule], kinds: &[&str]) -> Vec<Artifact> {
    let mut artifacts = Vec::new();

    for module in modules {
        for path in collect_files(&module.dir.join("src"), TS_EXTENSIONS, MAX_SOURCE_DEPTH) {
            if let Some(found) = artifacts_in_file(root, module, &path, kinds) {
                artifacts.extend(found);
            }
        }
    }

    artifacts
}

/// The body of a class method, whichever form it is written in.
///
/// The conventions allow both `public async handler(…) { … }` and the arrow
/// form `public handler = async (…) => { … }`, and a rule that only understood
/// one of them would quietly pass on half the codebase.
pub fn method_body<'a>(content: &'a str, name: &str) -> Option<&'a str> {
    let pattern = Regex::new(&format!(
        r"(?m)^\s*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?{}\s*(?:=\s*(?:async\s*)?)?\(",
        regex::escape(name)
    ))
    .ok()?;
    let start = pattern.find(content)?.start();
    let open = content[start..].find('{').map(|offset| start + offset)?;
    balanced(content, open)
}

/// The text between a `{` and the `}` that closes it.
pub fn balanced(content: &str, open: usize) -> Option<&str> {
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

/// The string a method returns, when it returns a literal one. This is how
/// every framework artifact declares its identity — a channel, a queue name, a
/// workflow name, a flag key — so it is worth reading precisely.
pub fn returned_string(content: &str, method: &str) -> Option<String> {
    // An arrow body can be `(): string => "value"` with no braces at all, so
    // there may be nothing for `method_body` to balance.
    let Some(body) = method_body(content, method) else {
        return arrow_string(content, method);
    };
    let pattern = Regex::new(r#"return\s+["'`]([^"'`]*)["'`]"#).ok()?;
    match pattern.captures(body) {
        Some(captured) => Some(captured.get(1)?.as_str().to_string()),
        None => arrow_string(content, method),
    }
}

/// `public getName = (): string => "value"` — a body with nothing to balance.
fn arrow_string(content: &str, method: &str) -> Option<String> {
    let pattern = Regex::new(&format!(
        r#"{}\s*=\s*\([^)]*\)\s*(?::[^=]+)?=>\s*["'`]([^"'`]*)["'`]"#,
        regex::escape(method)
    ))
    .ok()?;
    Some(pattern.captures(content)?.get(1)?.as_str().to_string())
}

/// Whether a method body does anything beyond comments and whitespace.
///
/// A generated artifact ships with its hook commented out, and a commented-out
/// body is exactly what "you scaffolded this and never came back" looks like.
pub fn is_empty_body(body: &str) -> bool {
    body.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| !line.starts_with("//") && !line.starts_with('*') && !line.starts_with("/*"))
        .all(|line| line == "}" || line == "{")
}

/// Whether `word` occurs in `haystack` as an identifier rather than as part of
/// a longer one, so `UserQueue` is not matched by `UserQueueFactory`.
pub fn contains_word(haystack: &str, word: &str) -> bool {
    if word.is_empty() {
        return false;
    }
    let bytes = haystack.as_bytes();
    let mut from = 0;
    while let Some(offset) = haystack[from..].find(word) {
        let start = from + offset;
        let end = start + word.len();
        let before_ok = start == 0 || !is_identifier_byte(bytes[start - 1]);
        let after_ok = end == bytes.len() || !is_identifier_byte(bytes[end]);
        if before_ok && after_ok {
            return true;
        }
        from = start + 1;
    }
    false
}

fn is_identifier_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'$'
}

/// Every TypeScript source of the selected modules, read once so a rule can ask
/// "does anything else in the workspace mention this name?" without walking the
/// tree again for each class it holds.
#[derive(Clone, Debug, Default)]
pub struct Corpus {
    pub files: BTreeMap<String, String>,
}

impl Corpus {
    pub fn build(root: &Path, modules: &[WorkspaceModule]) -> Self {
        let mut files = BTreeMap::new();

        for module in modules {
            for path in collect_files(&module.dir.join("src"), TS_EXTENSIONS, MAX_SOURCE_DEPTH) {
                let Ok(content) = fs::read_to_string(&path) else {
                    continue;
                };
                files.insert(relative(root, &path), content);
            }
        }

        Self { files }
    }

    /// Whether any file outside `ignored` mentions the name.
    ///
    /// The file declaring the class is always ignored, and so is the module
    /// registry: listing a class in `<Name>Module.ts` is what loads it, not what
    /// uses it, and a rule asking "does anything reach for this?" has to tell
    /// the two apart.
    pub fn mentioned_outside(&self, name: &str, ignored: &[&str]) -> bool {
        self.files
            .iter()
            .filter(|(file, _)| !ignored.contains(&file.as_str()))
            .any(|(_, content)| contains_word(content, name))
    }

    /// The files whose content matches a predicate, with their labels.
    pub fn matching<'a>(
        &'a self,
        predicate: impl Fn(&str, &str) -> bool + 'a,
    ) -> impl Iterator<Item = (&'a String, &'a String)> {
        self.files
            .iter()
            .filter(move |(file, content)| predicate(file, content))
    }
}

/// The module registry file of a module, e.g. `modules/user/src/UserModule.ts`,
/// as it is reported.
pub fn registry_label(root: &Path, module: &WorkspaceModule) -> String {
    relative(root, &super::registration::registry_path(module))
}

/// Backend modules only: a front-end one carries no container and none of the
/// artifacts these checks look for.
pub fn is_backend(module: &WorkspaceModule) -> bool {
    module.group == "modules"
        && !matches!(
            module.kind.as_deref(),
            Some("spa" | "admin" | "design" | "storybook" | "sdk" | "swagger")
        )
}

/// Front-end modules: the ones that ship a browser bundle.
pub fn is_frontend(module: &WorkspaceModule) -> bool {
    matches!(
        module.kind.as_deref(),
        Some("spa" | "admin" | "design" | "storybook")
    )
}

/// The line a byte offset falls on, counting from one.
pub fn line_of(content: &str, offset: usize) -> usize {
    content[..offset.min(content.len())].lines().count().max(1)
}
