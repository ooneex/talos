//! Generic resource scaffolding, mirroring `packages/cli/src/scaffold.ts`'s
//! `scaffoldResource`. Shared by every `*:create` command that generates a
//! single class + spec file into a module (service, cache, logger, ...).

use std::fs;
use std::path::PathBuf;
use std::process::Command;

use regex::Regex;

use super::case::to_pascal_case;
use super::process::run_step;
use super::prompts::{ask_confirm, ask_input};

/// Static configuration for one resource kind (e.g. "Service"), mirroring
/// `ScaffoldConfigType`.
#[derive(Default)]
pub struct ScaffoldConfig {
    /// Human-readable resource label used in messages (e.g. "Cache").
    pub label: &'static str,
    /// Prompt shown when no name option is provided.
    pub prompt_message: &'static str,
    /// Class and file name suffix appended to the normalized name (e.g. "Cache").
    pub suffix: &'static str,
    /// Source file template (`{{NAME}}` is replaced with the normalized name).
    pub template: &'static str,
    /// Test file template (`{{NAME}}` and `{{MODULE}}` are replaced).
    pub test_template: &'static str,
    /// Subdirectory under the module's `src/` (e.g. "cache").
    pub dir: &'static str,
    /// Subdirectory under the module's `tests/`; defaults to `dir` when `None`.
    pub tests_dir: Option<&'static str>,
    /// Suffixes stripped from the user-provided name; defaults to `[suffix]` when empty.
    pub strip_suffixes: &'static [&'static str],
    /// Module class array to register the generated class into (e.g. "cronJobs").
    pub module_field: Option<&'static str>,
    /// Runtime package installed with `bun add` when missing (e.g. "@talosjs/cache").
    pub dependency: Option<&'static str>,
    /// Extra `{{KEY}}` replacements applied to the source template, computed
    /// from the normalized name (mirrors `ScaffoldConfigType.templateData`).
    pub template_data: Option<TemplateDataFn>,
}

/// Computes extra `{{KEY}}` template replacements from the normalized resource name.
pub type TemplateDataFn = Box<dyn Fn(&str) -> Vec<(&'static str, String)>>;

/// Runtime options for [`scaffold_resource`], mirroring `ScaffoldOptionsType`.
pub struct ScaffoldOptions {
    pub name: Option<String>,
    pub module: Option<String>,
    pub r#override: bool,
}

/// Mirrors `ensureModule`: creates the destination module (silently) if it
/// doesn't already have a `package.json`.
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

/// Mirrors `addClassToModule`: inserts an import and pushes `class_name` into
/// the `field: [...]` array literal of the module file at `module_path`.
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

/// Mirrors `installDependency`: runs `bun add <dependency>` when the current
/// module's `package.json` doesn't already list it as a dependency.
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

    run_step(
        false,
        &format!("Installing {dependency}..."),
        Command::new("bun")
            .args(["add", dependency])
            .current_dir(cwd),
    );
}

/// Mirrors `scaffoldResource`: prompts for a name if missing, normalizes it,
/// ensures the destination module exists, writes the resource + spec files,
/// registers the class into the module (when `module_field` is set), and
/// installs the runtime dependency (when set).
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

/// Helper so callers don't need to build [`PathBuf`] boilerplate for `cwd`.
pub fn current_dir() -> PathBuf {
    std::env::current_dir().unwrap_or_default()
}
