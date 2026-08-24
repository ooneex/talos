use std::fs;
use std::path::Path;
use std::process::Command;

use clap::Args;
use serde_json::Value;

use crate::utils::{
    RunnableModule, RunnableModuleType, collect_runnable_modules, current_dir, ensure_bin,
    find_app_module, info, run_spinner_step, select_runnable_modules,
};

#[derive(Args, Debug)]
pub struct AppStartArgs {
    #[arg(long)]
    pub modules: Option<String>,

    #[arg(long)]
    pub packages: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn load_app_module_name(app_dir: &Path, fallback: &str) -> Option<String> {
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

/// Renders a module directory relative to the workspace so the labels
/// `bun run --parallel` prints stay short.
fn module_path(cwd: &Path, module_dir: &Path) -> String {
    module_dir
        .strip_prefix(cwd)
        .unwrap_or(module_dir)
        .display()
        .to_string()
}

/// Builds the self-contained command line handed to `bun run --parallel`.
/// Front-end modules run their own `dev` script from the module directory,
/// back-end modules hot-reload their entry point from the workspace root.
pub fn command_line(cwd: &Path, module: &RunnableModule) -> String {
    match module.r#type {
        RunnableModuleType::Spa
        | RunnableModuleType::Storybook
        | RunnableModuleType::Swagger
        | RunnableModuleType::Admin => {
            format!("bun run --cwd {} dev", module_path(cwd, &module.dir))
        }
        RunnableModuleType::Api | RunnableModuleType::Microservice => {
            let entry = Path::new(&module_path(cwd, &module.dir))
                .join("src")
                .join("index.ts");
            format!("bun --hot run {}", entry.display())
        }
    }
}

pub fn run(args: &AppStartArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let modules = collect_runnable_modules(&cwd.join("modules"));
    let Some(app_module) = find_app_module(&modules) else {
        crate::utils::error("Module app not found");
        return;
    };
    let app_dir = app_module.dir.clone();
    let name =
        load_app_module_name(&app_dir, &app_module.name).unwrap_or_else(|| app_module.name.clone());

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
        if !run_spinner_step(
            false,
            &format!("Starting Docker services for {name}"),
            Command::new("docker")
                .args(["compose", "up", "-d"])
                .current_dir(&app_dir),
        ) {
            return;
        }
    }

    if !ensure_bin("bun") {
        return;
    }

    let module_names = selected
        .iter()
        .map(|module| module.name.clone())
        .collect::<Vec<_>>()
        .join(", ");
    info(format!("Starting {module_names}"));

    let mut command = Command::new("bun");
    command
        .arg("run")
        .arg("--parallel")
        .arg("--no-exit-on-error")
        .current_dir(&cwd);
    for module in &selected {
        command.arg(command_line(&cwd, module));
    }
    if std::env::var_os("TERM").is_none() {
        command.env("TERM", "xterm-256color");
    }

    let status = match command.status() {
        Ok(status) => status,
        Err(err) => {
            crate::utils::error(format!("Failed to start {module_names}: {err}"));
            std::process::exit(1);
        }
    };

    if !status.success() {
        std::process::exit(status.code().unwrap_or(1));
    }
}
