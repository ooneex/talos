use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use clap::Args;
use fs_extra::dir::{CopyOptions, copy as copy_dir};
use regex::Regex;
use serde_json::Value;

use super::{
    Spinner, add_path_alias, ask_input, ask_select, clone_skeleton, run_spinner_step,
    to_kebab_case, to_pascal_case,
};

pub const CREATE_NEW_DESIGN: &str = "Create a new design";
pub const NO_TARGET: &str = "No target";

/// Shared CLI arguments for the `admin:create` and `spa:create` commands, which take
/// identical flags (an optional target module besides the design module a storybook lacks).
#[derive(Args, Debug)]
pub struct DesignWithTargetCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub design: Option<String>,

    #[arg(long)]
    pub target: Option<String>,

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

pub fn with_target_field(yml_content: &str, target_kebab: Option<&str>) -> String {
    with_optional_yml_field(yml_content, "target", target_kebab)
}

pub fn with_design_field(yml_content: &str, design_kebab: Option<&str>) -> String {
    with_optional_yml_field(yml_content, "design", design_kebab)
}

pub fn normalize_module_name(value: &str) -> String {
    let pascal = to_pascal_case(value);
    let trimmed = pascal.strip_suffix("Module").unwrap_or(&pascal);
    to_kebab_case(trimmed)
}

pub fn with_optional_yml_field(yml_content: &str, field: &str, value: Option<&str>) -> String {
    let field_re = Regex::new(&format!(r#"(?m)^{field}:\s*".*"$"#)).ok();
    match (field_re, value) {
        (Some(re), Some(value)) if re.is_match(yml_content) => re
            .replace(yml_content, format!(r#"{field}: "{value}""#))
            .into_owned(),
        (Some(re), None) if re.is_match(yml_content) => {
            re.replace(yml_content, "").replace("\n\n\n", "\n\n")
        }
        (_, Some(value)) => format!("{}\n{field}: \"{value}\"\n", yml_content.trim_end()),
        _ => yml_content.to_string(),
    }
}

pub fn collect_modules_by_type(modules_dir: &Path, expected_types: &[&str]) -> Vec<String> {
    let Ok(entries) = fs::read_dir(modules_dir) else {
        return Vec::new();
    };
    let mut modules = Vec::new();
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let yml_path = entry.path().join(format!("{name}.yml"));
        let Ok(content) = fs::read_to_string(yml_path) else {
            continue;
        };
        if expected_types
            .iter()
            .any(|expected| content.contains(&format!(r#"type: "{expected}""#)))
        {
            modules.push(name);
        }
    }
    modules
}

pub fn collect_used_ports(modules_dir: &Path) -> BTreeSet<u16> {
    let mut used = BTreeSet::new();
    let Ok(entries) = fs::read_dir(modules_dir) else {
        return used;
    };
    let port_re = Regex::new(r"--port\s+(\d+)").ok();
    for entry in entries.flatten() {
        let package_path = entry.path().join("package.json");
        let Ok(raw) = fs::read_to_string(package_path) else {
            continue;
        };
        let Ok(package_json) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        let Some(scripts) = package_json.get("scripts").and_then(Value::as_object) else {
            continue;
        };
        for script in scripts.values().filter_map(Value::as_str) {
            collect_script_ports(script, port_re.as_ref(), &mut used);
        }
    }
    used
}

/// The ports one script's `--port <n>` flags declare, added to `used`.
fn collect_script_ports(script: &str, port_re: Option<&Regex>, used: &mut BTreeSet<u16>) {
    let Some(port_re) = port_re else {
        return;
    };
    for caps in port_re.captures_iter(script) {
        if let Some(port) = caps.get(1).and_then(|m| m.as_str().parse::<u16>().ok()) {
            used.insert(port);
        }
    }
}

pub fn find_free_port(start: u16, used_ports: &BTreeSet<u16>) -> u16 {
    let mut port = start;
    while used_ports.contains(&port) {
        port += 1;
    }
    port
}

pub fn visit_files_recursive(dir: &Path, callback: &mut impl FnMut(&Path)) {
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

pub fn prompt_design_module(
    modules_dir: &Path,
    provided: Option<String>,
    silent: bool,
) -> Option<String> {
    if provided.is_some() || silent {
        return provided;
    }

    let existing = collect_modules_by_type(modules_dir, &["design"]);
    if existing.is_empty() {
        return ask_input("Enter design name");
    }

    let mut choices = existing;
    choices.push(CREATE_NEW_DESIGN.to_string());
    let refs: Vec<&str> = choices.iter().map(String::as_str).collect();
    let index = ask_select("Choose a design module", &refs)?;
    let selected = refs[index];

    if selected == CREATE_NEW_DESIGN {
        ask_input("Enter design name")
    } else {
        Some(selected.to_string())
    }
}

pub fn prompt_target_module(
    modules_dir: &Path,
    provided: Option<String>,
    silent: bool,
) -> Option<String> {
    if provided.is_some() || silent {
        return provided;
    }

    let existing = collect_modules_by_type(modules_dir, &["api", "microservice"]);
    if existing.is_empty() {
        return None;
    }

    let mut choices = vec![NO_TARGET.to_string()];
    choices.extend(existing);
    let refs: Vec<&str> = choices.iter().map(String::as_str).collect();
    let index = ask_select("Choose a target module", &refs)?;
    let selected = refs[index];

    (selected != NO_TARGET).then(|| selected.to_string())
}

pub fn clone_frontend_template(
    template_name: &str,
    module_dir: &Path,
    no_cache: bool,
) -> Result<PathBuf, String> {
    let spinner = Spinner::start(format!("Downloading {template_name} template..."));
    let cloned = clone_skeleton(true, !no_cache);
    spinner.stop();
    let Some(repo_dir) = cloned else {
        return Err("Failed to download template".to_string());
    };

    let template_dir = repo_dir.join("modules").join(template_name);
    let _ = fs::remove_dir_all(module_dir);
    let _ = fs::create_dir_all(module_dir);
    let options = CopyOptions::new().content_only(true).overwrite(true);
    copy_dir(&template_dir, module_dir, &options)
        .map_err(|error| format!("Failed to copy {template_name} template: {error}"))?;

    Ok(template_dir)
}

pub fn finalize_module_yml(
    module_dir: &Path,
    template_name: &str,
    kebab_name: &str,
    design_kebab: Option<&str>,
    target_kebab: Option<&str>,
) {
    let template_yml = module_dir.join(format!("{template_name}.yml"));
    let yml_path = module_dir.join(format!("{kebab_name}.yml"));
    let Ok(yml_content) = fs::read_to_string(&template_yml) else {
        return;
    };

    let updated = with_optional_yml_field(&yml_content, "design", design_kebab);
    let updated = with_optional_yml_field(&updated, "target", target_kebab);
    let _ = fs::write(&yml_path, updated);
    if template_yml != yml_path {
        let _ = fs::remove_file(&template_yml);
    }
}

pub fn rewrite_frontend_package(
    package_path: &Path,
    kebab_name: &str,
    port: u16,
) -> (Vec<String>, Vec<String>) {
    let mut deps = Vec::new();
    let mut dev_deps = Vec::new();
    let Ok(raw) = fs::read_to_string(package_path) else {
        return (deps, dev_deps);
    };
    let Ok(mut package_json) = serde_json::from_str::<Value>(&raw) else {
        return (deps, dev_deps);
    };

    deps = package_json
        .get("dependencies")
        .and_then(Value::as_object)
        .map(|value| value.keys().cloned().collect())
        .unwrap_or_default();
    dev_deps = package_json
        .get("devDependencies")
        .and_then(Value::as_object)
        .map(|value| value.keys().cloned().collect())
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
    }

    if let Ok(json) = serde_json::to_string_pretty(&package_json) {
        let _ = fs::write(package_path, format!("{json}\n"));
    }

    (deps, dev_deps)
}

pub fn rewrite_module_imports(src_dir: &Path, template_name: &str, kebab_name: &str) {
    let import_re = Regex::new(&format!(r#"from "@module/{template_name}(["/])"#)).ok();
    visit_files_recursive(src_dir, &mut |file_path| {
        let Ok(content) = fs::read_to_string(file_path) else {
            return;
        };
        let rewritten = import_re
            .as_ref()
            .map(|re| {
                re.replace_all(&content, format!(r#"from "@module/{kebab_name}$1"#))
                    .into_owned()
            })
            .unwrap_or_else(|| content.clone());
        if rewritten != content {
            let _ = fs::write(file_path, rewritten);
        }
    });
}

pub fn rewrite_vite_alias(vite_path: &Path, design_kebab: Option<&str>) {
    let Ok(vite_content) = fs::read_to_string(vite_path) else {
        return;
    };
    let alias_re = Regex::new(
        r#"\n\s*"@module/[\w-]+":\s*fileURLToPath\(\s*\n?\s*new URL\("\.\./[\w-]+/src",\s*import\.meta\.url\),?\s*\n?\s*\),"#,
    )
    .ok();
    let without_alias = alias_re
        .as_ref()
        .map(|re| re.replace_all(&vite_content, "").into_owned())
        .unwrap_or_else(|| vite_content.clone());
    let rewritten = if let Some(design_kebab) = design_kebab {
        let escaped_quotes = without_alias.contains("\\\"@\\\"");
        let alias_line = if escaped_quotes {
            r#"      \"@\": fileURLToPath(new URL(\"./src\", import.meta.url)),"#
        } else {
            r#"      "@": fileURLToPath(new URL("./src", import.meta.url)),"#
        };
        let design_alias = if escaped_quotes {
            format!(
                "      \\\"@\\\": fileURLToPath(new URL(\\\"./src\\\", import.meta.url)),\n      \\\"@module/{design_kebab}\\\": fileURLToPath(\n        new URL(\\\"../{design_kebab}/src\\\", import.meta.url),\n      ),"
            )
        } else {
            format!(
                "      \"@\": fileURLToPath(new URL(\"./src\", import.meta.url)),\n      \"@module/{design_kebab}\": fileURLToPath(\n        new URL(\"../{design_kebab}/src\", import.meta.url),\n      ),"
            )
        };
        without_alias.replace(alias_line, &design_alias)
    } else {
        without_alias
    };
    if rewritten != vite_content {
        let _ = fs::write(vite_path, rewritten);
    }
}

pub fn ensure_shared_placeholder(src_dir: &Path) {
    let _ = fs::create_dir_all(src_dir.join("shared"));
    let _ = fs::write(src_dir.join("shared").join(".gitkeep"), "");
}

pub fn install_frontend_dependencies(
    cwd: &Path,
    label: &str,
    deps: &[String],
    dev_deps: &[String],
    silent: bool,
) -> bool {
    if !deps.is_empty()
        && !run_spinner_step(
            silent,
            &format!("Installing {label} dependencies"),
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
            silent,
            &format!("Installing {label} dev dependencies"),
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

pub fn ensure_design_module(
    cwd: &Path,
    modules_dir: &Path,
    design_name: Option<&str>,
    design_kebab: Option<&str>,
    silent: bool,
    no_cache: bool,
) {
    let Some(design_name) = design_name else {
        return;
    };
    let Some(design_kebab) = design_kebab else {
        return;
    };
    if modules_dir.join(design_kebab).exists() {
        return;
    }

    crate::commands::design_create::run(&crate::commands::design_create::DesignCreateArgs {
        name: Some(design_name.to_string()),
        cwd: Some(cwd.to_string_lossy().to_string()),
        silent,
        no_cache,
    });
}

pub fn add_module_alias_if_present(cwd: &Path, kebab_name: &str) {
    let tsconfig_path = cwd.join("tsconfig.json");
    if tsconfig_path.exists() {
        let _ = add_path_alias(&tsconfig_path, kebab_name);
    }
}
