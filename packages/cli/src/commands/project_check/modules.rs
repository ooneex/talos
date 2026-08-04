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

/// Extension holding Rust sources.
pub const RUST_EXTENSIONS: &[&str] = &["rs"];

/// Extension holding Python sources.
pub const PYTHON_EXTENSIONS: &[&str] = &["py"];

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

    pub fn cargo_toml_path(&self) -> PathBuf {
        self.dir.join("Cargo.toml")
    }

    /// A Rust crate: it is `Cargo.toml` that makes it buildable, whether or not
    /// it also carries a `package.json` wrapping the cargo commands.
    pub fn is_rust(&self) -> bool {
        crate::utils::is_rust_module(&self.dir)
    }

    /// A module whose only manifest is `Cargo.toml`, so the npm-side rules
    /// (workspaces globs, path aliases, `package.json` name) do not apply.
    pub fn is_rust_only(&self) -> bool {
        self.is_rust() && !self.package_json_path().is_file()
    }

    /// The parsed `Cargo.toml`, or `None` when it is missing or invalid.
    pub fn cargo_toml(&self) -> Option<CargoManifest> {
        read_cargo_manifest(&self.cargo_toml_path())
    }

    pub fn pyproject_path(&self) -> PathBuf {
        self.dir.join("pyproject.toml")
    }

    /// A Python distribution. `pyproject.toml` is the modern manifest, but a
    /// package predating it is still Python and still has to be checked.
    pub fn is_python(&self) -> bool {
        self.pyproject_path().is_file()
            || self.dir.join("setup.py").is_file()
            || self.dir.join("setup.cfg").is_file()
            || self.dir.join("requirements.txt").is_file()
    }

    /// A module whose only manifest is a Python one, so the npm-side rules do
    /// not apply.
    pub fn is_python_only(&self) -> bool {
        self.is_python() && !self.package_json_path().is_file() && !self.is_rust()
    }

    /// The parsed `pyproject.toml`, falling back to a bare `requirements.txt`
    /// for a package that never adopted one.
    pub fn pyproject(&self) -> Option<PythonManifest> {
        match read_python_manifest(&self.pyproject_path()) {
            Some(manifest) => Some(manifest),
            None if self.pyproject_path().is_file() => None,
            None => {
                let requirements = self.dir.join("requirements.txt");
                let content = fs::read_to_string(&requirements).ok()?;
                Some(PythonManifest {
                    // `requirements.txt` names no distribution of its own.
                    name: None,
                    dependencies: parse_requirements(&content),
                    workspace_members: Vec::new(),
                    is_workspace: false,
                })
            }
        }
    }
}

#[path = "modules/manifests.rs"]
mod manifests;

pub use manifests::{
    CargoManifest, PythonManifest, normalize_distribution, parse_cargo_manifest,
    parse_python_manifest, parse_requirement, parse_requirements, read_cargo_manifest,
    read_python_manifest,
};

/// The directories holding a Python package's sources. `src/` is the layout the
/// generators produce, but a package using the flat layout keeps its code in a
/// top-level directory carrying an `__init__.py`.
pub fn python_source_dirs(module: &WorkspaceModule) -> Vec<PathBuf> {
    let src = module.dir.join("src");
    if src.is_dir() {
        return vec![src];
    }

    let Ok(entries) = fs::read_dir(&module.dir) else {
        return Vec::new();
    };
    let mut dirs: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir() && path.join("__init__.py").is_file())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name != "tests" && !name.starts_with('.'))
                .unwrap_or(false)
        })
        .collect();
    dirs.sort();
    dirs
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
/// `package.json`, a `Cargo.toml`, a `pyproject.toml`, a `<name>.yml` manifest
/// or a `src/` folder, so that a module missing one of them is reported rather
/// than silently ignored.
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
            let has_python_manifest = ["pyproject.toml", "setup.py", "setup.cfg"]
                .iter()
                .any(|manifest| dir.join(manifest).is_file());
            if !dir.join("package.json").is_file()
                && !dir.join("Cargo.toml").is_file()
                && !has_python_manifest
                && !has_manifest
                && !dir.join("src").is_dir()
            {
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
