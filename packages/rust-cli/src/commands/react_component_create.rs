use std::process::Command;

use clap::Args;
use serde_json::Value;

use crate::utils::{
    ask_confirm, ask_input, current_dir, run_spinner_step, to_kebab_case, to_pascal_case,
};

const COMPONENT_TEMPLATE: &str = include_str!("../templates/react-component.txt");
const SPEC_TEMPLATE: &str = include_str!("../templates/react-component.spec.txt");
const HAPPYDOM_TEMPLATE: &str = include_str!("../templates/react-component.happydom.txt");
const BUNFIG_TEMPLATE: &str = include_str!("../templates/react-component.bunfig.txt");
const TEST_DEPENDENCIES: &[&str] = &[
    "@happy-dom/global-registrator",
    "@testing-library/react",
    "@testing-library/jest-dom",
];

/// Rust port of `packages/cli/src/commands/ReactComponentCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct ReactComponentCreateArgs {
    /// Component name.
    #[arg(long)]
    pub name: Option<String>,

    /// SPA module name.
    #[arg(long)]
    pub module: Option<String>,

    /// Optional feature name.
    #[arg(long)]
    pub feature: Option<String>,

    /// Overwrite the file if it already exists without prompting.
    #[arg(long, default_value_t = false)]
    pub r#override: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &ReactComponentCreateArgs) {
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter component name") {
            Some(name) => name,
            None => return,
        },
    };
    let module = match args.module.clone() {
        Some(module) => module,
        None => match ask_input("Enter spa module name") {
            Some(module) => module,
            None => return,
        },
    };
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);

    let pascal_name = to_pascal_case(&name);
    let module_name = to_kebab_case(
        to_pascal_case(&module)
            .strip_suffix("Module")
            .unwrap_or(&to_pascal_case(&module)),
    );
    let feature_name = args.feature.as_ref().map(|feature| {
        let mut value = to_pascal_case(feature);
        if let Some(stripped) = value.strip_suffix("Feature") {
            value = stripped.to_string();
        }
        if let Some(stripped) = value.strip_suffix("Layout") {
            value = stripped.to_string();
        }
        to_kebab_case(&value)
    });

    let module_local_dir = cwd.join("modules").join(&module_name);
    let component_sub_dir = feature_name
        .as_ref()
        .map(|feature_name| format!("features/{feature_name}/components"))
        .unwrap_or_else(|| "components".to_string());
    let component_path = module_local_dir
        .join("src")
        .join(&component_sub_dir)
        .join(format!("{pascal_name}.tsx"));
    let spec_path = module_local_dir
        .join("tests")
        .join(&component_sub_dir)
        .join(format!("{pascal_name}.spec.tsx"));

    let up_to_module_root = "../".repeat(component_sub_dir.split('/').count() + 1);
    let spec_import = format!("{up_to_module_root}src/{component_sub_dir}/{pascal_name}");

    if !args.r#override
        && component_path.exists()
        && !ask_confirm(
            &format!("Component \"{pascal_name}\" already exists. Override it?"),
            false,
        )
    {
        return;
    }

    if let Some(parent) = component_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Some(parent) = spec_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let component_content = COMPONENT_TEMPLATE.replace("{{NAME}}", &pascal_name);
    let spec_content = SPEC_TEMPLATE
        .replace("{{NAME}}", &pascal_name)
        .replace("{{IMPORT}}", &spec_import);
    let _ = std::fs::write(&component_path, component_content);
    let _ = std::fs::write(&spec_path, spec_content);

    crate::utils::success(format!("{} created successfully", component_path.display()));
    crate::utils::success(format!("{} created successfully", spec_path.display()));

    for (path, content) in [
        (module_local_dir.join("happydom.ts"), HAPPYDOM_TEMPLATE),
        (module_local_dir.join("bunfig.toml"), BUNFIG_TEMPLATE),
    ] {
        if !path.exists() {
            let _ = std::fs::write(&path, content);
            crate::utils::success(format!("{} created successfully", path.display()));
        }
    }

    let package_json_path = cwd.join("package.json");
    let mut missing = Vec::new();
    if let Ok(raw) = std::fs::read_to_string(&package_json_path)
        && let Ok(package_json) = serde_json::from_str::<Value>(&raw)
    {
        let deps = package_json.get("dependencies").and_then(Value::as_object);
        let dev_deps = package_json
            .get("devDependencies")
            .and_then(Value::as_object);
        for dependency in TEST_DEPENDENCIES {
            let present = deps.and_then(|value| value.get(*dependency)).is_some()
                || dev_deps.and_then(|value| value.get(*dependency)).is_some();
            if !present {
                missing.push(*dependency);
            }
        }
    }

    if !missing.is_empty() {
        let _ = run_spinner_step(
            false,
            &format!("Installing {}", missing.join(", ")),
            Command::new("bun")
                .args(["add", "-d"])
                .args(&missing)
                .current_dir(&cwd),
        );
    }
}
