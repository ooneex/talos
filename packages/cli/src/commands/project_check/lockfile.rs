// Lockfile check — whether an install here reproduces the install in CI.
//
// The lockfile is the only file that decides which versions a teammate, a CI
// runner and a production image actually get. A second lockfile from another
// package manager, one nested inside a module, or one that predates the
// manifest next to it all mean the same thing: two machines resolve the same
// ranges differently.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use super::modules::{WorkspaceModule, discover_modules, filter_modules, relative, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// The npm-side lockfiles, and the package manager each one belongs to. `bun`
/// comes first because it is the one the generators install with.
const NPM_LOCKFILES: [(&str, &str); 5] = [
    ("bun.lock", "bun"),
    ("bun.lockb", "bun"),
    ("package-lock.json", "npm"),
    ("yarn.lock", "yarn"),
    ("pnpm-lock.yaml", "pnpm"),
];

/// The lockfiles present in a directory.
pub fn lockfiles_in(dir: &Path) -> Vec<String> {
    NPM_LOCKFILES
        .iter()
        .map(|(file, _)| *file)
        .filter(|file| dir.join(file).is_file())
        .map(str::to_string)
        .collect()
}

/// The package managers the root lockfiles imply.
pub fn managers(lockfiles: &[String]) -> BTreeSet<&'static str> {
    NPM_LOCKFILES
        .iter()
        .filter(|(file, _)| lockfiles.iter().any(|present| present == file))
        .map(|(_, manager)| *manager)
        .collect()
}

/// Dependency names declared by a manifest that the lockfile never mentions.
///
/// The lockfile is searched as text rather than parsed: every format writes the
/// dependency name in it, and the check only needs to know that it is there at
/// all.
pub fn missing_from_lock(manifest: &serde_json::Value, lockfile: &str) -> Vec<String> {
    ["dependencies", "devDependencies", "peerDependencies"]
        .iter()
        .filter_map(|field| manifest.get(*field)?.as_object())
        .flat_map(|entries| entries.keys())
        .filter(|name| !lockfile.contains(&format!("\"{name}\"")))
        .filter(|name| !lockfile.contains(&format!("\"{name}@")))
        .filter(|name| !lockfile.contains(&format!("node_modules/{name}")))
        .cloned()
        .collect()
}

/// Lockfiles inside a workspace member, which install a second dependency tree
/// beside the hoisted one.
pub fn nested(_root: &Path, modules: &[WorkspaceModule]) -> Vec<String> {
    modules
        .iter()
        .flat_map(|module| {
            let label = module.label();
            lockfiles_in(&module.dir)
                .into_iter()
                .map(move |file| {
                    format!("{label}: {file} shadows the workspace lockfile — remove it and reinstall from the root")
                })
        })
        .collect()
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );

    let present = lockfiles_in(root);
    let manifest_path = root.join("package.json");

    if present.is_empty() && !manifest_path.is_file() {
        return CheckOutcome::new(
            CheckId::Lockfile,
            CheckStatus::Skipped,
            "no lockfile and no root manifest",
        );
    }

    let mut errors = Vec::new();
    let warnings = Vec::new();

    let managers = managers(&present);
    if managers.len() > 1 {
        errors.push(format!(
            "the root holds lockfiles from {} — keep the one belonging to the package manager the project installs with",
            managers.into_iter().collect::<Vec<_>>().join(" and ")
        ));
    } else if managers.is_empty() && manifest_path.is_file() {
        errors.push(
            "no npm lockfile at the root — an install resolves the ranges afresh every time"
                .to_string(),
        );
    }

    errors.extend(nested(root, &modules));
    errors.extend(missing_manifest_entries(
        root,
        &present,
        &manifest_path,
        &modules,
    ));

    let scope = if present.is_empty() {
        "no lockfile".to_string()
    } else {
        format!(
            "{} lockfile{} · {}",
            present.len(),
            if present.len() == 1 { "" } else { "s" },
            present.join(", ")
        )
    };

    static_outcome(
        CheckId::Lockfile,
        &scope,
        "one lockfile, covering every manifest",
        errors,
        warnings,
    )
    .with_hint("Commit the lockfile — CI installs from it, not from the ranges")
}

/// Compares every manifest (root plus modules) against the npm lockfile's
/// text, reporting any declared dependency that is absent from it.
fn missing_manifest_entries(
    root: &Path,
    present: &[String],
    manifest_path: &Path,
    modules: &[WorkspaceModule],
) -> Vec<String> {
    let mut errors = Vec::new();

    // Every manifest is compared against the lockfile, because in a workspace
    // it is the module manifests that hold the dependencies.
    let Some(name) = present
        .iter()
        .find(|file| NPM_LOCKFILES.iter().any(|(npm, _)| npm == *file))
    else {
        return errors;
    };

    let path = root.join(name);
    // `bun.lockb` is binary; only the text lockfiles can be searched.
    let content = fs::read_to_string(&path).unwrap_or_default();

    for manifest_path in std::iter::once(manifest_path.to_path_buf())
        .chain(modules.iter().map(WorkspaceModule::package_json_path))
        .filter(|path| path.is_file())
        .filter(|_| !content.is_empty())
    {
        let Some(manifest) = super::modules::read_json(&manifest_path) else {
            continue;
        };
        for missing in missing_from_lock(&manifest, &content) {
            errors.push(format!(
                "{}: `{missing}` is declared but absent from {name}",
                relative(root, &manifest_path)
            ));
        }
    }

    errors
}
