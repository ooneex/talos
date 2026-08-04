//! JS/TS dependency checking — comparing declared npm packages in
//! `package.json` against the specifiers a workspace member's source
//! actually imports.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use regex::Regex;
use serde_json::Value;

pub(super) const CODE_EXTENSIONS: &[&str] = &["ts", "tsx", "js", "jsx", "mjs", "cjs", "json"];

/// Ranges that make a build unreproducible.
const LOOSE_RANGES: [&str; 4] = ["*", "x", "latest", ""];

/// Runtimes whose modules are always available.
const BUILTIN_PREFIXES: [&str; 3] = ["node:", "bun:", "cloudflare:"];

/// Node built-ins that are still imported without the `node:` prefix.
const BUILTINS: [&str; 24] = [
    "assert",
    "buffer",
    "child_process",
    "crypto",
    "dns",
    "events",
    "fs",
    "http",
    "http2",
    "https",
    "net",
    "os",
    "path",
    "perf_hooks",
    "process",
    "querystring",
    "readline",
    "stream",
    "string_decoder",
    "timers",
    "tls",
    "url",
    "util",
    "zlib",
];

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Manifest {
    pub label: String,
    pub name: Option<String>,
    /// Merged `dependencies` and `devDependencies`, name → range.
    pub dependencies: BTreeMap<String, String>,
}

/// Read the dependency map out of a raw `package.json` value.
pub fn read_manifest(label: &str, manifest: &Value) -> Manifest {
    let mut dependencies = BTreeMap::new();
    for field in ["dependencies", "devDependencies"] {
        let Some(entries) = manifest.get(field).and_then(Value::as_object) else {
            continue;
        };
        for (name, range) in entries {
            let Some(range) = range.as_str() else {
                continue;
            };
            dependencies.insert(name.clone(), range.to_string());
        }
    }

    Manifest {
        label: label.to_string(),
        name: manifest
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string),
        dependencies,
    }
}

/// The same dependency pinned to different ranges in different manifests.
pub fn version_mismatches(manifests: &[Manifest]) -> Vec<String> {
    let mut ranges: BTreeMap<&str, Vec<(&str, &str)>> = BTreeMap::new();
    for manifest in manifests {
        for (name, range) in &manifest.dependencies {
            ranges
                .entry(name.as_str())
                .or_default()
                .push((range.as_str(), manifest.label.as_str()));
        }
    }

    ranges
        .into_iter()
        .filter_map(|(name, pinned)| {
            let mut by_range: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
            for (range, label) in pinned {
                by_range.entry(range).or_default().push(label);
            }
            if by_range.len() < 2 {
                return None;
            }
            // Only the first module of each range is named; listing forty of
            // them would bury the range that actually has to change.
            let rendered = by_range
                .into_iter()
                .map(|(range, labels)| match labels.len() {
                    1 => format!("{range} ({})", labels[0]),
                    count => format!("{range} ({} +{})", labels[0], count - 1),
                })
                .collect::<Vec<_>>()
                .join(" vs ");
            Some(format!("{name}: {rendered}"))
        })
        .collect()
}

/// Ranges such as `*` or `latest`, which resolve differently over time.
pub fn loose_ranges(manifests: &[Manifest]) -> Vec<String> {
    let mut findings = Vec::new();
    for manifest in manifests {
        for (name, range) in &manifest.dependencies {
            if LOOSE_RANGES.contains(&range.trim()) {
                findings.push(format!(
                    "{}: `{name}` is pinned to \"{range}\" — pin a real range",
                    manifest.label
                ));
            }
        }
    }
    findings
}

fn import_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // A specifier never spans a line, which keeps a stray `from` in prose
        // or in a template literal from swallowing half a file.
        Regex::new(r#"(?:\bfrom|\brequire\s*\(|\bimport\s*\(|^\s*import)\s*["']([^"'\n]+)["']"#)
            .expect("the import pattern is valid")
    })
}

/// Every module specifier a file imports, in source order.
pub fn import_specifiers(content: &str) -> Vec<String> {
    content
        .lines()
        .flat_map(|line| {
            import_pattern()
                .captures_iter(line)
                .filter_map(|captured| captured.get(1))
                .map(|group| group.as_str().trim().to_string())
        })
        .filter(|specifier| is_specifier(specifier))
        .collect()
}

/// Whether a captured string can really be a module specifier. Regex literals
/// and template strings occasionally look like an import statement.
fn is_specifier(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "@._~/-+".contains(character))
}

/// The package a specifier belongs to, or `None` when it is not a package.
pub fn package_of(specifier: &str) -> Option<String> {
    if specifier.starts_with('.') || specifier.starts_with('/') || specifier.is_empty() {
        return None;
    }
    // `@/…` is the conventional self-alias of a package.
    if specifier.starts_with("@/") {
        return None;
    }
    if BUILTIN_PREFIXES
        .iter()
        .any(|prefix| specifier.starts_with(prefix))
    {
        return None;
    }

    let mut segments = specifier.split('/');
    let first = segments.next()?;
    let name = if first.starts_with('@') {
        format!("{first}/{}", segments.next()?)
    } else {
        first.to_string()
    };

    if BUILTINS.contains(&name.as_str()) || name == "bun" {
        return None;
    }
    Some(name)
}
