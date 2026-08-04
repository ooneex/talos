use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use clap::Args;
use regex::Regex;
use serde_json::Value;

use crate::utils::current_dir;

#[derive(Args, Debug)]
pub struct CommandRunArgs {
    #[arg(long)]
    pub id: Option<String>,

    #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
    pub args: Vec<String>,

    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn package_name(module_dir: &Path, fallback: &str) -> String {
    fs::read_to_string(module_dir.join("package.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|package_json| {
            package_json
                .get("name")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| fallback.to_string())
}

pub fn visit_command_files(dir: &Path, files: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            visit_command_files(&path, files);
        } else if path.is_file()
            && path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.ends_with("Command.ts"))
        {
            files.push(path);
        }
    }
}

/// Resolves the command name from `--id`, exiting with a usage error when it
/// is missing.
fn resolve_command_name(args: &CommandRunArgs) -> String {
    match args.id.clone() {
        Some(id) => id,
        None => {
            crate::utils::error(
                "Command name is required. Usage: talos command:run --id <command-name> [args...]",
            );
            std::process::exit(1);
        }
    }
}

/// Whether `module_dir` declares the command, and whether it declares any
/// commands at all. A module with no command files is treated as a candidate
/// regardless (its `run.ts` script decides), while one that does declare
/// commands but not this one is skipped outright.
fn module_command_match(
    module_dir: &Path,
    command_name: &str,
    pattern: Option<&Regex>,
) -> (bool, bool) {
    let mut command_files = Vec::new();
    visit_command_files(&module_dir.join("src").join("commands"), &mut command_files);
    let mut has_command_files = false;
    let mut has_command = false;
    for command_file in command_files {
        has_command_files = true;
        if let Ok(content) = fs::read_to_string(command_file)
            && let Some(re) = pattern
            && let Some(caps) = re.captures(&content)
            && caps.get(1).map(|m| m.as_str()) == Some(command_name)
        {
            has_command = true;
            break;
        }
    }
    (has_command_files, has_command)
}

/// Every module whose `bin/command/run.ts` script might handle the command,
/// paired with whether it was confirmed by a matching `getName()` and its
/// display name.
fn discover_candidate_modules(
    modules_dir: &Path,
    command_name: &str,
) -> Vec<(String, PathBuf, bool)> {
    let command_name_pattern =
        Regex::new(r#"getName\(\)\s*(?::\s*string)?\s*\{\s*return\s*[\"']([^\"']+)[\"'];?\s*\}"#)
            .ok();
    let Ok(entries) = fs::read_dir(modules_dir) else {
        return Vec::new();
    };

    let mut modules = Vec::new();
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let module_dir = entry.path();
        let command_run_path = module_dir.join("bin").join("command").join("run.ts");
        if !command_run_path.exists() {
            continue;
        }

        let (has_command_files, has_command) =
            module_command_match(&module_dir, command_name, command_name_pattern.as_ref());
        if has_command_files && !has_command {
            continue;
        }
        let entry_name = entry.file_name().to_string_lossy().to_string();
        modules.push((
            package_name(&module_dir, &entry_name),
            module_dir,
            has_command,
        ));
    }
    modules
}

/// Runs the command in one candidate module. Returns `true` when the caller
/// should stop looking further (a success, or a confirmed module's failure
/// which already exits the process).
fn run_in_module(
    cwd: &Path,
    command_name: &str,
    extra_args: &[String],
    name: &str,
    dir: &Path,
    confirmed: bool,
) -> bool {
    let command_run_path = dir.join("bin").join("command").join("run.ts");
    let output = Command::new("bun")
        .arg("run")
        .arg(&command_run_path)
        .arg(command_name)
        .args(extra_args)
        .current_dir(cwd)
        .output();

    match output {
        Ok(output) if output.status.success() => {
            crate::utils::success(format!("Command \"{command_name}\" completed for {name}"));
            true
        }
        Ok(output) => {
            let details = [
                String::from_utf8_lossy(&output.stdout).trim().to_string(),
                String::from_utf8_lossy(&output.stderr).trim().to_string(),
            ]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join("\n");

            if confirmed {
                crate::utils::error(format!(
                    "Command \"{command_name}\" failed in {name} (exit code: {})",
                    output.status.code().unwrap_or(1)
                ));
                if !details.is_empty() {
                    eprintln!("{details}");
                }
                std::process::exit(1);
            }

            crate::utils::warn(format!("Command \"{command_name}\" not found in {name}"));
            if !details.is_empty() {
                eprintln!("{details}");
            }
            false
        }
        Err(error) => {
            if confirmed {
                crate::utils::error(format!(
                    "Command \"{command_name}\" failed in {name}: {error}"
                ));
                std::process::exit(1);
            }
            false
        }
    }
}

pub fn run(args: &CommandRunArgs) {
    let command_name = resolve_command_name(args);
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let modules_dir = cwd.join("modules");
    if !modules_dir.exists() {
        crate::utils::warn(format!(
            "Command \"{command_name}\" not found in any module"
        ));
        return;
    }

    let modules = discover_candidate_modules(&modules_dir, &command_name);

    if modules.is_empty() {
        crate::utils::warn(format!(
            "Command \"{command_name}\" not found in any module"
        ));
        std::process::exit(1);
    }

    for (name, dir, confirmed) in modules {
        if run_in_module(&cwd, &command_name, &args.args, &name, &dir, confirmed) {
            return;
        }
    }

    crate::utils::error(format!(
        "Command \"{command_name}\" not found in any module"
    ));
    std::process::exit(1);
}
