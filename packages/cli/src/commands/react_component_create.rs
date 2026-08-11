use std::process::Command;

use clap::Args;
use serde_json::Value;

use crate::utils::{
    ask_confirm, current_dir, normalize_module_name, prompt_if_missing, read_template,
    run_spinner_step, skeleton_templates_dir, to_kebab_case, to_pascal_case,
};

const TEST_DEPENDENCIES: &[&str] = &[
    "@happy-dom/global-registrator",
    "@testing-library/react",
    "@testing-library/jest-dom",
];

#[derive(Args, Debug)]
pub struct ReactComponentCreateArgs {
    #[arg(
        long,
        default_value_t = false,
        help = "Bypass the skeleton template cache and re-download templates (auto-refreshes after 24h); does not update the installed talos CLI binary itself — rerun the install script for that"
    )]
    pub no_cache: bool,

    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long)]
    pub feature: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,

    #[arg(long)]
    pub cwd: Option<String>,
}

struct ComponentPaths {
    component_path: std::path::PathBuf,
    spec_path: std::path::PathBuf,
    module_local_dir: std::path::PathBuf,
    spec_import: String,
}

fn normalize_feature_name(feature: &str) -> String {
    let mut value = to_pascal_case(feature);
    if let Some(stripped) = value.strip_suffix("Feature") {
        value = stripped.to_string();
    }
    if let Some(stripped) = value.strip_suffix("Layout") {
        value = stripped.to_string();
    }
    to_kebab_case(&value)
}

fn build_paths(
    cwd: &std::path::Path,
    module_name: &str,
    feature_name: Option<&str>,
    pascal_name: &str,
) -> ComponentPaths {
    let module_local_dir = cwd.join("modules").join(module_name);
    let component_sub_dir = feature_name
        .map(|value| format!("features/{value}/components"))
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

    ComponentPaths {
        component_path,
        spec_path,
        module_local_dir,
        spec_import,
    }
}

fn ensure_parent_dirs(paths: &ComponentPaths) {
    if let Some(parent) = paths.component_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Some(parent) = paths.spec_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
}

fn ensure_support_files(
    module_local_dir: &std::path::Path,
    happydom_template: &str,
    bunfig_template: &str,
) {
    for (path, content) in [
        (module_local_dir.join("happydom.ts"), happydom_template),
        (module_local_dir.join("bunfig.toml"), bunfig_template),
    ] {
        if !path.exists() {
            let _ = std::fs::write(&path, content);
            crate::utils::success(format!("{} created successfully", path.display()));
        }
    }
}

fn missing_test_dependencies(cwd: &std::path::Path) -> Vec<&'static str> {
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
    missing
}

struct ReactComponentTemplates {
    component: String,
    spec: String,
    happydom: String,
    bunfig: String,
}

fn load_react_component_templates(
    templates_dir: &std::path::Path,
) -> Option<ReactComponentTemplates> {
    Some(ReactComponentTemplates {
        component: read_template(templates_dir, "react-component.txt")?,
        spec: read_template(templates_dir, "react-component.spec.txt")?,
        happydom: read_template(templates_dir, "react-component.happydom.txt")?,
        bunfig: read_template(templates_dir, "react-component.bunfig.txt")?,
    })
}

pub fn run(args: &ReactComponentCreateArgs) {
    let Some(name) = prompt_if_missing(args.name.clone(), "Enter component name") else {
        return;
    };
    let Some(module) = prompt_if_missing(args.module.clone(), "Enter spa module name") else {
        return;
    };
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);

    let pascal_name = to_pascal_case(&name);
    let module_name = normalize_module_name(&module);
    let feature_name = args.feature.as_deref().map(normalize_feature_name);
    let paths = build_paths(&cwd, &module_name, feature_name.as_deref(), &pascal_name);

    if !args.r#override
        && paths.component_path.exists()
        && !ask_confirm(
            &format!("Component \"{pascal_name}\" already exists. Override it?"),
            false,
        )
    {
        return;
    }

    ensure_parent_dirs(&paths);

    let Some(templates_dir) = skeleton_templates_dir(false, !args.no_cache) else {
        return;
    };
    let Some(templates) = load_react_component_templates(&templates_dir) else {
        return;
    };

    let component_content = templates.component.replace("{{NAME}}", &pascal_name);
    let spec_content = templates
        .spec
        .replace("{{NAME}}", &pascal_name)
        .replace("{{IMPORT}}", &paths.spec_import);
    let _ = std::fs::write(&paths.component_path, component_content);
    let _ = std::fs::write(&paths.spec_path, spec_content);

    crate::utils::success(format!(
        "{} created successfully",
        paths.component_path.display()
    ));
    crate::utils::success(format!(
        "{} created successfully",
        paths.spec_path.display()
    ));

    ensure_support_files(
        &paths.module_local_dir,
        templates.happydom.as_str(),
        templates.bunfig.as_str(),
    );

    let missing = missing_test_dependencies(&cwd);

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
