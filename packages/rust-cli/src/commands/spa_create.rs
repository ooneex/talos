use std::fs;
use std::path::Path;
use std::process::Command;

use clap::Args;
use fs_extra::dir::{CopyOptions, copy as copy_dir};
use serde_json::Value;

use crate::commands::design_create::{self, DesignCreateArgs};
use crate::utils::{
    Spinner, add_path_alias, ask_input, ask_select, clone_skeleton, current_dir, run_spinner_step,
    to_kebab_case, to_pascal_case,
};

/// Rust port of `packages/cli/src/commands/SpaCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct SpaCreateArgs {
    /// SPA module name.
    #[arg(long)]
    pub name: Option<String>,

    /// Design module name.
    #[arg(long)]
    pub design: Option<String>,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,

    /// Suppress progress and success messages.
    #[arg(long, default_value_t = false)]
    pub silent: bool,
}

const DEFAULT_PORT: u16 = 3030;
const CREATE_NEW_DESIGN: &str = "Create a new design";

fn with_design_field(yml_content: &str, design_kebab: Option<&str>) -> String {
    let design_re = regex::Regex::new(r#"(?m)^design:\s*".*"$"#).ok();
    match (design_re, design_kebab) {
        (Some(re), Some(design)) if re.is_match(yml_content) => re
            .replace(yml_content, format!("design: \"{design}\""))
            .into_owned(),
        (Some(re), None) if re.is_match(yml_content) => {
            re.replace(yml_content, "").replace("\n\n\n", "\n\n")
        }
        (_, Some(design)) => format!("{}\ndesign: \"{design}\"\n", yml_content.trim_end()),
        _ => yml_content.to_string(),
    }
}

fn collect_used_ports(modules_dir: &Path) -> std::collections::BTreeSet<u16> {
    let mut used = std::collections::BTreeSet::new();
    let Ok(entries) = fs::read_dir(modules_dir) else {
        return used;
    };
    let re = regex::Regex::new(r"--port\s+(\d+)").ok();
    for entry in entries.flatten() {
        let package_path = entry.path().join("package.json");
        if let Ok(raw) = fs::read_to_string(package_path)
            && let Ok(package_json) = serde_json::from_str::<Value>(&raw)
            && let Some(scripts) = package_json.get("scripts").and_then(Value::as_object)
        {
            for script in scripts.values().filter_map(Value::as_str) {
                if let Some(re) = &re {
                    for caps in re.captures_iter(script) {
                        if let Some(port) = caps.get(1).and_then(|m| m.as_str().parse::<u16>().ok())
                        {
                            used.insert(port);
                        }
                    }
                }
            }
        }
    }
    used
}

fn find_free_port(used_ports: &std::collections::BTreeSet<u16>) -> u16 {
    let mut port = DEFAULT_PORT;
    while used_ports.contains(&port) {
        port += 1;
    }
    port
}

fn collect_design_modules(modules_dir: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(modules_dir) else {
        return Vec::new();
    };
    let mut designs = Vec::new();
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let yml_path = entry.path().join(format!("{name}.yml"));
        if let Ok(content) = fs::read_to_string(yml_path)
            && content.contains("type: \"design\"")
        {
            designs.push(name);
        }
    }
    designs
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

fn install_root_dependencies(
    cwd: &Path,
    deps: &[String],
    dev_deps: &[String],
    silent: bool,
) -> bool {
    if !deps.is_empty()
        && !run_spinner_step(
            false,
            "Installing spa dependencies",
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
            "Installing spa dev dependencies",
            Command::new("bun")
                .args(["add", "-D"])
                .args(dev_deps)
                .current_dir(cwd),
        )
    {
        return false;
    }
    let _ = silent;
    true
}

pub fn run(args: &SpaCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let silent = args.silent;
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter spa name") {
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

    let clone_spinner = Spinner::start("Downloading spa template...");
    let cloned = clone_skeleton(true);
    clone_spinner.stop();
    let Some(repo_dir) = cloned else {
        return;
    };
    let template_dir = repo_dir.join("modules").join("spa");
    let _ = fs::remove_dir_all(&module_dir);
    let _ = fs::create_dir_all(&module_dir);
    let options = CopyOptions::new().content_only(true).overwrite(true);
    if let Err(error) = copy_dir(&template_dir, &module_dir, &options) {
        crate::utils::error(format!("Failed to copy spa template: {error}"));
        return;
    }

    let template_yml = module_dir.join("spa.yml");
    let yml_path = module_dir.join(format!("{kebab_name}.yml"));
    if let Ok(yml_content) = fs::read_to_string(&template_yml) {
        let updated = with_design_field(&yml_content, design_kebab.as_deref());
        let _ = fs::write(&yml_path, updated);
        if template_yml != yml_path {
            let _ = fs::remove_file(&template_yml);
        }
    }

    let port = find_free_port(&collect_used_ports(&modules_dir));
    let package_path = module_dir.join("package.json");
    let mut deps = Vec::new();
    let mut dev_deps = Vec::new();
    if let Ok(raw) = fs::read_to_string(&package_path)
        && let Ok(mut package_json) = serde_json::from_str::<Value>(&raw)
    {
        deps = package_json
            .get("dependencies")
            .and_then(Value::as_object)
            .map(|deps| deps.keys().cloned().collect())
            .unwrap_or_default();
        dev_deps = package_json
            .get("devDependencies")
            .and_then(Value::as_object)
            .map(|deps| deps.keys().cloned().collect())
            .unwrap_or_default();
        if let Some(root) = package_json.as_object_mut() {
            root.insert(
                "name".to_string(),
                Value::String(format!("@module/{kebab_name}")),
            );
            root.insert("type".to_string(), Value::String("module".to_string()));
            let scripts = root
                .entry("scripts")
                .or_insert_with(|| Value::Object(Default::default()));
            if let Some(scripts_map) = scripts.as_object_mut() {
                scripts_map.insert(
                    "dev".to_string(),
                    Value::String(format!("bun --bun run vite --port {port}")),
                );
                scripts_map.insert(
                    "build".to_string(),
                    Value::String("bun --bun run vite build".to_string()),
                );
                scripts_map.insert(
                    "preview".to_string(),
                    Value::String("bun --bun run vite preview".to_string()),
                );
            }
            if let Ok(json) = serde_json::to_string_pretty(&package_json) {
                let _ = fs::write(&package_path, format!("{json}\n"));
            }
        }
    }

    visit_files_recursive(&src_dir, &mut |file_path| {
        if let Ok(content) = fs::read_to_string(file_path) {
            let rewritten = regex::Regex::new(r#"from \"@module/spa(["/])"#)
                .ok()
                .map(|re| {
                    re.replace_all(&content, format!("from \"@module/{kebab_name}$1"))
                        .into_owned()
                })
                .unwrap_or(content.clone());
            if rewritten != content {
                let _ = fs::write(file_path, rewritten);
            }
        }
    });

    let vite_path = module_dir.join("vite.config.ts");
    if let Ok(vite_content) = fs::read_to_string(&vite_path) {
        let without_alias = regex::Regex::new(r#"\n\s*\"@module/[\w-]+\":\s*fileURLToPath\(\s*\n?\s*new URL\("\.\./[\w-]+/src",\s*import\.meta\.url\),?\s*\n?\s*\),"#)
            .ok()
            .map(|re| re.replace_all(&vite_content, "").into_owned())
            .unwrap_or(vite_content.clone());
        let with_alias = if let Some(design_kebab) = design_kebab.as_deref() {
            without_alias.replace(
                r#"      \"@\": fileURLToPath(new URL(\"./src\", import.meta.url)),"#,
                &format!(
                    "      \"@\": fileURLToPath(new URL(\"./src\", import.meta.url)),\n      \"@module/{design_kebab}\": fileURLToPath(\n        new URL(\"../{design_kebab}/src\", import.meta.url),\n      ),"
                ),
            )
        } else {
            without_alias
        };
        if with_alias != vite_content {
            let _ = fs::write(&vite_path, with_alias);
        }
    }

    let _ = fs::create_dir_all(src_dir.join("shared"));
    let _ = fs::write(src_dir.join("shared").join(".gitkeep"), "");

    if !install_root_dependencies(&cwd, &deps, &dev_deps, silent) {
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
