//! Structure check — the workspace layout the generators rely on.
//!
//! A module is only wired into the build when its manifest, its `package.json`,
//! the root workspace globs and the root path aliases agree. Renames and manual
//! deletions break that silently, so every link is verified here.

use std::path::Path;

use serde_json::Value;

use super::modules::{
    MODULE_GROUPS, MODULE_TYPES, RUST_EXTENSIONS, WorkspaceModule, collect_files, discover_modules,
    filter_modules, normalize_distribution, python_source_dirs, read_cargo_manifest, read_json,
    read_python_manifest, wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Everything the structure check found, split by severity.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct StructureReport {
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

impl StructureReport {
    pub fn problems(&self) -> usize {
        self.errors.len() + self.warnings.len()
    }
}

/// Inspect one module against the conventions every generator follows.
pub fn inspect_module(module: &WorkspaceModule, report: &mut StructureReport) {
    let label = module.label();
    let rust_only = module.is_rust_only();
    let python_only = module.is_python_only();
    // A module written in another language declares itself through that
    // language's manifest, not through the Talos YAML one.
    let foreign = rust_only || python_only;

    if !module.manifest_path().is_file() {
        // Only `modules/` follows the Talos module convention; `packages/`
        // legitimately holds plain npm packages, Rust crates and Python
        // distributions with no manifest.
        if module.group == "modules" && !foreign {
            report.errors.push(format!(
                "{label}: {}.yml is missing — every module declares its type there",
                module.name
            ));
        }
    } else {
        match module.kind.as_deref() {
            None => report
                .errors
                .push(format!("{label}: {}.yml declares no `type:`", module.name)),
            Some(kind) if !MODULE_TYPES.contains(&kind) => report.errors.push(format!(
                "{label}: unknown type \"{kind}\" — expected one of {}",
                MODULE_TYPES.join(", ")
            )),
            Some(_) => {}
        }
    }

    if rust_only {
        inspect_cargo_manifest(module, &mut report.errors);
    } else if python_only {
        inspect_python_manifest(module, &mut report.errors, &mut report.warnings);
    } else if !module.package_json_path().is_file() {
        report
            .errors
            .push(format!("{label}: package.json is missing"));
    } else {
        match module.package_json() {
            None => report
                .errors
                .push(format!("{label}: package.json is not valid JSON")),
            Some(manifest) => {
                if manifest.get("name").and_then(Value::as_str).is_none() {
                    report
                        .errors
                        .push(format!("{label}: package.json has no \"name\""));
                }
            }
        }
        if module.is_rust() {
            inspect_cargo_manifest(module, &mut report.errors);
        }
        if module.is_python() {
            inspect_python_manifest(module, &mut report.errors, &mut report.warnings);
        }
    }

    if !module.dir.join("src").is_dir() && !has_flat_python_layout(module) {
        report.warnings.push(format!("{label}: no src/ directory"));
    } else if !module.dir.join("tests").is_dir() && !has_inline_rust_tests(module) {
        report
            .warnings
            .push(format!("{label}: no tests/ directory — tests mirror src/"));
    }

    if !foreign && !module.dir.join("tsconfig.json").is_file() && has_typescript(&module.dir) {
        report.warnings.push(format!(
            "{label}: no tsconfig.json — it will not be type-checked"
        ));
    }
}

/// A Rust crate is only buildable when its manifest declares a package name.
fn inspect_cargo_manifest(module: &WorkspaceModule, errors: &mut Vec<String>) {
    let label = module.label();
    match module.cargo_toml() {
        None => errors.push(format!("{label}: Cargo.toml is not valid TOML")),
        Some(manifest) => {
            if manifest.name.is_none() && !manifest.is_workspace {
                errors.push(format!("{label}: Cargo.toml has no [package] name"));
            }
        }
    }
}

/// A Python distribution needs a manifest that names it, otherwise it cannot be
/// built or installed. A package still relying on `setup.py` alone is reported
/// as a warning: it works, but nothing can read its metadata statically.
fn inspect_python_manifest(
    module: &WorkspaceModule,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let label = module.label();
    if !module.pyproject_path().is_file() {
        warnings.push(format!(
            "{label}: no pyproject.toml — declare the package metadata there"
        ));
        return;
    }
    match module.pyproject() {
        None => errors.push(format!("{label}: pyproject.toml is not valid TOML")),
        Some(manifest) => {
            if manifest.name.is_none() && !manifest.is_workspace {
                errors.push(format!("{label}: pyproject.toml has no [project] name"));
            }
        }
    }
}

/// A Python package using the flat layout keeps its code in a top-level package
/// directory instead of `src/`, which is valid and must not be reported.
fn has_flat_python_layout(module: &WorkspaceModule) -> bool {
    module.is_python() && !python_source_dirs(module).is_empty()
}

/// Rust crates may keep their tests in `#[cfg(test)]` modules next to the code
/// instead of a `tests/` directory.
fn has_inline_rust_tests(module: &WorkspaceModule) -> bool {
    if !module.is_rust() {
        return false;
    }
    collect_files(&module.dir.join("src"), RUST_EXTENSIONS, 8)
        .iter()
        .any(|path| {
            std::fs::read_to_string(path)
                .map(|content| content.contains("#[cfg(test)]"))
                .unwrap_or(false)
        })
}

/// Two distributions publishing the same name cannot be installed together,
/// exactly like two packages sharing an npm name.
pub fn find_duplicate_distribution_names(modules: &[WorkspaceModule]) -> Vec<String> {
    let mut seen: Vec<(String, String)> = Vec::new();
    let mut duplicates = Vec::new();

    for module in modules.iter().filter(|module| module.is_python()) {
        let Some(name) = module
            .pyproject()
            .and_then(|manifest| manifest.name)
            .map(|name| normalize_distribution(&name))
            .filter(|name| !name.is_empty())
        else {
            continue;
        };
        if let Some((_, owner)) = seen.iter().find(|(taken, _)| taken == &name) {
            duplicates.push(format!(
                "{}: distribution name \"{name}\" is already used by {owner}",
                module.label()
            ));
            continue;
        }
        seen.push((name, module.label()));
    }
    duplicates
}

/// A Python package outside the root workspace members is resolved against its
/// own environment and silently drifts from the rest of the workspace.
pub fn check_python_members(root: &Path, modules: &[WorkspaceModule]) -> Vec<String> {
    let Some(manifest) = read_python_manifest(&root.join("pyproject.toml")) else {
        return Vec::new();
    };
    if !manifest.is_workspace {
        return Vec::new();
    }

    modules
        .iter()
        .filter(|module| module.is_python())
        .filter(|module| !members_cover(&manifest.workspace_members, &module.label()))
        .map(|module| {
            format!(
                "root pyproject.toml: \"{}\" is not covered by the workspace members",
                module.label()
            )
        })
        .collect()
}

/// Whether a module actually holds TypeScript that would need a tsconfig.
fn has_typescript(dir: &Path) -> bool {
    !collect_files(&dir.join("src"), &["ts", "tsx"], 6).is_empty()
}

/// Two modules publishing the same package name break workspace resolution.
pub fn find_duplicate_names(modules: &[WorkspaceModule]) -> Vec<String> {
    let mut seen: Vec<(String, String)> = Vec::new();
    let mut duplicates = Vec::new();

    for module in modules {
        let Some(name) = module
            .package_json()
            .and_then(|manifest| manifest.get("name")?.as_str().map(str::to_string))
        else {
            continue;
        };
        if let Some((_, owner)) = seen.iter().find(|(taken, _)| taken == &name) {
            duplicates.push(format!(
                "{}: package name \"{name}\" is already used by {owner}",
                module.label()
            ));
            continue;
        }
        seen.push((name, module.label()));
    }
    duplicates
}

/// Two crates publishing the same package name break `cargo` resolution just
/// like two packages sharing an npm name.
pub fn find_duplicate_crate_names(modules: &[WorkspaceModule]) -> Vec<String> {
    let mut seen: Vec<(String, String)> = Vec::new();
    let mut duplicates = Vec::new();

    for module in modules.iter().filter(|module| module.is_rust()) {
        let Some(name) = module.cargo_toml().and_then(|manifest| manifest.name) else {
            continue;
        };
        if let Some((_, owner)) = seen.iter().find(|(taken, _)| taken == &name) {
            duplicates.push(format!(
                "{}: crate name \"{name}\" is already used by {owner}",
                module.label()
            ));
            continue;
        }
        seen.push((name, module.label()));
    }
    duplicates
}

/// Whether a `[workspace] members` glob covers a path such as `packages/cli`.
pub fn members_cover(members: &[String], path: &str) -> bool {
    members.iter().any(|member| {
        let member = member.trim_start_matches("./");
        match member.strip_suffix("/*") {
            Some(prefix) => path
                .strip_prefix(prefix)
                .and_then(|rest| rest.strip_prefix('/'))
                .is_some_and(|rest| !rest.contains('/')),
            None => member == path,
        }
    })
}

/// A crate outside the root `[workspace] members` is built with its own lockfile
/// and target directory, so it silently drifts from the rest of the workspace.
pub fn check_cargo_members(root: &Path, modules: &[WorkspaceModule]) -> Vec<String> {
    let Some(manifest) = read_cargo_manifest(&root.join("Cargo.toml")) else {
        return Vec::new();
    };
    if !manifest.is_workspace {
        return Vec::new();
    }

    modules
        .iter()
        .filter(|module| module.is_rust())
        .filter(|module| !members_cover(&manifest.workspace_members, &module.label()))
        .map(|module| {
            format!(
                "root Cargo.toml: \"{}\" is not covered by [workspace] members",
                module.label()
            )
        })
        .collect()
}

/// Whether the workspace is held together by Cargo or by Python tooling only,
/// in which case there is no root `package.json` to look for.
fn is_foreign_only_workspace(root: &Path, modules: &[WorkspaceModule]) -> bool {
    let manifest = if root.join("Cargo.toml").is_file() {
        WorkspaceModule::is_rust_only
    } else if root.join("pyproject.toml").is_file() {
        WorkspaceModule::is_python_only
    } else {
        return false;
    };
    !modules.is_empty() && modules.iter().all(manifest)
}

/// Groups holding a module must be covered by the root `workspaces` globs.
pub fn check_workspace_globs(workspaces: &[String], groups: &[String]) -> Vec<String> {
    groups
        .iter()
        .filter(|group| {
            !workspaces
                .iter()
                .any(|glob| glob.trim_start_matches("./").starts_with(group.as_str()))
        })
        .map(|group| format!("root package.json: \"workspaces\" does not cover \"{group}/*\""))
        .collect()
}

/// Path aliases that point at a directory which no longer exists.
pub fn dangling_aliases(root: &Path, paths: &Value) -> Vec<String> {
    let Some(entries) = paths.as_object() else {
        return Vec::new();
    };

    let mut dangling = Vec::new();
    for (alias, targets) in entries {
        let Some(targets) = targets.as_array() else {
            continue;
        };
        for target in targets.iter().filter_map(Value::as_str) {
            let cleaned = target
                .trim_start_matches("./")
                .trim_end_matches('*')
                .trim_end_matches('/');
            if cleaned.is_empty() {
                continue;
            }
            let resolved = root.join(cleaned);
            if !resolved.exists() {
                dangling.push(format!(
                    "tsconfig.json: alias \"{alias}\" points to \"{target}\", which does not exist"
                ));
            }
        }
    }
    dangling.sort();
    dangling
}

/// Inspect the whole workspace. Pure enough to be driven from a fixture.
pub fn inspect(root: &Path, modules: &[WorkspaceModule]) -> StructureReport {
    let mut report = StructureReport::default();

    for module in modules {
        inspect_module(module, &mut report);
    }
    report.errors.extend(find_duplicate_names(modules));
    report.errors.extend(find_duplicate_crate_names(modules));
    report.errors.extend(check_cargo_members(root, modules));
    report
        .errors
        .extend(find_duplicate_distribution_names(modules));
    report.errors.extend(check_python_members(root, modules));

    match read_json(&root.join("package.json")) {
        // A workspace whose members are all crates or all Python packages is
        // driven by that language's tooling alone.
        None if is_foreign_only_workspace(root, modules) => {}
        None => report
            .errors
            .push("root package.json is missing or invalid".to_string()),
        Some(manifest) => {
            let workspaces: Vec<String> = manifest
                .get("workspaces")
                .and_then(Value::as_array)
                .map(|globs| {
                    globs
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default();
            // A group holding only Rust crates needs no npm workspace glob.
            let groups: Vec<String> = MODULE_GROUPS
                .iter()
                .filter(|group| {
                    modules.iter().any(|module| {
                        module.group == **group
                            && !module.is_rust_only()
                            && !module.is_python_only()
                    })
                })
                .map(|group| (*group).to_string())
                .collect();
            report
                .errors
                .extend(check_workspace_globs(&workspaces, &groups));
        }
    }

    if let Some(tsconfig) = read_json(&root.join("tsconfig.json"))
        && let Some(paths) = tsconfig.pointer("/compilerOptions/paths")
    {
        report.errors.extend(dangling_aliases(root, paths));
    }

    report
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );

    if modules.is_empty() {
        return CheckOutcome::new(
            CheckId::Structure,
            CheckStatus::Skipped,
            "no module found under modules/ or packages/",
        );
    }

    let report = inspect(root, &modules);
    let scope = format!(
        "{} module{}",
        modules.len(),
        if modules.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Structure,
        &scope,
        "manifests, package names and aliases agree",
        report.errors,
        report.warnings,
    )
    .with_hint("Scaffold with `talos module:create`; `talos module:remove` cleans every reference")
}
