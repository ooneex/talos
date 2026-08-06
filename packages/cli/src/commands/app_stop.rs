use std::fs;
use std::path::Path;
use std::process::Command;

use clap::Args;
use serde_json::Value;

use crate::utils::{
    ModulePort, RunnableModule, RunnableModuleType, collect_module_ports, collect_runnable_modules,
    current_dir, ensure_bin, free_port, run_spinner_step, select_runnable_modules,
};

#[derive(Args, Debug)]
pub struct AppStopArgs {
    #[arg(long)]
    pub modules: Option<String>,

    #[arg(long)]
    pub packages: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,
}

fn load_package_name(app_dir: &Path, fallback: &str) -> String {
    fs::read_to_string(app_dir.join("package.json"))
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

/// Free every port the selected modules declare, and report the ones that were
/// actually held by a process.
fn free_module_ports(modules: &[RunnableModule]) -> usize {
    let mut freed = 0;
    for ModulePort { module, port } in collect_module_ports(modules) {
        let pids = free_port(port);
        if pids.is_empty() {
            continue;
        }
        freed += 1;
        let pids = pids
            .iter()
            .map(u32::to_string)
            .collect::<Vec<_>>()
            .join(", ");
        crate::utils::success(format!("Freed port {port} of {module} (pid {pids})"));
    }
    freed
}

pub fn run(args: &AppStopArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let app_dir = cwd.join("modules").join("app");
    if !app_dir.join("package.json").exists() {
        crate::utils::error("Module app not found");
        std::process::exit(1);
    }

    let modules = collect_runnable_modules(&cwd.join("modules"));
    let selected =
        select_runnable_modules(&modules, args.modules.as_deref(), args.packages.as_deref());
    if selected.is_empty() {
        crate::utils::error("No matching modules found");
        std::process::exit(1);
    }

    let freed = free_module_ports(&selected);

    let needs_docker = selected.iter().any(|module| {
        matches!(
            module.r#type,
            RunnableModuleType::Api | RunnableModuleType::Microservice
        )
    });
    let compose_exists = needs_docker && app_dir.join("docker-compose.yml").exists();
    if !compose_exists {
        if freed == 0 {
            crate::utils::error("Nothing to stop");
            std::process::exit(1);
        }
        return;
    }
    if !ensure_bin("docker") {
        return;
    }

    let name = load_package_name(&app_dir, "app");
    run_spinner_step(
        false,
        &format!("Stopping Docker services for {name}"),
        Command::new("docker")
            .args(["compose", "down"])
            .current_dir(&app_dir),
    );
}
