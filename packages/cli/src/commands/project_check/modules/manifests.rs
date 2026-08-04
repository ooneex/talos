// Cargo.toml and pyproject.toml manifest parsing, split out of the parent
// module to keep it under the file-size budget.

use std::fs;
use std::path::Path;

/// A `Cargo.toml`, reduced to what the checks need.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct CargoManifest {
    /// `[package] name`, absent in a virtual workspace manifest.
    pub name: Option<String>,
    /// Merged `[dependencies]`, `[dev-dependencies]` and `[build-dependencies]`,
    /// name → rendered version requirement (empty for a path or git source).
    pub dependencies: std::collections::BTreeMap<String, String>,
    /// `[workspace] members`, when the manifest declares a workspace.
    pub workspace_members: Vec<String>,
    /// Whether the manifest declares a `[workspace]` table at all.
    pub is_workspace: bool,
}

/// Read and parse a `Cargo.toml`.
pub fn read_cargo_manifest(path: &Path) -> Option<CargoManifest> {
    let content = fs::read_to_string(path).ok()?;
    parse_cargo_manifest(&content)
}

/// Parse a `Cargo.toml`. Kept pure so the rules can be tested from a string.
pub fn parse_cargo_manifest(content: &str) -> Option<CargoManifest> {
    let value: toml::Value = toml::from_str(content).ok()?;

    let mut dependencies = std::collections::BTreeMap::new();
    for table in ["dependencies", "dev-dependencies", "build-dependencies"] {
        let Some(entries) = value.get(table).and_then(toml::Value::as_table) else {
            continue;
        };
        for (name, requirement) in entries {
            dependencies.insert(name.clone(), dependency_version(requirement));
        }
    }

    let workspace = value.get("workspace");
    Some(CargoManifest {
        name: value
            .get("package")
            .and_then(|package| package.get("name"))
            .and_then(toml::Value::as_str)
            .map(str::to_string),
        dependencies,
        workspace_members: workspace_members(workspace),
        is_workspace: workspace.is_some(),
    })
}

/// The version requirement of a dependency, whichever form it is declared in.
/// A path, git or workspace-inherited dependency carries no requirement of its
/// own and yields an empty string, which the checks read as "not pinned here".
fn dependency_version(requirement: &toml::Value) -> String {
    match requirement {
        toml::Value::String(version) => version.clone(),
        toml::Value::Table(table) => table
            .get("version")
            .and_then(toml::Value::as_str)
            .map(str::to_string)
            .unwrap_or_default(),
        _ => String::new(),
    }
}

/// Reads a `[workspace] members = [...]` (or `[tool.uv.workspace]`/`[tool.rye.workspace]`)
/// array of member globs/paths as plain strings. Shared by the Cargo and Python
/// manifest parsers, whose workspace tables otherwise only differ in nesting.
fn workspace_members(workspace: Option<&toml::Value>) -> Vec<String> {
    workspace
        .and_then(|workspace| workspace.get("members"))
        .and_then(toml::Value::as_array)
        .map(|members| {
            members
                .iter()
                .filter_map(toml::Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// A `pyproject.toml`, reduced to what the checks need. Both the standard
/// `[project]` table and Poetry's `[tool.poetry]` are read, because a workspace
/// commonly holds both.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PythonManifest {
    /// The distribution name, absent from a manifest that only configures tools.
    pub name: Option<String>,
    /// Every declared requirement, distribution name → version specifier
    /// (empty when the requirement is unpinned).
    pub dependencies: std::collections::BTreeMap<String, String>,
    /// `[tool.uv.workspace] members` or `[tool.rye.workspace] members`.
    pub workspace_members: Vec<String>,
    /// Whether the manifest declares a workspace at all.
    pub is_workspace: bool,
}

/// Read and parse a `pyproject.toml`.
pub fn read_python_manifest(path: &Path) -> Option<PythonManifest> {
    let content = fs::read_to_string(path).ok()?;
    parse_python_manifest(&content)
}

/// Parse a `pyproject.toml`. Kept pure so the rules can be tested from a string.
pub fn parse_python_manifest(content: &str) -> Option<PythonManifest> {
    let value: toml::Value = toml::from_str(content).ok()?;

    let project = value.get("project");
    let poetry = value
        .get("tool")
        .and_then(|tool| tool.get("poetry"))
        .filter(|poetry| poetry.get("name").is_some());

    let mut dependencies = std::collections::BTreeMap::new();

    // PEP 621: `dependencies` is a list of requirement strings.
    if let Some(entries) = project
        .and_then(|project| project.get("dependencies"))
        .and_then(toml::Value::as_array)
    {
        insert_requirement_list(&mut dependencies, entries);
    }
    if let Some(groups) = project
        .and_then(|project| project.get("optional-dependencies"))
        .and_then(toml::Value::as_table)
    {
        for entries in groups.values().filter_map(toml::Value::as_array) {
            insert_requirement_list(&mut dependencies, entries);
        }
    }
    // PEP 735 dependency groups, and uv's dev dependencies.
    if let Some(groups) = value
        .get("dependency-groups")
        .and_then(toml::Value::as_table)
    {
        for entries in groups.values().filter_map(toml::Value::as_array) {
            insert_requirement_list(&mut dependencies, entries);
        }
    }

    // Poetry: a table of name → constraint, where `python` is the interpreter
    // rather than a dependency.
    for table in ["dependencies", "dev-dependencies"] {
        let Some(entries) = poetry
            .and_then(|poetry| poetry.get(table))
            .and_then(toml::Value::as_table)
        else {
            continue;
        };
        for (name, constraint) in entries {
            if name == "python" {
                continue;
            }
            dependencies.insert(name.clone(), poetry_constraint(constraint));
        }
    }

    let workspace = value
        .get("tool")
        .and_then(|tool| tool.get("uv").or_else(|| tool.get("rye")))
        .and_then(|tool| tool.get("workspace"));

    Some(PythonManifest {
        name: project
            .or(poetry)
            .and_then(|table| table.get("name"))
            .and_then(toml::Value::as_str)
            .map(str::to_string),
        dependencies,
        workspace_members: workspace_members(workspace),
        is_workspace: workspace.is_some(),
    })
}

/// Parses every PEP 508 requirement string in `entries`, inserting each
/// distribution name and version specifier into `dependencies`.
fn insert_requirement_list(
    dependencies: &mut std::collections::BTreeMap<String, String>,
    entries: &[toml::Value],
) {
    for requirement in entries.iter().filter_map(toml::Value::as_str) {
        if let Some((name, specifier)) = parse_requirement(requirement) {
            dependencies.insert(name, specifier);
        }
    }
}

/// Split a PEP 508 requirement into its distribution name and its version
/// specifier, dropping extras and environment markers.
pub fn parse_requirement(requirement: &str) -> Option<(String, String)> {
    // A marker applies to the whole requirement, not to the version.
    let requirement = requirement.split(';').next().unwrap_or_default().trim();
    if requirement.is_empty() || requirement.starts_with('#') {
        return None;
    }
    // A URL requirement pins itself.
    let requirement = requirement.split('@').next().unwrap_or_default().trim();

    let split = requirement
        .find(|character: char| "<>=!~ (".contains(character))
        .unwrap_or(requirement.len());
    let (name, specifier) = requirement.split_at(split);
    let name = name.split('[').next().unwrap_or_default().trim();

    if name.is_empty() || !name.starts_with(|character: char| character.is_ascii_alphanumeric()) {
        return None;
    }
    Some((name.to_string(), specifier.trim().to_string()))
}

/// Poetry declares a dependency either as a constraint string or as a table.
fn poetry_constraint(constraint: &toml::Value) -> String {
    match constraint {
        toml::Value::String(version) => version.clone(),
        toml::Value::Table(table) => table
            .get("version")
            .and_then(toml::Value::as_str)
            .map(str::to_string)
            .unwrap_or_default(),
        _ => String::new(),
    }
}

/// Parse a `requirements.txt`, ignoring comments, options and includes.
pub fn parse_requirements(content: &str) -> std::collections::BTreeMap<String, String> {
    content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#') && !line.starts_with('-'))
        .filter_map(parse_requirement)
        .collect()
}

/// PEP 503 normalisation: `Django_REST.framework` and `django-rest-framework`
/// name the same distribution.
pub fn normalize_distribution(name: &str) -> String {
    let mut normalized = String::with_capacity(name.len());
    let mut previous_dash = false;
    for character in name.trim().to_ascii_lowercase().chars() {
        let character = if matches!(character, '_' | '.' | '-') {
            '-'
        } else {
            character
        };
        if character == '-' {
            if previous_dash {
                continue;
            }
            previous_dash = true;
        } else {
            previous_dash = false;
        }
        normalized.push(character);
    }
    normalized.trim_matches('-').to_string()
}
