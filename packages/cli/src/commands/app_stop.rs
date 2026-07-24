use std::fs;
use std::path::Path;
use std::process::Command;

use clap::Args;
use serde_json::Value;

use crate::utils::{
    RunnableModuleType, collect_runnable_modules, current_dir, ensure_bin, run_spinner_step,
    select_runnable_modules,
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
    if !ensure_bin("docker") {
        return;
    }

    let modules = collect_runnable_modules(&cwd.join("modules"));
    let selected =
        select_runnable_modules(&modules, args.modules.as_deref(), args.packages.as_deref());
    let needs_docker = selected.iter().any(|module| {
        matches!(
            module.r#type,
            RunnableModuleType::Api | RunnableModuleType::Microservice
        )
    });
    let compose_exists = needs_docker && app_dir.join("docker-compose.yml").exists();
    if !compose_exists {
        crate::utils::error("No matching Docker services to stop");
        std::process::exit(1);
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
