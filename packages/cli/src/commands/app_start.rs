use std::fs;
use std::path::Path;
use std::process::Command;

use clap::Args;
use serde_json::Value;

use crate::utils::{
    ModulePort, RunnableModule, RunnableModuleType, collect_module_ports, collect_runnable_modules,
    current_dir, ensure_bin, find_app_module, free_port, info, parse_compose_ports,
    run_spinner_step, select_runnable_modules,
};

#[derive(Args, Debug)]
pub struct AppStartArgs {
    #[arg(long)]
    pub modules: Option<String>,

    #[arg(long)]
    pub packages: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,

    /// Kept for compatibility; required ports are always freed before startup.
    #[arg(long, hide = true)]
    pub kill_ports: bool,
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
/// back-end modules hot-reload their entry point from the workspace root,
/// wrapped in `sh -c` because a nested `bun` inside `bun run --parallel` is
/// a Bun-shell builtin that misroutes to the bundler.
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
            format!("sh -c 'bun run --hot {}'", entry.display())
        }
    }
}

/// Resolve Compose before stopping it so environment-backed published ports
/// reflect the values Docker will actually bind. Reading the source document
/// is a fallback for older Compose installations without JSON output.
fn collect_compose_ports(app_dir: &Path) -> Vec<ModulePort> {
    let resolved = Command::new("docker")
        .args(["compose", "config", "--format", "json"])
        .current_dir(app_dir)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| parse_compose_ports(&String::from_utf8_lossy(&output.stdout)));
    if let Some(ports) = resolved {
        return ports;
    }

    fs::read_to_string(app_dir.join("docker-compose.yml"))
        .ok()
        .and_then(|content| parse_compose_ports(&content))
        .unwrap_or_default()
}

/// Free every selected module and Compose host port, so no leftover process
/// can keep the application about to start from binding.
fn free_required_ports(modules: &[RunnableModule], compose_ports: Vec<ModulePort>) {
    let mut ports = collect_module_ports(modules);
    ports.extend(compose_ports);
    ports.sort_by_key(|entry| entry.port);
    ports.dedup_by_key(|entry| entry.port);

    for ModulePort { module, port } in ports {
        let pids = free_port(port);
        if pids.is_empty() {
            continue;
        }
        let pids = pids
            .iter()
            .map(u32::to_string)
            .collect::<Vec<_>>()
            .join(", ");
        crate::utils::success(format!("Freed port {port} of {module} (pid {pids})"));
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
    let compose_ports = if compose_exists {
        if !ensure_bin("docker") {
            return;
        }
        let ports = collect_compose_ports(&app_dir);
        if !run_spinner_step(
            false,
            &format!("Stopping previous Docker services for {name}"),
            Command::new("docker")
                .args(["compose", "down", "--remove-orphans"])
                .current_dir(&app_dir),
        ) {
            return;
        }
        ports
    } else {
        Vec::new()
    };

    free_required_ports(&selected, compose_ports);

    if compose_exists
        && !run_spinner_step(
            false,
            &format!("Starting Docker services for {name}"),
            Command::new("docker")
                .args(["compose", "up", "-d"])
                .current_dir(&app_dir),
        )
    {
        return;
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
