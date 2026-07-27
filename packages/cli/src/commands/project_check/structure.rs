//! Structure check — the workspace layout the generators rely on.
//!
//! A module is only wired into the build when its manifest, its `package.json`,
//! the root workspace globs and the root path aliases agree. Renames and manual
//! deletions break that silently, so every link is verified here.

use std::path::Path;

use serde_json::Value;

use super::modules::{
    MODULE_GROUPS, MODULE_TYPES, WorkspaceModule, collect_files, discover_modules, filter_modules,
    read_json, wanted_names,
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

    if !module.manifest_path().is_file() {
        // Only `modules/` follows the Talos module convention; `packages/`
        // legitimately holds plain npm packages with no manifest.
        if module.group == "modules" {
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

    if !module.package_json_path().is_file() {
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
    }

    if !module.dir.join("src").is_dir() {
        report.warnings.push(format!("{label}: no src/ directory"));
    } else if !module.dir.join("tests").is_dir() {
        report
            .warnings
            .push(format!("{label}: no tests/ directory — tests mirror src/"));
    }

    if !module.dir.join("tsconfig.json").is_file() && has_typescript(&module.dir) {
        report.warnings.push(format!(
            "{label}: no tsconfig.json — it will not be type-checked"
        ));
    }
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

    match read_json(&root.join("package.json")) {
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
            let groups: Vec<String> = MODULE_GROUPS
                .iter()
                .filter(|group| modules.iter().any(|module| module.group == **group))
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
