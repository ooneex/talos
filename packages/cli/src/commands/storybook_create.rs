use std::fs;
use std::path::Path;
use std::process::Command;

use clap::Args;
use fs_extra::dir::{CopyOptions, copy as copy_dir};

use crate::commands::design_create::{self, DesignCreateArgs};
use crate::utils::frontend_module::{
    collect_design_modules, collect_used_ports, find_free_port, read_dependency_names,
    rewrite_design_alias, rewrite_package_json, rewrite_playwright_port, rewrite_self_imports,
    with_design_field,
};
use crate::utils::{
    Spinner, add_path_alias, ask_input, ask_select, clone_skeleton, current_dir, run_spinner_step,
    to_kebab_case, to_pascal_case,
};

#[derive(Args, Debug)]
pub struct StorybookCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub design: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,

    #[arg(
        long,
        default_value_t = false,
        help = "Bypass the skeleton cache and re-download templates (the cache otherwise auto-refreshes after 24h)"
    )]
    pub no_cache: bool,
}

const DEFAULT_PORT: u16 = 3031;
const CREATE_NEW_DESIGN: &str = "Create a new design";

fn install_root_dependencies(cwd: &Path, deps: &[String], dev_deps: &[String]) -> bool {
    if !deps.is_empty()
        && !run_spinner_step(
            false,
            "Installing storybook dependencies",
            Command::new("bun")
                .args(["add"])
                .args(deps)
                .current_dir(cwd),
        )
    {
        return false;
    }
    if !dev_deps.is_empty()
        && !run_spinner_step(
            false,
            "Installing storybook dev dependencies",
            Command::new("bun")
                .args(["add", "-D"])
                .args(dev_deps)
                .current_dir(cwd),
        )
    {
        return false;
    }
    true
}

pub fn run(args: &StorybookCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let silent = args.silent;
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter storybook name") {
            Some(name) => name,
            None => return,
        },
    };

    let pascal_name = to_pascal_case(&name)
        .strip_suffix("Module")
        .map(str::to_string)
        .unwrap_or_else(|| to_pascal_case(&name));
    let kebab_name = to_kebab_case(&pascal_name);
    let module_dir = cwd.join("modules").join(&kebab_name);
    let src_dir = module_dir.join("src");
    let modules_dir = cwd.join("modules");

    let mut design = args.design.clone();
    if design.is_none() && !silent {
        let existing = collect_design_modules(&modules_dir);
        if existing.is_empty() {
            design = ask_input("Enter design name");
        } else {
            let mut choices: Vec<String> = existing.clone();
            choices.push(CREATE_NEW_DESIGN.to_string());
            let refs: Vec<&str> = choices.iter().map(String::as_str).collect();
            if let Some(index) = ask_select("Choose a design module", &refs) {
                let selected = refs[index];
                design = if selected == CREATE_NEW_DESIGN {
                    ask_input("Enter design name")
                } else {
                    Some(selected.to_string())
                };
            }
        }
    }
    let design_kebab = design.as_ref().map(|value| {
        to_kebab_case(
            to_pascal_case(value)
                .strip_suffix("Module")
                .unwrap_or(&to_pascal_case(value)),
        )
    });

    let clone_spinner = Spinner::start("Downloading storybook template...");
    let cloned = clone_skeleton(true, !args.no_cache);
    clone_spinner.stop();
    let Some(repo_dir) = cloned else {
        return;
    };
    let template_dir = repo_dir.join("modules").join("storybook");
    let _ = fs::remove_dir_all(&module_dir);
    let _ = fs::create_dir_all(&module_dir);
    let options = CopyOptions::new().content_only(true).overwrite(true);
    if let Err(error) = copy_dir(&template_dir, &module_dir, &options) {
        crate::utils::error(format!("Failed to copy storybook template: {error}"));
        return;
    }

    let template_yml = module_dir.join("storybook.yml");
    let yml_path = module_dir.join(format!("{kebab_name}.yml"));
    if let Ok(yml_content) = fs::read_to_string(&template_yml) {
        let updated = with_design_field(&yml_content, design_kebab.as_deref());
        let _ = fs::write(&yml_path, updated);
        if template_yml != yml_path {
            let _ = fs::remove_file(&template_yml);
        }
    }

    let port = find_free_port(&collect_used_ports(&modules_dir, &kebab_name), DEFAULT_PORT);
    let package_path = module_dir.join("package.json");
    let (deps, dev_deps) = read_dependency_names(&package_path);
    rewrite_package_json(&package_path, &kebab_name, port);
    rewrite_playwright_port(&module_dir.join("playwright.config.ts"), port);
    rewrite_self_imports(&src_dir, "storybook", &kebab_name);
    rewrite_design_alias(&module_dir.join("vite.config.ts"), design_kebab.as_deref());

    let _ = fs::create_dir_all(src_dir.join("shared"));
    let _ = fs::write(src_dir.join("shared").join(".gitkeep"), "");

    if !install_root_dependencies(&cwd, &deps, &dev_deps) {
        return;
    }

    if let Some(design_name) = design.as_ref()
        && let Some(design_kebab) = design_kebab.as_ref()
        && !modules_dir.join(design_kebab).exists()
    {
        design_create::run(&DesignCreateArgs {
            name: Some(design_name.clone()),
            cwd: Some(cwd.to_string_lossy().to_string()),
            silent,
            no_cache: args.no_cache,
        });
    }

    let app_tsconfig_path = cwd.join("tsconfig.json");
    if app_tsconfig_path.exists() {
        let _ = add_path_alias(&app_tsconfig_path, &kebab_name);
    }

    if !silent {
        crate::utils::success(format!("modules/{kebab_name} created successfully"));
    }
}
