use std::process::Command;

use clap::Args;
use serde_json::{Map, Value};

use crate::utils::{ask_confirm, ask_input, current_dir, ensure_module, run_step, to_pascal_case};

const SPEC_TEMPLATE: &str = include_str!("../templates/e2e.spec.txt");
const CONFIG_TEMPLATE: &str = include_str!("../templates/playwright.config.txt");

/// Rust port of `packages/cli/src/commands/E2eCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct E2eCreateArgs {
    /// E2E test name.
    #[arg(long)]
    pub name: Option<String>,

    /// Destination module (defaults to "shared").
    #[arg(long)]
    pub module: Option<String>,

    /// Overwrite the file if it already exists without prompting.
    #[arg(long, default_value_t = false)]
    pub r#override: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

fn ensure_playwright_dependency(cwd: &std::path::Path) {
    let package_json_path = cwd.join("package.json");
    let Ok(raw) = std::fs::read_to_string(&package_json_path) else {
        return;
    };
    let Ok(package_json) = serde_json::from_str::<Value>(&raw) else {
        return;
    };
    let present = ["dependencies", "devDependencies"].iter().any(|key| {
        package_json
            .get(key)
            .and_then(|deps| deps.get("@playwright/test"))
            .is_some()
    });
    if present {
        return;
    }

    let _ = run_step(
        false,
        "Installing @playwright/test...",
        Command::new("bun")
            .args(["add", "-d", "@playwright/test"])
            .current_dir(cwd),
    );
}

pub fn run(args: &E2eCreateArgs) {
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter e2e test name") {
            Some(name) => name,
            None => return,
        },
    };
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let module = args.module.clone().unwrap_or_else(|| "shared".to_string());

    let mut name = to_pascal_case(&name);
    for suffix in ["Spec", "E2e"] {
        if let Some(stripped) = name.strip_suffix(suffix) {
            name = stripped.to_string();
        }
    }

    ensure_module(&module, &cwd);

    let base = cwd.join("modules").join(&module);
    let e2e_dir = base.join("e2e");
    let spec_path = e2e_dir.join(format!("{name}.spec.ts"));

    if !args.r#override
        && spec_path.exists()
        && !ask_confirm(
            &format!("E2E test \"{name}.spec.ts\" already exists. Override it?"),
            false,
        )
    {
        return;
    }

    if let Err(error) = std::fs::create_dir_all(&e2e_dir) {
        crate::utils::error(format!("Failed to create {}: {error}", e2e_dir.display()));
        return;
    }
    if let Err(error) = std::fs::write(&spec_path, SPEC_TEMPLATE) {
        crate::utils::error(format!("Failed to write {}: {error}", spec_path.display()));
        return;
    }
    crate::utils::success(format!("{} created successfully", spec_path.display()));

    let config_path = base.join("playwright.config.ts");
    if !config_path.exists() {
        if let Err(error) = std::fs::write(&config_path, CONFIG_TEMPLATE) {
            crate::utils::error(format!(
                "Failed to write {}: {error}",
                config_path.display()
            ));
            return;
        }
        crate::utils::success(format!("{} created successfully", config_path.display()));
    }

    let package_json_path = base.join("package.json");
    if let Ok(raw) = std::fs::read_to_string(&package_json_path)
        && let Ok(mut package_json) = serde_json::from_str::<Value>(&raw)
    {
        if !package_json.is_object() {
            package_json = Value::Object(Map::new());
        }
        let Some(root) = package_json.as_object_mut() else {
            return;
        };
        let scripts = root
            .entry("scripts")
            .or_insert_with(|| Value::Object(Map::new()));
        if !scripts.is_object() {
            *scripts = Value::Object(Map::new());
        }
        if let Some(map) = scripts.as_object_mut()
            && !map.contains_key("e2e")
        {
            map.insert(
                "e2e".to_string(),
                Value::String("bunx playwright test".to_string()),
            );
            if let Ok(json) = serde_json::to_string_pretty(&package_json) {
                let _ = std::fs::write(&package_json_path, format!("{json}\n"));
                crate::utils::success(format!(
                    "modules/{module}/package.json updated with the e2e script"
                ));
            }
        }
    }

    ensure_playwright_dependency(&cwd);
    let _ = run_step(
        false,
        "Installing Playwright browsers...",
        Command::new("bunx")
            .args(["playwright", "install"])
            .current_dir(&cwd),
    );
}
