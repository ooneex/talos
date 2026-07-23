//! Mirrors `packages/cli/src/utils.ts`'s `runModuleScripts`: runs a compiled
//! bin script (`bin/migration/up.ts`, `bin/seed/run.ts`, ...) across every
//! module that has it, in discovery order, aborting the whole command on the
//! first failure.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Options for [`run_module_scripts`], mirroring `RunModuleScriptsOptions`.
pub struct RunModuleScriptsOptions<'a> {
    pub bin_path: &'a [&'a str],
    pub label: &'a str,
    pub drop: bool,
    pub env: Option<String>,
    pub version: Option<String>,
    pub no_cache: bool,
    pub cache_dir: Option<&'a str>,
}

/// Runs `<module>/<bin_path>` for every module under `modules/` that has it,
/// forwarding `--drop`/`--version`/`--no-cache`/`--cache-dir` as applicable.
/// Exits the process with code 1 on the first failed module, matching the
/// TypeScript version's `process.exit(1)`.
pub fn run_module_scripts(cwd: &Path, options: RunModuleScriptsOptions) {
    let titled_label = {
        let mut chars = options.label.chars();
        match chars.next() {
            Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
            None => String::new(),
        }
    };

    let modules_dir = cwd.join("modules");
    if !modules_dir.exists() {
        super::style::warn(format!("No modules with {} found", options.label));
        return;
    }

    let mut modules: Vec<(String, PathBuf)> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&modules_dir) {
        let mut names: Vec<String> = entries
            .flatten()
            .filter(|e| e.path().is_dir())
            .filter_map(|e| e.file_name().into_string().ok())
            .collect();
        names.sort();

        for name in names {
            let module_dir = modules_dir.join(&name);
            if !module_dir.join("package.json").exists() {
                continue;
            }
            let script_path = options
                .bin_path
                .iter()
                .fold(module_dir.clone(), |acc, part| acc.join(part));
            if !script_path.exists() {
                continue;
            }
            let display_name = std::fs::read_to_string(module_dir.join("package.json"))
                .ok()
                .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
                .and_then(|json| {
                    json.get("name")
                        .and_then(|n| n.as_str())
                        .map(str::to_string)
                })
                .unwrap_or_else(|| name.clone());
            modules.push((display_name, module_dir));
        }
    }

    if modules.is_empty() {
        super::style::warn(format!("No modules with {} found", options.label));
        return;
    }

    for (name, dir) in modules {
        let script_path = options
            .bin_path
            .iter()
            .fold(dir.clone(), |acc, part| acc.join(part));
        let mut args: Vec<String> =
            vec!["run".to_string(), script_path.to_string_lossy().to_string()];
        if options.drop {
            args.push("--drop".to_string());
        }
        if let Some(version) = &options.version {
            args.push("--version".to_string());
            args.push(version.clone());
        }
        if options.no_cache {
            args.push("--no-cache".to_string());
        }
        if let Some(cache_dir) = options.cache_dir {
            args.push("--cache-dir".to_string());
            let module_name = dir
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            args.push(
                cwd.join(cache_dir)
                    .join(module_name)
                    .to_string_lossy()
                    .to_string(),
            );
        }

        super::style::step(format!("Running {} for {name}...", options.label));
        let mut command = Command::new("bun");
        command.args(&args).current_dir(&dir);
        if let Some(env) = &options.env {
            command.env("APP_ENV", env);
        }

        let status = command.status();
        match status {
            Ok(status) if status.success() => {
                super::style::success(format!("{titled_label} completed for {name}"));
            }
            Ok(status) => {
                super::style::error(format!(
                    "{titled_label} failed for {name} (exit code: {})",
                    status.code().unwrap_or(1)
                ));
                std::process::exit(1);
            }
            Err(error) => {
                super::style::error(format!("{titled_label} failed for {name}: {error}"));
                std::process::exit(1);
            }
        }
    }
}
