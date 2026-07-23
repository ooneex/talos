use std::fs;
use std::path::Path;
use std::process::{Child, Command, Stdio};

use clap::Args;
use serde_json::Value;

use crate::utils::{
    RunnableModuleType, collect_runnable_modules, current_dir, ensure_bin, run_step,
    select_runnable_modules,
};

/// Rust port of `packages/cli/src/commands/AppStartCommand.ts`.
#[derive(Args, Debug)]
pub struct AppStartArgs {
    /// Comma-separated module names to run.
    #[arg(long)]
    pub modules: Option<String>,

    /// Alias for `--modules`.
    #[arg(long)]
    pub packages: Option<String>,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

fn load_app_module_name(app_dir: &Path, fallback: &str) -> Option<String> {
    let package_json_path = app_dir.join("package.json");
    let raw = fs::read_to_string(package_json_path).ok()?;
    let package_json = serde_json::from_str::<Value>(&raw).ok()?;
    Some(
        package_json
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(fallback)
            .to_string(),
    )
}

fn spawn_module(
    cwd: &Path,
    module_dir: &Path,
    module_type: RunnableModuleType,
) -> std::io::Result<Child> {
    let mut command = Command::new("bun");
    match module_type {
        RunnableModuleType::Spa | RunnableModuleType::Storybook | RunnableModuleType::Swagger => {
            command.arg("run").arg("dev").current_dir(module_dir);
        }
        RunnableModuleType::Api | RunnableModuleType::Microservice => {
            command
                .args(["--hot", "run"])
                .arg(module_dir.join("src").join("index.ts"))
                .current_dir(cwd);
        }
    }
    command
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
}

pub fn run(args: &AppStartArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let app_dir = cwd.join("modules").join("app");
    let Some(name) = load_app_module_name(&app_dir, "app") else {
        crate::utils::error("Module app not found");
        return;
    };

    let modules = collect_runnable_modules(&cwd.join("modules"));
    if modules.is_empty() {
        crate::utils::error("No runnable modules found");
        return;
    }

    let selected =
        select_runnable_modules(&modules, args.modules.as_deref(), args.packages.as_deref());
    if selected.is_empty() {
        crate::utils::error("No matching modules found");
        return;
    }

    let needs_docker = selected.iter().any(|module| {
        matches!(
            module.r#type,
            RunnableModuleType::Api | RunnableModuleType::Microservice
        )
    });
    let compose_exists = needs_docker && app_dir.join("docker-compose.yml").exists();
    if compose_exists {
        if !ensure_bin("docker") {
            return;
        }
        if !run_step(
            false,
            &format!("Starting Docker services for {name}..."),
            Command::new("docker")
                .args(["compose", "up", "-d"])
                .current_dir(&app_dir),
        ) {
            return;
        }
        crate::utils::success(format!("Docker services started for {name}"));
    }

    println!(
        "Starting {}...",
        selected
            .iter()
            .map(|module| module.name.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    );

    let mut children = Vec::new();
    for module in &selected {
        match spawn_module(&cwd, &module.dir, module.r#type) {
            Ok(child) => children.push((module.name.clone(), child)),
            Err(error) => {
                crate::utils::error(format!("Failed to start {}: {error}", module.name));
                for (_, mut child) in children {
                    let _ = child.kill();
                }
                return;
            }
        }
    }

    let mut exit_code = 0;
    for (name, mut child) in children {
        match child.wait() {
            Ok(status) if status.success() => {}
            Ok(status) => {
                exit_code = status.code().unwrap_or(1);
                crate::utils::error(format!("{name} exited with code {exit_code}"));
                break;
            }
            Err(error) => {
                exit_code = 1;
                crate::utils::error(format!("Failed while waiting for {name}: {error}"));
                break;
            }
        }
    }

    if exit_code != 0 {
        std::process::exit(exit_code);
    }
}
