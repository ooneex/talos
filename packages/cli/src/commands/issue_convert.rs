use std::path::{Path, PathBuf};

use clap::Args;
use serde_json::Value;

use crate::utils::{current_dir, error, success, warn};

#[derive(Args, Debug)]
pub struct IssueConvertArgs {
    /// Comma-separated list of destination modules or packages, e.g.
    /// `--destination=user,product`. When omitted, every module/package that
    /// owns an `issues/` directory is converted.
    #[arg(long, value_delimiter = ',', num_args = 1..)]
    pub destination: Vec<String>,

    #[arg(long)]
    pub cwd: Option<String>,
}

/// Read the `type` field from a module's `<name>.yml` descriptor, tolerating a
/// trailing `# ...` comment. Packages without a descriptor return `None`.
fn read_module_type(module_dir: &Path, name: &str) -> Option<String> {
    let content = std::fs::read_to_string(module_dir.join(format!("{name}.yml"))).ok()?;
    content.lines().find_map(|line| {
        let value = line.trim().strip_prefix("type:")?;
        let value = value.split('#').next().unwrap_or(value);
        Some(value.trim().trim_matches('"').to_string())
    })
}

/// Locate a destination folder under `modules/` first, then `packages/`.
fn locate_module(cwd: &Path, name: &str) -> Option<PathBuf> {
    ["modules", "packages"].into_iter().find_map(|root| {
        let dir = cwd.join(root).join(name);
        dir.is_dir().then_some(dir)
    })
}

/// Resolve where the `issues.json` file should be written for a module type:
/// UI-facing types keep it under `src/shared/`, everything else under `src/`.
pub fn output_path(module_dir: &Path, module_type: &str) -> PathBuf {
    let src = module_dir.join("src");
    match module_type {
        "spa" | "storybook" | "swagger" | "admin" => src.join("shared").join("issues.json"),
        _ => src.join("issues.json"),
    }
}

/// Parse every `*.yml` file in an issues directory into a JSON array, sorted by
/// file name for deterministic output.
fn collect_issues(issues_dir: &Path) -> Vec<Value> {
    let Ok(entries) = std::fs::read_dir(issues_dir) else {
        return Vec::new();
    };
    let mut files: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("yml"))
        .collect();
    files.sort();

    let mut issues = Vec::new();
    for path in files {
        let Ok(content) = std::fs::read_to_string(&path) else {
            warn(format!("Skipped unreadable issue {}", path.display()));
            continue;
        };
        let parsed = serde_yaml::from_str::<serde_yaml::Value>(&content)
            .ok()
            .and_then(|yaml| serde_json::to_value(yaml).ok());
        match parsed {
            Some(json) => issues.push(json),
            None => warn(format!("Skipped invalid issue {}", path.display())),
        }
    }
    issues
}

/// Convert a single destination's issue YAML files into an `issues.json`.
/// Returns `true` on success (including when a destination has no issues).
fn convert_destination(cwd: &Path, name: &str) -> bool {
    let Some(module_dir) = locate_module(cwd, name) else {
        error(format!(
            "Destination not found in modules/ or packages/: {name}"
        ));
        return false;
    };

    let issues_dir = module_dir.join("issues");
    if !issues_dir.is_dir() {
        warn(format!(
            "No issues directory for {name}; nothing to convert"
        ));
        return true;
    }

    let issues = collect_issues(&issues_dir);
    let module_type = read_module_type(&module_dir, name).unwrap_or_else(|| "module".to_string());
    let file_path = output_path(&module_dir, &module_type);

    if let Some(parent) = file_path.parent()
        && let Err(err) = std::fs::create_dir_all(parent)
    {
        error(format!("Failed to create {}: {err}", parent.display()));
        return false;
    }

    let json = match serde_json::to_string_pretty(&issues) {
        Ok(json) => json,
        Err(err) => {
            error(format!("Failed to serialize issues for {name}: {err}"));
            return false;
        }
    };

    if let Err(err) = std::fs::write(&file_path, format!("{json}\n")) {
        error(format!("Failed to write {}: {err}", file_path.display()));
        return false;
    }

    success(format!(
        "{} created successfully ({} issue{})",
        file_path.display(),
        issues.len(),
        if issues.len() == 1 { "" } else { "s" }
    ));
    true
}

/// Discover every module/package folder that owns an `issues/` directory, used
/// as the default set when no `--destination` is provided.
fn discover_destinations(cwd: &Path) -> Vec<String> {
    let mut names = Vec::new();
    for root in ["modules", "packages"] {
        let Ok(entries) = std::fs::read_dir(cwd.join(root)) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.join("issues").is_dir() {
                names.push(entry.file_name().to_string_lossy().to_string());
            }
        }
    }
    names.sort();
    names.dedup();
    names
}

/// Outcome of an `issue:convert` run, kept separate from `run` so the CLI
/// wrapper owns the process exit codes while the core stays testable.
#[derive(Debug, PartialEq, Eq)]
pub enum ConvertOutcome {
    /// No destination was provided and none could be discovered.
    NoDestinations,
    /// Conversion ran; `failures` counts destinations that could not be written.
    Completed { failures: usize },
}

/// Convert the requested destinations (or every discovered one when empty) and
/// report how many failed, without terminating the process.
pub fn execute(cwd: &Path, requested: &[String]) -> ConvertOutcome {
    let mut destinations: Vec<String> = requested
        .iter()
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect();

    if destinations.is_empty() {
        destinations = discover_destinations(cwd);
    }

    if destinations.is_empty() {
        return ConvertOutcome::NoDestinations;
    }

    let failures = destinations
        .iter()
        .filter(|name| !convert_destination(cwd, name))
        .count();

    ConvertOutcome::Completed { failures }
}

pub fn run(args: &IssueConvertArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);

    match execute(&cwd, &args.destination) {
        ConvertOutcome::NoDestinations => {
            error(
                "No destination with an issues/ directory found. Provide one with `talos issue:convert --destination=<module1>,<module2>`",
            );
            std::process::exit(1);
        }
        ConvertOutcome::Completed { failures } if failures > 0 => std::process::exit(1),
        ConvertOutcome::Completed { .. } => {}
    }
}
