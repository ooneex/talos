// Dependencies check — the package manifests across the workspace.
//
// Bun hoists everything into a single `node_modules`, which hides two classes
// of bug until a module is built in isolation: a dependency that is imported
// but never declared, and the same dependency pinned to two different ranges.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use super::modules::{
    WorkspaceModule, collect_files, discover_modules, filter_modules, read_json, wanted_names,
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
    warnings.extend(check_js_module_dependencies(&modules, &known, &aliases));

    let count = manifests.len();
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
