use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::mpsc::channel;

pub struct RunModuleScriptsOptions<'a> {
    pub bin_path: &'a [&'a str],
    pub label: &'a str,
    pub drop: bool,
    pub env: Option<String>,
    pub version: Option<String>,
    pub no_cache: bool,
    pub cache_dir: Option<&'a str>,
}

/// Finds every module directory under `modules/` that declares a
/// `package.json` and has the script at `bin_path`, paired with its
/// display name (the package's declared `name`, or its directory name).
fn discover_modules_with_script(modules_dir: &Path, bin_path: &[&str]) -> Vec<(String, PathBuf)> {
    let mut modules: Vec<(String, PathBuf)> = Vec::new();
    let Ok(entries) = std::fs::read_dir(modules_dir) else {
        return modules;
    };
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
        let script_path = bin_path
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

    modules
}

/// Builds the `bun run <script> [flags...]` argument list for one module.
fn build_script_args(options: &RunModuleScriptsOptions, dir: &Path, cwd: &Path) -> Vec<String> {
    let script_path = options
        .bin_path
        .iter()
        .fold(dir.to_path_buf(), |acc, part| acc.join(part));
    let mut args: Vec<String> = vec!["run".to_string(), script_path.to_string_lossy().to_string()];
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
    args
}

/// Runs the built script for one module, reporting success/failure and
/// returning whether it succeeded.
fn run_module_script(
    name: &str,
    dir: &Path,
    cwd: &Path,
    options: &RunModuleScriptsOptions,
    titled_label: &str,
) -> bool {
    let args = build_script_args(options, dir, cwd);

    super::style::step(format!("Running {} for {name}...", options.label));
    let mut command = Command::new("bun");
    command.args(&args).current_dir(dir);
    if let Some(env) = &options.env {
        command.env("APP_ENV", env);
    }

    let status = command.status();
    match status {
        Ok(status) if status.success() => {
            super::style::success(format!("{titled_label} completed for {name}"));
            true
        }
        Ok(status) => {
            super::style::error(format!(
                "{titled_label} failed for {name} (exit code: {})",
                status.code().unwrap_or(1)
            ));
            false
        }
        Err(error) => {
            super::style::error(format!("{titled_label} failed for {name}: {error}"));
            false
        }
    }
}

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

    let modules = discover_modules_with_script(&modules_dir, options.bin_path);

    if modules.is_empty() {
        super::style::warn(format!("No modules with {} found", options.label));
        return;
    }

    // Run every module's script concurrently, bounded by the number of
    // available CPUs, instead of blocking on one `bun` process at a time.
    let limit = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
        .max(1);
    let mut any_failed = false;

    let options = &options;
    let titled_label = &titled_label;

    std::thread::scope(|scope| {
        let (tx, rx) = channel::<bool>();
        let mut pending = modules.iter();
        let mut inflight = 0usize;

        loop {
            while inflight < limit {
                let Some((name, dir)) = pending.next() else {
                    break;
                };
                inflight += 1;
                let tx = tx.clone();
                scope.spawn(move || {
                    let ok = run_module_script(name, dir, cwd, options, titled_label);
                    let _ = tx.send(ok);
                });
            }

            if inflight == 0 {
                break;
            }

            let Ok(ok) = rx.recv() else {
                any_failed = true;
                break;
            };
            inflight -= 1;
            any_failed |= !ok;
        }
    });

    if any_failed {
        std::process::exit(1);
    }
}
