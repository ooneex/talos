// Dependencies check — the package manifests across the workspace.
//
// Bun hoists everything into a single `node_modules`, which hides two classes
// of bug until a module is built in isolation: a dependency that is imported
// but never declared, and the same dependency pinned to two different ranges.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use super::modules::{
    WorkspaceModule, collect_files, discover_modules, filter_modules, read_cargo_manifest,
    read_json, read_python_manifest, wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Extensions that can carry an import specifier.

#[path = "dependencies/js.rs"]
mod js;
use js::CODE_EXTENSIONS;
pub use js::{
    Manifest, import_specifiers, loose_ranges, package_of, read_manifest, version_mismatches,
};

/// Modules the compiler always provides, plus the path keywords `use` accepts.
pub(super) const RUST_BUILTIN_ROOTS: [&str; 6] = ["std", "core", "alloc", "crate", "self", "super"];

/// The Python standard library, which is never declared as a dependency. Kept
/// to the modules a backend actually imports rather than the full list.
pub(super) const PYTHON_STDLIB: [&str; 79] = [
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
pub(super) const PYTHON_TOOL_DISTRIBUTIONS: [&str; 17] = [
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
pub(super) const PYTHON_IMPORT_ALIASES: [(&str, &str); 12] = [
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

#[path = "dependencies/rust.rs"]
mod rust;
pub use rust::{cargo_loose_requirements, compare_crates, read_cargo_entry, used_crates};
use rust::{crate_key, local_module_names, read_rust_sources};

#[path = "dependencies/python.rs"]
mod python;
pub use python::{
    compare_python_packages, imported_packages, read_python_entry, unpinned_requirements,
};
use python::{local_python_names, read_python_sources};

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

    let manifests = collect_js_manifests(root, &modules);
    // Cargo manifests are kept apart: a crate and an npm package can share a
    // name without sharing a version, and comparing them would invent drift.
    let cargo_manifests = collect_cargo_manifests(root, &modules);
    // Python manifests are kept apart for the same reason.
    let python_manifests = collect_python_manifests(root, &modules);

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
    warnings.extend(check_js_module_dependencies(&modules, &known, &aliases));
    warnings.extend(check_rust_module_dependencies(&modules));
    warnings.extend(check_python_module_dependencies(&modules));

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

/// Reads the root and every module's `package.json` into `Manifest`s.
fn collect_js_manifests(root: &Path, modules: &[WorkspaceModule]) -> Vec<Manifest> {
    let mut manifests = Vec::new();
    if let Some(manifest) = read_json(&root.join("package.json")) {
        manifests.push(read_manifest("root", &manifest));
    }
    for module in modules {
        if let Some(manifest) = module.package_json() {
            manifests.push(read_manifest(&module.label(), &manifest));
        }
    }
    manifests
}

/// Reads the root and every module's `Cargo.toml` into `Manifest`s.
fn collect_cargo_manifests(root: &Path, modules: &[WorkspaceModule]) -> Vec<Manifest> {
    let mut manifests = Vec::new();
    if let Some(manifest) = read_cargo_manifest(&root.join("Cargo.toml")) {
        manifests.push(read_cargo_entry("root", &manifest));
    }
    for module in modules {
        if let Some(manifest) = module.cargo_toml() {
            manifests.push(read_cargo_entry(&module.label(), &manifest));
        }
    }
    manifests
}

/// Reads the root and every module's `pyproject.toml` into `Manifest`s.
fn collect_python_manifests(root: &Path, modules: &[WorkspaceModule]) -> Vec<Manifest> {
    let mut manifests = Vec::new();
    if let Some(manifest) = read_python_manifest(&root.join("pyproject.toml")) {
        manifests.push(read_python_entry("root", &manifest));
    }
    for module in modules {
        if let Some(manifest) = module.pyproject() {
            manifests.push(read_python_entry(&module.label(), &manifest));
        }
    }
    manifests
}

/// Checks every JS/TS module's declared `package.json` dependencies against
/// what its sources actually import.
fn check_js_module_dependencies(
    modules: &[WorkspaceModule],
    known: &BTreeSet<String>,
    aliases: &[String],
) -> Vec<String> {
    let mut warnings = Vec::new();
    for module in modules {
        let Some(manifest) = module.package_json() else {
            continue;
        };
        let declared = read_manifest(&module.label(), &manifest).dependencies;
        let sources = read_sources(module);
        // A package can alias its own sources, so its tsconfig counts too.
        let mut scoped = aliases.to_vec();
        scoped.extend(alias_prefixes(&module.dir));
        let (undeclared, unused) =
            compare(&sources.imports, &sources.corpus, &declared, known, &scoped);

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
    warnings
}

/// Checks every Rust module's declared `Cargo.toml` dependencies against
/// what its sources actually `use`.
fn check_rust_module_dependencies(modules: &[WorkspaceModule]) -> Vec<String> {
    let mut warnings = Vec::new();
    for module in modules {
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
    warnings
}

/// Checks every Python module's declared `pyproject.toml` dependencies
/// against what its sources actually import.
fn check_python_module_dependencies(modules: &[WorkspaceModule]) -> Vec<String> {
    let mut warnings = Vec::new();
    for module in modules {
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
    warnings
}
