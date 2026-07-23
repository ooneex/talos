use std::fs;
use std::path::Path;
use std::process::Command;

use clap::Args;
use fs_extra::dir::{CopyOptions, copy as copy_dir};
use serde_json::Value;

use crate::utils::{
    Spinner, add_path_alias, clone_skeleton_in_workspace, current_dir, run_spinner_step,
    to_kebab_case, to_pascal_case,
};

/// Rust port of `packages/cli/src/commands/DesignCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct DesignCreateArgs {
    /// Design module name.
    #[arg(long)]
    pub name: Option<String>,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,

    /// Suppress progress and success messages.
    #[arg(long, default_value_t = false)]
    pub silent: bool,
}

fn visit_files_recursive(dir: &Path, callback: &mut impl FnMut(&Path)) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            visit_files_recursive(&path, callback);
        } else if path.is_file() {
            callback(&path);
        }
    }
}

fn install_dependencies(
    cwd: &Path,
    dependencies: &[String],
    dev_dependencies: &[String],
    silent: bool,
) -> bool {
    if !dependencies.is_empty()
        && !run_spinner_step(
            silent,
            "Installing design dependencies",
            Command::new("bun")
                .args(["add"])
                .args(dependencies)
                .current_dir(cwd),
        )
    {
        return false;
    }

    if !dev_dependencies.is_empty()
        && !run_spinner_step(
            silent,
            "Installing design dev dependencies",
            Command::new("bun")
                .args(["add", "-D"])
                .args(dev_dependencies)
                .current_dir(cwd),
        )
    {
        return false;
    }

    true
}

pub fn run(args: &DesignCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let silent = args.silent;
    let name = args.name.clone().unwrap_or_else(|| "design".to_string());

    let pascal_name = to_pascal_case(&name)
        .strip_suffix("Module")
        .map(str::to_string)
        .unwrap_or_else(|| to_pascal_case(&name));
    let kebab_name = to_kebab_case(&pascal_name);

    let module_dir = cwd.join("modules").join(&kebab_name);
    let src_dir = module_dir.join("src");

    let clone_spinner = Spinner::start("Downloading design template...");
    let cloned = clone_skeleton_in_workspace(&cwd, &format!("design-{kebab_name}"), true);
    clone_spinner.stop();
    let Some(repo_dir) = cloned else {
        return;
    };

    let design_template_dir = repo_dir.join("modules").join("design");
    let _ = fs::remove_dir_all(&module_dir);
    let _ = fs::create_dir_all(&module_dir);
    let options = CopyOptions::new().content_only(true).overwrite(true);
    if let Err(error) = copy_dir(&design_template_dir, &module_dir, &options) {
        crate::utils::error(format!("Failed to copy design template: {error}"));
        let _ = fs::remove_dir_all(repo_dir.parent().unwrap_or(&repo_dir));
        return;
    }

    let template_yml_path = module_dir.join("design.yml");
    let yml_path = module_dir.join(format!("{kebab_name}.yml"));
    if template_yml_path != yml_path
        && template_yml_path.exists()
        && let Ok(yml_content) = fs::read_to_string(&template_yml_path)
    {
        let _ = fs::write(&yml_path, yml_content);
        let _ = fs::remove_file(&template_yml_path);
    }

    let package_path = module_dir.join("package.json");
    let mut dependencies = Vec::new();
    let mut dev_dependencies = Vec::new();
    if let Ok(raw) = fs::read_to_string(&package_path)
        && let Ok(mut package_json) = serde_json::from_str::<Value>(&raw)
    {
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
            if let Ok(json) = serde_json::to_string_pretty(&package_json) {
                let _ = fs::write(&package_path, format!("{json}\n"));
            }
        }
    }

    visit_files_recursive(&src_dir, &mut |file_path| {
        if let Ok(content) = fs::read_to_string(file_path) {
            let rewritten = content.replace(
                "from \"@module/design",
                &format!("from \"@module/{kebab_name}"),
            );
            if rewritten != content {
                let _ = fs::write(file_path, rewritten);
            }
        }
    });

    if !install_dependencies(&cwd, &dependencies, &dev_dependencies, silent) {
        let _ = fs::remove_dir_all(repo_dir.parent().unwrap_or(&repo_dir));
        return;
    }

    let _ = fs::remove_dir_all(repo_dir.parent().unwrap_or(&repo_dir));

    let app_tsconfig_path = cwd.join("tsconfig.json");
    if app_tsconfig_path.exists() {
        let _ = add_path_alias(&app_tsconfig_path, &kebab_name);
    }

    if !silent {
        crate::utils::success(format!("modules/{kebab_name} created successfully"));
    }
}
