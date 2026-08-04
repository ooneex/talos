// Module and package discovery: walking the workspace to find every
// module's lockfiles and resolving a directory's target name. Split out
// of the parent module to keep it under the file-size budget.

use std::fs;
use std::path::Path;

use serde_json::Value;

use super::lockfiles::{
    parse_bun_lock, parse_cargo_lock, parse_composer_lock, parse_gemfile_lock, parse_go_sum,
    parse_package_lock, parse_pipfile_lock, parse_poetry_lock, parse_requirements_txt,
    parse_uv_lock,
};
use super::{EXCLUDED_DIRS, MAX_DEPTH, ModuleReport, PackageKey};

// ---------------------------------------------------------------------------
// Module + dependency discovery
// ---------------------------------------------------------------------------

pub fn collect_modules(root: &Path) -> Vec<ModuleReport> {
    let mut modules = Vec::new();
    walk(root, root, 0, &mut modules);
    modules.sort_by(|a, b| a.name.cmp(&b.name));
    modules
}

pub fn walk(root: &Path, dir: &Path, depth: usize, modules: &mut Vec<ModuleReport>) {
    let mut packages = collect_packages(dir);
    if !packages.is_empty() {
        packages.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.version.cmp(&b.version)));
        packages.dedup_by(|a, b| {
            a.ecosystem == b.ecosystem && a.name == b.name && a.version == b.version
        });
        modules.push(ModuleReport {
            name: target_name(root, dir),
            dir: dir.to_path_buf(),
            packages,
        });
    }

    if depth >= MAX_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.starts_with('.') || EXCLUDED_DIRS.contains(&name) {
            continue;
        }
        walk(root, &path, depth + 1, modules);
    }
}

pub fn collect_packages(dir: &Path) -> Vec<PackageKey> {
    let mut packages = Vec::new();
    packages.extend(parse_bun_lock(dir));
    packages.extend(parse_package_lock(dir));
    packages.extend(parse_cargo_lock(dir));
    packages.extend(parse_requirements_txt(dir));
    packages.extend(parse_pipfile_lock(dir));
    packages.extend(parse_poetry_lock(dir));
    packages.extend(parse_uv_lock(dir));
    packages.extend(parse_go_sum(dir));
    packages.extend(parse_gemfile_lock(dir));
    packages.extend(parse_composer_lock(dir));
    packages
}

pub fn target_name(root: &Path, dir: &Path) -> String {
    let Ok(rel) = dir.strip_prefix(root) else {
        return dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("root")
            .to_string();
    };
    let components: Vec<String> = rel
        .components()
        .filter_map(|c| c.as_os_str().to_str().map(str::to_string))
        .collect();
    if components.is_empty() {
        return root_package_name(root);
    }
    if components.len() >= 2 && (components[0] == "modules" || components[0] == "packages") {
        return components[1].clone();
    }
    components
        .last()
        .cloned()
        .unwrap_or_else(|| root_package_name(root))
}

pub fn root_package_name(root: &Path) -> String {
    fs::read_to_string(root.join("package.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|value| {
            value
                .get("name")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            root.file_name()
                .and_then(|name| name.to_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "root".to_string())
}
