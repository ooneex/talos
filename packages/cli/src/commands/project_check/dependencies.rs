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
    CargoManifest, PYTHON_EXTENSIONS, PythonManifest, RUST_EXTENSIONS, WorkspaceModule,
    collect_files, discover_modules, filter_modules, normalize_distribution, python_source_dirs,
    read_cargo_manifest, read_json, read_python_manifest, wanted_names,
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

/// Modules the compiler always provides, plus the path keywords `use` accepts.
const RUST_BUILTIN_ROOTS: [&str; 6] = ["std", "core", "alloc", "crate", "self", "super"];

/// The Python standard library, which is never declared as a dependency. Kept
/// to the modules a backend actually imports rather than the full list.
const PYTHON_STDLIB: [&str; 79] = [
    "abc",
    "argparse",
    "ast",
    "asyncio",
    "base64",
    "binascii",
    "bisect",
    "builtins",
    "calendar",
    "collections",
    "concurrent",
    "configparser",
    "contextlib",
    "copy",
    "csv",
    "ctypes",
    "dataclasses",
    "datetime",
    "decimal",
    "difflib",
    "dis",
    "email",
    "enum",
    "errno",
    "faulthandler",
    "filecmp",
    "fileinput",
    "fnmatch",
    "fractions",
    "functools",
    "gc",
    "getpass",
    "glob",
    "gzip",
    "hashlib",
    "heapq",
    "hmac",
    "html",
    "http",
    "importlib",
    "inspect",
    "io",
    "ipaddress",
    "itertools",
    "json",
    "logging",
    "math",
    "mimetypes",
    "multiprocessing",
    "operator",
    "os",
    "pathlib",
    "pickle",
    "platform",
    "pprint",
    "queue",
    "random",
    "re",
    "secrets",
    "shlex",
    "shutil",
    "signal",
    "socket",
    "sqlite3",
    "statistics",
    "string",
    "struct",
    "subprocess",
    "sys",
    "tempfile",
    "textwrap",
    "threading",
    "time",
    "traceback",
    "typing",
    "unittest",
    "urllib",
    "uuid",
    "warnings",
];

/// Tooling that is run rather than imported, and is therefore never reported as
/// an unused dependency — the Python equivalent of npm's `@types/*`.
const PYTHON_TOOL_DISTRIBUTIONS: [&str; 17] = [
    "ruff",
    "black",
    "mypy",
    "isort",
    "flake8",
    "pylint",
    "tox",
    "build",
    "hatchling",
    "hatch",
    "setuptools",
    "wheel",
    "twine",
    "coverage",
    "pre-commit",
    "uv",
    "poetry",
];

/// Distributions whose import name differs from the name they are declared
/// under, which no amount of normalisation can bridge.
const PYTHON_IMPORT_ALIASES: [(&str, &str); 12] = [
    ("yaml", "pyyaml"),
    ("dateutil", "python-dateutil"),
    ("dotenv", "python-dotenv"),
    ("jwt", "pyjwt"),
    ("pil", "pillow"),
    ("bs4", "beautifulsoup4"),
    ("cv2", "opencv-python"),
    ("sklearn", "scikit-learn"),
    ("attr", "attrs"),
    ("redis", "redis"),
    ("psycopg", "psycopg-binary"),
    ("google", "google-api-python-client"),
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

/// Turn a `Cargo.toml` into the same shape the npm side is checked in, so the
/// version rules apply to both without being written twice.
pub fn read_cargo_entry(label: &str, manifest: &CargoManifest) -> Manifest {
    Manifest {
        label: label.to_string(),
        name: manifest.name.clone(),
        dependencies: manifest.dependencies.clone(),
    }
}

/// Cargo requirements that resolve differently over time. An empty requirement
/// is not loose: it means the dependency is sourced from a path, a git revision
/// or the workspace, all of which are pinned elsewhere.
pub fn cargo_loose_requirements(manifests: &[Manifest]) -> Vec<String> {
    let mut findings = Vec::new();
    for manifest in manifests {
        for (name, requirement) in &manifest.dependencies {
            let trimmed = requirement.trim();
            if trimmed == "*" || trimmed == "x" {
                findings.push(format!(
                    "{}: `{name}` is pinned to \"{requirement}\" — pin a real requirement",
                    manifest.label
                ));
            }
        }
    }
    findings
}

fn use_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"^\s*(?:pub\s+)?(?:use|extern\s+crate)\s+(?:::)?([a-zA-Z0-9_]+)")
            .expect("the use pattern is valid")
    })
}

/// Every external crate a Rust file reaches for through `use`.
pub fn used_crates(content: &str) -> BTreeSet<String> {
    content
        .lines()
        .filter_map(|line| use_pattern().captures(line))
        .filter_map(|captured| captured.get(1))
        .map(|group| group.as_str().to_string())
        .filter(|root| !RUST_BUILTIN_ROOTS.contains(&root.as_str()))
        .collect()
}

/// Cargo lets a crate be declared as `serde_json` or `serde-json` and used the
/// other way round, so both spellings have to compare equal.
fn crate_key(name: &str) -> String {
    name.replace('-', "_")
}

/// Crates a module uses without declaring, and crates it declares without
/// using. Both sides are matched on the normalised crate name.
pub fn compare_crates(
    used: &BTreeSet<String>,
    corpus: &[String],
    declared: &BTreeMap<String, String>,
    local_modules: &BTreeSet<String>,
) -> (Vec<String>, Vec<String>) {
    let declared_keys: BTreeSet<String> = declared.keys().map(|name| crate_key(name)).collect();

    let undeclared: Vec<String> = used
        .iter()
        .filter(|name| !declared_keys.contains(&crate_key(name)))
        // A `use foo::…` of a sibling module inside the same crate — or of the
        // crate itself, which is how its own integration tests address it — is
        // not an external dependency.
        .filter(|name| !local_modules.contains(crate_key(name).as_str()))
        .cloned()
        .collect();

    let unused: Vec<String> = declared
        .keys()
        .filter(|name| {
            let key = crate_key(name);
            !used.contains(&key) && !used.contains(name.as_str())
        })
        // A crate can be reached through a fully qualified path or enabled only
        // through a feature, so any mention in the sources counts as used.
        .filter(|name| {
            let key = crate_key(name);
            !corpus
                .iter()
                .any(|content| content.contains(name.as_str()) || content.contains(key.as_str()))
        })
        .cloned()
        .collect();

    (undeclared, unused)
}

/// The `mod` declarations of a crate: the names `use` can address without them
/// being dependencies.
fn local_module_names(corpus: &[String]) -> BTreeSet<String> {
    let pattern = mod_pattern();
    corpus
        .iter()
        .flat_map(|content| content.lines())
        .filter_map(|line| pattern.captures(line))
        .filter_map(|captured| captured.get(1))
        .map(|group| crate_key(group.as_str()))
        .collect()
}

fn mod_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"^\s*(?:pub(?:\([a-z]+\))?\s+)?mod\s+([a-zA-Z0-9_]+)")
            .expect("the mod pattern is valid")
    })
}

/// Every crate one Rust module uses, and every file body, read once.
fn read_rust_sources(module: &WorkspaceModule) -> ModuleSources {
    let mut imports = BTreeSet::new();
    let mut corpus = Vec::new();

    for path in collect_files(&module.dir, RUST_EXTENSIONS, 8) {
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        imports.extend(used_crates(&content));
        corpus.push(content);
    }

    ModuleSources { imports, corpus }
}

/// Turn a `pyproject.toml` into the shape the version rules read.
pub fn read_python_entry(label: &str, manifest: &PythonManifest) -> Manifest {
    Manifest {
        label: label.to_string(),
        name: manifest.name.clone(),
        dependencies: manifest.dependencies.clone(),
    }
}

/// Requirements declared without any version specifier: the next release of the
/// dependency decides what the package installs.
pub fn unpinned_requirements(manifests: &[Manifest]) -> Vec<String> {
    let mut findings = Vec::new();
    for manifest in manifests {
        for (name, specifier) in &manifest.dependencies {
            if specifier.trim().is_empty() {
                findings.push(format!(
                    "{}: `{name}` is declared without a version specifier",
                    manifest.label
                ));
            }
        }
    }
    findings
}

fn python_import_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // Only absolute imports name a distribution: `from .models import User`
        // stays inside the package.
        Regex::new(r"^\s*(?:import|from)\s+([A-Za-z_][A-Za-z0-9_]*)")
            .expect("the python import pattern is valid")
    })
}

/// Every top-level package a Python file imports.
pub fn imported_packages(content: &str) -> BTreeSet<String> {
    content
        .lines()
        .filter(|line| !line.trim_start().starts_with("from ."))
        .filter_map(|line| python_import_pattern().captures(line))
        .filter_map(|captured| captured.get(1))
        .map(|group| group.as_str().to_string())
        .filter(|root| !PYTHON_STDLIB.contains(&root.as_str()))
        .collect()
}

/// The distribution an import name belongs to, normalised for comparison.
fn distribution_of(import: &str) -> String {
    let normalized = normalize_distribution(import);
    PYTHON_IMPORT_ALIASES
        .iter()
        .find(|(name, _)| *name == normalized)
        .map(|(_, distribution)| (*distribution).to_string())
        .unwrap_or(normalized)
}

/// Packages a module imports without declaring, and declarations nothing
/// imports. Both sides are compared after PEP 503 normalisation.
pub fn compare_python_packages(
    imported: &BTreeSet<String>,
    corpus: &[String],
    declared: &BTreeMap<String, String>,
    local: &BTreeSet<String>,
) -> (Vec<String>, Vec<String>) {
    let declared_keys: BTreeSet<String> = declared
        .keys()
        .map(|name| normalize_distribution(name))
        .collect();
    let imported_keys: BTreeSet<String> =
        imported.iter().map(|name| distribution_of(name)).collect();

    let undeclared: Vec<String> = imported
        .iter()
        .filter(|name| !declared_keys.contains(&distribution_of(name)))
        .filter(|name| !local.contains(normalize_distribution(name).as_str()))
        .cloned()
        .collect();

    let unused: Vec<String> = declared
        .keys()
        .filter(|name| !imported_keys.contains(&normalize_distribution(name)))
        .filter(|name| !is_python_tool(name))
        // A dependency can be a plugin or a fixture that no source imports by
        // name, so any mention in the package counts as used.
        .filter(|name| {
            let normalized = normalize_distribution(name);
            !corpus.iter().any(|content| {
                content.contains(name.as_str()) || content.contains(normalized.as_str())
            })
        })
        .cloned()
        .collect();

    (undeclared, unused)
}

/// Whether a distribution is a tool the package runs instead of imports.
fn is_python_tool(name: &str) -> bool {
    let normalized = normalize_distribution(name);
    PYTHON_TOOL_DISTRIBUTIONS.contains(&normalized.as_str())
        || normalized == "pytest"
        || normalized.starts_with("pytest-")
        || normalized.starts_with("types-")
}

/// The names a Python package can import from itself: its own top-level
/// packages and modules.
fn local_python_names(module: &WorkspaceModule) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    for root in python_source_dirs(module) {
        if let Some(name) = root.file_name().and_then(|name| name.to_str())
            && name != "src"
        {
            names.insert(normalize_distribution(name));
        }
        let Ok(entries) = fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let is_package = path.is_dir() && path.join("__init__.py").is_file();
            let is_module = path.extension().and_then(|extension| extension.to_str()) == Some("py");
            if !is_package && !is_module {
                continue;
            }
            if let Some(name) = path.file_stem().and_then(|name| name.to_str()) {
                names.insert(normalize_distribution(name));
            }
        }
    }
    names
}

/// Every package one Python module imports, and every file body, read once.
fn read_python_sources(module: &WorkspaceModule) -> ModuleSources {
    let mut imports = BTreeSet::new();
    let mut corpus = Vec::new();

    for path in collect_files(&module.dir, PYTHON_EXTENSIONS, 8) {
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        imports.extend(imported_packages(&content));
        corpus.push(content);
    }
    ModuleSources { imports, corpus }
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

    // Cargo manifests are kept apart: a crate and an npm package can share a
    // name without sharing a version, and comparing them would invent drift.
    let mut cargo_manifests = Vec::new();
    if let Some(manifest) = read_cargo_manifest(&root.join("Cargo.toml")) {
        cargo_manifests.push(read_cargo_entry("root", &manifest));
    }
    for module in &modules {
        if let Some(manifest) = module.cargo_toml() {
            cargo_manifests.push(read_cargo_entry(&module.label(), &manifest));
        }
    }

    // Python manifests are kept apart for the same reason.
    let mut python_manifests = Vec::new();
    if let Some(manifest) = read_python_manifest(&root.join("pyproject.toml")) {
        python_manifests.push(read_python_entry("root", &manifest));
    }
    for module in &modules {
        if let Some(manifest) = module.pyproject() {
            python_manifests.push(read_python_entry(&module.label(), &manifest));
        }
    }

    if manifests.is_empty() && cargo_manifests.is_empty() && python_manifests.is_empty() {
        return CheckOutcome::new(
            CheckId::Dependencies,
            CheckStatus::Skipped,
            "no package.json, Cargo.toml or pyproject.toml to inspect",
        );
    }

    let mut warnings = version_mismatches(&manifests);
    warnings.extend(loose_ranges(&manifests));
    warnings.extend(version_mismatches(&cargo_manifests));
    warnings.extend(cargo_loose_requirements(&cargo_manifests));
    warnings.extend(version_mismatches(&python_manifests));
    warnings.extend(unpinned_requirements(&python_manifests));

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

    for module in &modules {
        let Some(manifest) = module.cargo_toml() else {
            continue;
        };
        // A virtual workspace manifest declares no crate of its own.
        if manifest.name.is_none() {
            continue;
        }
        let sources = read_rust_sources(module);
        let mut local = local_module_names(&sources.corpus);
        if let Some(name) = &manifest.name {
            local.insert(crate_key(name));
        }
        let (undeclared, unused) = compare_crates(
            &sources.imports,
            &sources.corpus,
            &manifest.dependencies,
            &local,
        );

        for name in undeclared {
            warnings.push(format!(
                "{}: uses crate `{name}` without declaring it in Cargo.toml",
                module.label()
            ));
        }
        for name in unused {
            warnings.push(format!(
                "{}: Cargo.toml declares `{name}` but never uses it",
                module.label()
            ));
        }
    }

    for module in &modules {
        let Some(manifest) = module.pyproject() else {
            continue;
        };
        let sources = read_python_sources(module);
        let local = local_python_names(module);
        let (undeclared, unused) = compare_python_packages(
            &sources.imports,
            &sources.corpus,
            &manifest.dependencies,
            &local,
        );

        for name in undeclared {
            warnings.push(format!(
                "{}: imports `{name}` without declaring it in pyproject.toml",
                module.label()
            ));
        }
        for name in unused {
            warnings.push(format!(
                "{}: pyproject.toml declares `{name}` but nothing imports it",
                module.label()
            ));
        }
    }

    let count = manifests.len() + cargo_manifests.len() + python_manifests.len();
    let scope = format!("{count} manifest{}", if count == 1 { "" } else { "s" });

    static_outcome(
        CheckId::Dependencies,
        &scope,
        "one version per dependency, all declared",
        Vec::new(),
        warnings,
    )
    .with_hint("Align the ranges in the manifest that owns them, then reinstall the workspace")
}
