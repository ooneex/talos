//! Dependencies check — the package manifests across the workspace.
//!
//! Bun hoists everything into a single `node_modules`, which hides two classes
//! of bug until a module is built in isolation: a dependency that is imported
//! but never declared, and the same dependency pinned to two different ranges.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;
use serde_json::Value;

use super::modules::{
    WorkspaceModule, collect_files, discover_modules, filter_modules, read_json, wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Extensions that can carry an import specifier.
const CODE_EXTENSIONS: &[&str] = &["ts", "tsx", "js", "jsx", "mjs", "cjs", "json"];

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

/// A parsed `package.json`, reduced to what the check needs.
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

/// Path alias prefixes declared in a `tsconfig.json`.
pub fn alias_prefixes(dir: &Path) -> Vec<String> {
    let Some(paths) = read_json(&dir.join("tsconfig.json"))
        .and_then(|tsconfig| tsconfig.pointer("/compilerOptions/paths").cloned())
    else {
        return Vec::new();
    };
    let Some(entries) = paths.as_object() else {
        return Vec::new();
    };

    entries
        .keys()
        .map(|alias| alias.trim_end_matches('*').to_string())
        .filter(|alias| !alias.is_empty())
        .collect()
}

/// Everything one module imports, and every file body, read once.
struct ModuleSources {
    imports: BTreeSet<String>,
    corpus: Vec<String>,
}

fn read_sources(module: &WorkspaceModule) -> ModuleSources {
    let mut imports = BTreeSet::new();
    let mut corpus = Vec::new();

    for path in collect_files(&module.dir, CODE_EXTENSIONS, 8) {
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        for specifier in import_specifiers(&content) {
            if let Some(name) = package_of(&specifier) {
                imports.insert(name);
            }
        }
        corpus.push(content);
    }

    ModuleSources { imports, corpus }
}

/// Imports that no manifest declares, and declared packages nothing uses.
pub fn compare(
    imports: &BTreeSet<String>,
    corpus: &[String],
    declared: &BTreeMap<String, String>,
    known: &BTreeSet<String>,
    aliases: &[String],
) -> (Vec<String>, Vec<String>) {
    let undeclared: Vec<String> = imports
        .iter()
        .filter(|name| !declared.contains_key(*name) && !known.contains(*name))
        .filter(|name| {
            !aliases
                .iter()
                .any(|alias| name.starts_with(alias.trim_end_matches('/')))
        })
        .cloned()
        .collect();

    let unused: Vec<String> = declared
        .keys()
        .filter(|name| !name.starts_with("@types/"))
        .filter(|name| !imports.contains(*name))
        // A package can also be referenced from a config file or a script, so
        // a plain mention anywhere in the module counts as used.
        .filter(|name| !corpus.iter().any(|content| content.contains(name.as_str())))
        .cloned()
        .collect();

    (undeclared, unused)
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );

    let mut manifests = Vec::new();
    if let Some(manifest) = read_json(&root.join("package.json")) {
        manifests.push(read_manifest("root", &manifest));
    }
    for module in &modules {
        if let Some(manifest) = module.package_json() {
            manifests.push(read_manifest(&module.label(), &manifest));
        }
    }

    if manifests.is_empty() {
        return CheckOutcome::new(
            CheckId::Dependencies,
            CheckStatus::Skipped,
            "no package.json to inspect",
        );
    }

    let mut warnings = version_mismatches(&manifests);
    warnings.extend(loose_ranges(&manifests));

    // Anything the root declares, plus every workspace package name, is
    // resolvable from a module without being declared again.
    let mut known: BTreeSet<String> = manifests
        .iter()
        .filter(|manifest| manifest.label == "root")
        .flat_map(|manifest| manifest.dependencies.keys().cloned())
        .collect();
    known.extend(
        manifests
            .iter()
            .filter_map(|manifest| manifest.name.clone()),
    );

    let aliases = alias_prefixes(root);
    for module in &modules {
        let Some(manifest) = module.package_json() else {
            continue;
        };
        let declared = read_manifest(&module.label(), &manifest).dependencies;
        let sources = read_sources(module);
        // A package can alias its own sources, so its tsconfig counts too.
        let mut scoped = aliases.clone();
        scoped.extend(alias_prefixes(&module.dir));
        let (undeclared, unused) = compare(
            &sources.imports,
            &sources.corpus,
            &declared,
            &known,
            &scoped,
        );

        for name in undeclared {
            warnings.push(format!(
                "{}: imports `{name}` without declaring it",
                module.label()
            ));
        }
        for name in unused {
            warnings.push(format!(
                "{}: declares `{name}` but never uses it",
                module.label()
            ));
        }
    }

    let scope = format!(
        "{} manifest{}",
        manifests.len(),
        if manifests.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Dependencies,
        &scope,
        "one version per dependency, all declared",
        Vec::new(),
        warnings,
    )
    .with_hint("Align the ranges in the root package.json, then re-run `bun install`")
}
