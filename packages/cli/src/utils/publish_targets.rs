use std::fs;
use std::path::Path;

/// A package or module directory discovered under `packages/` or `modules/`,
/// eligible for a registry publish command (`docker:publish`, `npm:publish`).
#[derive(Clone, Debug)]
pub struct PublishTarget {
    pub base: String,
    pub kind: &'static str,
    pub name: String,
}

/// Splits a comma-separated `--packages`/`--modules` flag value into trimmed,
/// non-empty entries.
pub fn split_csv(value: Option<&str>) -> Vec<String> {
    value
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
        .collect()
}

/// Lists every directory under `cwd/dir_name` as a publish target of the given `kind`.
pub fn discover_publish_targets(
    cwd: &Path,
    dir_name: &str,
    kind: &'static str,
) -> Vec<PublishTarget> {
    fs::read_dir(cwd.join(dir_name))
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().is_dir())
        .map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            PublishTarget {
                base: format!("{dir_name}/{name}"),
                kind,
                name,
            }
        })
        .collect()
}

/// Resolves the set of publish targets from explicit `--packages`/`--modules` flags,
/// or discovers every package and module directory when neither flag is given.
pub fn resolve_publish_targets(
    cwd: &Path,
    packages: Option<&str>,
    modules: Option<&str>,
) -> Vec<PublishTarget> {
    if packages.is_none() && modules.is_none() {
        let mut all = discover_publish_targets(cwd, "packages", "package");
        all.extend(discover_publish_targets(cwd, "modules", "module"));
        return all;
    }
    let mut targets = Vec::new();
    for name in split_csv(packages) {
        targets.push(PublishTarget {
            base: format!("packages/{name}"),
            kind: "package",
            name,
        });
    }
    for name in split_csv(modules) {
        targets.push(PublishTarget {
            base: format!("modules/{name}"),
            kind: "module",
            name,
        });
    }
    targets
}
