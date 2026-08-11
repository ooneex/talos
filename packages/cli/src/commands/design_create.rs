use std::fs;

use clap::Args;
use serde_json::Value;

use crate::utils::{
    add_module_alias_if_present, clone_frontend_template, current_dir,
    install_frontend_dependencies, normalize_module_name, rewrite_module_imports,
    visit_files_recursive as visit_files_recursive_impl,
};

#[derive(Args, Debug)]
pub struct DesignCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,

    #[arg(
        long,
        default_value_t = false,
        help = "Bypass the skeleton template cache and re-download templates (auto-refreshes after 24h); does not update the installed talos CLI binary itself — rerun the install script for that"
    )]
    pub no_cache: bool,
}

pub fn visit_files_recursive(dir: &std::path::Path, callback: &mut impl FnMut(&std::path::Path)) {
    visit_files_recursive_impl(dir, callback);
}

fn rewrite_design_package(
    package_path: &std::path::Path,
    kebab_name: &str,
) -> (Vec<String>, Vec<String>) {
    let mut dependencies = Vec::new();
    let mut dev_dependencies = Vec::new();
    let Ok(raw) = fs::read_to_string(package_path) else {
        return (dependencies, dev_dependencies);
    };
    let Ok(mut package_json) = serde_json::from_str::<Value>(&raw) else {
        return (dependencies, dev_dependencies);
    };

    dependencies = package_json
        .get("dependencies")
        .and_then(Value::as_object)
        .map(|deps| deps.keys().cloned().collect())
        .unwrap_or_default();
    dev_dependencies = package_json
        .get("devDependencies")
        .and_then(Value::as_object)
        .map(|deps| deps.keys().cloned().collect())
        .unwrap_or_default();
    if let Some(root) = package_json.as_object_mut() {
        root.insert(
            "name".to_string(),
            Value::String(format!("@module/{kebab_name}")),
        );
    }
    if let Ok(json) = serde_json::to_string_pretty(&package_json) {
        let _ = fs::write(package_path, format!("{json}\n"));
    }

    (dependencies, dev_dependencies)
}

fn finalize_design_yml(module_dir: &std::path::Path, kebab_name: &str) {
    let template_yml = module_dir.join("design.yml");
    let yml_path = module_dir.join(format!("{kebab_name}.yml"));
    if template_yml == yml_path || !template_yml.exists() {
        return;
    }
    let Ok(yml_content) = fs::read_to_string(&template_yml) else {
        return;
    };
    let _ = fs::write(&yml_path, yml_content);
    let _ = fs::remove_file(&template_yml);
}

pub fn run(args: &DesignCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let silent = args.silent;
    let name = args.name.clone().unwrap_or_else(|| "design".to_string());

    let kebab_name = normalize_module_name(&name);
    let module_dir = cwd.join("modules").join(&kebab_name);
    let src_dir = module_dir.join("src");

    if let Err(error) = clone_frontend_template("design", &module_dir, args.no_cache) {
        crate::utils::error(error);
        return;
    }

    finalize_design_yml(&module_dir, &kebab_name);
    let package_path = module_dir.join("package.json");
    let (dependencies, dev_dependencies) = rewrite_design_package(&package_path, &kebab_name);

    rewrite_module_imports(&src_dir, "design", &kebab_name);

    if !install_frontend_dependencies(&cwd, "design", &dependencies, &dev_dependencies, silent) {
        return;
    }

    add_module_alias_if_present(&cwd, &kebab_name);

    if !silent {
        crate::utils::success(format!("modules/{kebab_name} created successfully"));
    }
}
