use std::fs;
use std::path::PathBuf;
use std::process::Command;

use regex::Regex;

use super::case::to_pascal_case;
use super::process::run_spinner_step;
use super::prompts::{ask_confirm, ask_input};

#[derive(Default)]
pub struct ScaffoldConfig {
    pub label: &'static str,
    pub prompt_message: &'static str,
    pub suffix: &'static str,
    pub template: &'static str,
    pub test_template: &'static str,
    pub dir: &'static str,
    pub tests_dir: Option<&'static str>,
    pub strip_suffixes: &'static [&'static str],
    pub module_field: Option<&'static str>,
    pub dependency: Option<&'static str>,
    pub template_data: Option<TemplateDataFn>,
}

pub type TemplateDataFn = Box<dyn Fn(&str) -> Vec<(&'static str, String)>>;

pub struct ScaffoldOptions {
    pub name: Option<String>,
    pub module: Option<String>,
    pub r#override: bool,
}

pub fn ensure_module(module: &str, cwd: &std::path::Path) {
    let package_json = cwd.join("modules").join(module).join("package.json");
    if package_json.exists() {
        return;
    }
    crate::commands::module_create::execute(crate::commands::module_create::ModuleCreateOptions {
        name: module.to_string(),
        destination: Some("app".to_string()),
        cwd: cwd.to_path_buf(),
        silent: true,
    });
}

pub fn add_class_to_module(
    module_path: &std::path::Path,
    class_name: &str,
    import_dir: &str,
    field: &str,
) -> Result<(), String> {
    let mut content = fs::read_to_string(module_path).map_err(|e| e.to_string())?;
    let import_line = format!("import {{ {class_name} }} from \"./{import_dir}/{class_name}\";\n");

    let last_import_index = content.rfind("import ").unwrap_or(0);
    let line_end = content[last_import_index..]
        .find('\n')
        .map(|i| last_import_index + i)
        .unwrap_or(content.len().saturating_sub(1));
    content = format!(
        "{}{import_line}{}",
        &content[..=line_end.min(content.len().saturating_sub(1))],
        &content[(line_end + 1).min(content.len())..]
    );

    if let Ok(re) = Regex::new(&format!(r"(?s)({field}:\s*\[)([^\]]*)"))
        && let Some(caps) = re.captures(&content)
    {
        let existing = caps.get(2).map(|m| m.as_str().trim()).unwrap_or("");
        let new_value = if existing.is_empty() {
            class_name.to_string()
        } else {
            format!("{existing}, {class_name}")
        };
        let whole = caps.get(0).unwrap().as_str().to_string();
        let prefix = caps.get(1).unwrap().as_str().to_string();
        content = content.replacen(&whole, &format!("{prefix}{new_value}"), 1);
    }

    fs::write(module_path, content).map_err(|e| e.to_string())
}

pub fn install_dependency(dependency: &str, cwd: &std::path::Path) {
    let package_json_path = cwd.join("package.json");
    let Ok(raw) = fs::read_to_string(&package_json_path) else {
        return;
    };
    let Ok(package_json) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return;
    };
    let already_present = ["dependencies", "devDependencies"].iter().any(|key| {
        package_json
            .get(key)
            .and_then(|deps| deps.get(dependency))
            .is_some()
    });
    if already_present {
        return;
    }

    run_spinner_step(
        false,
        &format!("Installing {dependency}"),
        Command::new("bun")
            .args(["add", dependency])
            .current_dir(cwd),
    );
}

pub fn scaffold_resource(config: &ScaffoldConfig, options: ScaffoldOptions, cwd: &std::path::Path) {
    let name = match options.name {
        Some(name) => name,
        None => match ask_input(config.prompt_message) {
            Some(name) => name,
            None => return,
        },
    };

    let module = options.module.unwrap_or_else(|| "shared".to_string());

    let mut name = to_pascal_case(&name);
    let strip_suffixes: &[&str] = if config.strip_suffixes.is_empty() {
        std::slice::from_ref(&config.suffix)
    } else {
        config.strip_suffixes
    };
    for suffix in strip_suffixes {
        if let Some(stripped) = name.strip_suffix(suffix) {
            name = stripped.to_string();
        }
    }

    let mut content = config.template.replace("{{NAME}}", &name);
    if let Some(template_data) = &config.template_data {
        for (key, value) in template_data(&name) {
            content = content.replace(&format!("{{{{{key}}}}}"), &value);
        }
    }

    ensure_module(&module, cwd);

    let base = cwd.join("modules").join(&module);
    let local_dir = base.join("src").join(config.dir);
    let file_name = format!("{name}{}.ts", config.suffix);
    let file_path = local_dir.join(&file_name);

    if !options.r#override
        && file_path.exists()
        && !ask_confirm(
            &format!(
                "{} \"{name}{}\" already exists. Override it?",
                config.label, config.suffix
            ),
            false,
        )
    {
        return;
    }

    if let Some(parent) = file_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if fs::write(&file_path, content).is_err() {
        super::style::error(format!("Failed to write {}", file_path.display()));
        return;
    }

    let test_content = config
        .test_template
        .replace("{{NAME}}", &name)
        .replace("{{MODULE}}", &module);
    let tests_local_dir = base
        .join("tests")
        .join(config.tests_dir.unwrap_or(config.dir));
    let test_file_path = tests_local_dir.join(format!("{name}{}.spec.ts", config.suffix));
    if let Some(parent) = test_file_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&test_file_path, test_content);

    if let Some(module_field) = config.module_field {
        let module_pascal_name = to_pascal_case(&module);
        let module_path = base
            .join("src")
            .join(format!("{module_pascal_name}Module.ts"));
        if module_path.exists() {
            let _ = add_class_to_module(
                &module_path,
                &format!("{name}{}", config.suffix),
                config.dir,
                module_field,
            );
        }
    }

    super::style::success(format!(
        "{} created successfully",
        local_dir
            .join(format!("{name}{}.ts", config.suffix))
            .display()
    ));
    super::style::success(format!(
        "{} created successfully",
        tests_local_dir
            .join(format!("{name}{}.spec.ts", config.suffix))
            .display()
    ));

    if let Some(dependency) = config.dependency {
        install_dependency(dependency, cwd);
    }
}

pub fn current_dir() -> PathBuf {
    std::env::current_dir().unwrap_or_default()
}
