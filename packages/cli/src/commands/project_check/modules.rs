// Workspace discovery shared by the static `project:check` checks.
//
// Every check that inspects the repository layout (structure, env, secrets,
// dependencies, translations) needs the same three primitives: the list of
// modules, their manifests, and a bounded file walk. They live here so the
// checks stay small and testable.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::commands::project_check::{EXCLUDED_DIRS, MAX_SCANNED_FILE_BYTES, split_csv};
use crate::utils::strip_jsonc;

/// Directories that hold workspace members, in the order they are reported.
pub const MODULE_GROUPS: [&str; 2] = ["modules", "packages"];

/// Extensions holding TypeScript sources.
pub const TS_EXTENSIONS: &[&str] = &["ts", "tsx"];

/// Every module type the generators can produce.
pub const MODULE_TYPES: &[&str] = &[
    "api",
    "microservice",
    "design",
    "spa",
    "sdk",
    "module",
    "storybook",
    "swagger",
    "admin",
];

/// A workspace member — a directory under `modules/` or `packages/`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WorkspaceModule {
    /// Directory name, which is also the name used by `--modules`.
    pub name: String,
    /// `modules` or `packages`.
    pub group: String,
    pub dir: PathBuf,
    /// The `type:` declared in `<name>.yml`, when the manifest exists.
    pub kind: Option<String>,
}

impl WorkspaceModule {
    /// How the module is shown in a report line.
    pub fn label(&self) -> String {
        format!("{}/{}", self.group, self.name)
    }

    pub fn manifest_path(&self) -> PathBuf {
        self.dir.join(format!("{}.yml", self.name))
    }

    pub fn package_json_path(&self) -> PathBuf {
        self.dir.join("package.json")
    }

    /// The parsed `package.json`, or `None` when it is missing or invalid.
    pub fn package_json(&self) -> Option<Value> {
        read_json(&self.package_json_path())
    }
}

/// Read a JSON or JSONC file, tolerating comments and trailing commas.
pub fn read_json(path: &Path) -> Option<Value> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&strip_jsonc(&content)).ok()
}

/// The `type:` declared by a module manifest.
pub fn read_module_type(dir: &Path, name: &str) -> Option<String> {
    let content = fs::read_to_string(dir.join(format!("{name}.yml"))).ok()?;
    content.lines().find_map(|line| {
        let value = line.trim().strip_prefix("type:")?;
        let value = value.split('#').next().unwrap_or(value);
        Some(value.trim().trim_matches(['"', '\'']).to_string())
    })
}

/// Every workspace member. A directory counts as one as soon as it carries a
/// `package.json`, a `<name>.yml` manifest or a `src/` folder, so that a
/// module missing one of them is reported rather than silently ignored.
pub fn discover_modules(root: &Path) -> Vec<WorkspaceModule> {
    let mut modules = Vec::new();

    for group in MODULE_GROUPS {
        let Ok(entries) = fs::read_dir(root.join(group)) else {
            continue;
        };
        let mut dirs: Vec<PathBuf> = entries
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| path.is_dir())
            .collect();
        dirs.sort();

        for dir in dirs {
            let Some(name) = dir.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if name.starts_with('.') {
                continue;
            }
            let has_manifest = dir.join(format!("{name}.yml")).is_file();
            if !dir.join("package.json").is_file() && !has_manifest && !dir.join("src").is_dir() {
                continue;
            }
            modules.push(WorkspaceModule {
                name: name.to_string(),
                group: group.to_string(),
                kind: read_module_type(&dir, name),
                dir,
            });
        }
    }

    modules
}

/// Apply the `--modules` / `--packages` filters to a module list.
pub fn filter_modules(modules: Vec<WorkspaceModule>, wanted: &[String]) -> Vec<WorkspaceModule> {
    if wanted.is_empty() {
        return modules;
    }
    modules
        .into_iter()
        .filter(|module| wanted.contains(&module.name))
        .collect()
}

/// The names passed through `--modules` and `--packages`, merged.
pub fn wanted_names(modules: Option<&str>, packages: Option<&str>) -> Vec<String> {
    split_csv(modules)
        .into_iter()
        .chain(split_csv(packages))
        .collect()
}

/// Collect the files under `dir` whose extension is listed, skipping build
/// output, dependencies and anything too large to be hand-written.
pub fn collect_files(dir: &Path, extensions: &[&str], max_depth: usize) -> Vec<PathBuf> {
    let mut files = Vec::new();
    walk(dir, extensions, max_depth, 0, &mut files);
    files.sort();
    files
}

fn walk(dir: &Path, extensions: &[&str], max_depth: usize, depth: usize, files: &mut Vec<PathBuf>) {
    if depth > max_depth {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };

        if path.is_dir() {
            if name.starts_with('.') || EXCLUDED_DIRS.contains(&name) {
                continue;
            }
            walk(&path, extensions, max_depth, depth + 1, files);
            continue;
        }

        let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("");
        if !extensions.contains(&extension) {
            continue;
        }
        if fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0) > MAX_SCANNED_FILE_BYTES {
            continue;
        }
        files.push(path);
    }
}

/// Render a path relative to the project root for a report line.
pub fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string()
}

// ---------------------------------------------------------------------------
// Declared exclusions
// ---------------------------------------------------------------------------

/// Paths a module tells a check to leave alone, declared in its manifest:
///
/// ```yaml
/// checks:
///   duplication:
///     exclude:
///       - "src/shared/components/**"
/// ```
///
/// Some code is duplicated, or long, or untested on purpose, and the module
/// that owns the exception is the only place that knows why — a storybook
/// vendors the design components it renders so its own shell keeps working
/// while the design system is being edited. Without a way to say so in the
/// manifest, a generated module breaks the framework's own rules from the
/// moment it is installed, and the only way out is to stop running the check.
///
/// Patterns are globs relative to the module directory. `*` stays inside one
/// path segment, `**` crosses them, and a pattern with no wildcard at all
/// covers the directory it names.
pub fn declared_exclusions(module: &WorkspaceModule, check: &str) -> Vec<String> {
    let Ok(content) = fs::read_to_string(module.manifest_path()) else {
        return Vec::new();
    };
    let Ok(manifest) = serde_yaml::from_str::<serde_yaml::Value>(&content) else {
        return Vec::new();
    };
    manifest
        .get("checks")
        .and_then(|checks| checks.get(check))
        .and_then(|check| check.get("exclude"))
        .and_then(|exclude| exclude.as_sequence())
        .map(|patterns| {
            patterns
                .iter()
                .filter_map(|pattern| pattern.as_str())
                .map(|pattern| pattern.trim().trim_start_matches("./").to_string())
                .filter(|pattern| !pattern.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// Whether `path`, relative to the module directory, is covered by any of the
/// declared patterns.
pub fn excluded(patterns: &[String], path: &str) -> bool {
    patterns
        .iter()
        .any(|pattern| matches_glob(pattern, path.trim_start_matches("./")))
}

/// Glob match over path segments: `**` crosses separators, `*` and `?` stay
/// within one segment, and a wildcard-free pattern also covers everything
/// under the directory it names, so `src/shared` needs no `/**` to work.
pub fn matches_glob(pattern: &str, path: &str) -> bool {
    if !pattern.contains(['*', '?']) {
        let prefix = pattern.trim_end_matches('/');
        return path == prefix || path.starts_with(&format!("{prefix}/"));
    }
    let pattern: Vec<&str> = pattern.split('/').collect();
    let path: Vec<&str> = path.split('/').collect();
    match_segments(&pattern, &path)
}

fn match_segments(pattern: &[&str], path: &[&str]) -> bool {
    match pattern.split_first() {
        None => path.is_empty(),
        // `**` consumes any number of segments, including none, so the shortest
        // match is tried first and the rest of the pattern decides.
        Some((&"**", rest)) => (0..=path.len()).any(|taken| match_segments(rest, &path[taken..])),
        Some((head, rest)) => match path.split_first() {
            Some((segment, tail)) => match_segment(head, segment) && match_segments(rest, tail),
            None => false,
        },
    }
}

/// One path segment against one pattern segment, `*` matching any run of
/// characters and `?` exactly one.
fn match_segment(pattern: &str, segment: &str) -> bool {
    let pattern: Vec<char> = pattern.chars().collect();
    let segment: Vec<char> = segment.chars().collect();
    let mut table = vec![vec![false; segment.len() + 1]; pattern.len() + 1];
    table[0][0] = true;
    for (index, character) in pattern.iter().enumerate() {
        table[index + 1][0] = table[index][0] && *character == '*';
    }
    for (row, character) in pattern.iter().enumerate() {
        for column in 0..segment.len() {
            table[row + 1][column + 1] = match character {
                '*' => table[row][column + 1] || table[row + 1][column],
                '?' => table[row][column],
                _ => table[row][column] && *character == segment[column],
            };
        }
    }
    table[pattern.len()][segment.len()]
}
