use std::process::Command;

use clap::Args;
use serde_json::Value;

use crate::utils::{
    ask_confirm, ask_input, current_dir, ensure_module, run_step, to_kebab_case, to_pascal_case,
    to_snake_case,
};

const TRANSLATION_TEMPLATE: &str = include_str!("../templates/translation.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/translation.test.txt");
const YAML_DICT_TEMPLATE: &str = include_str!("../templates/translation.yml.txt");
const JSON_DICT_TEMPLATE: &str = include_str!("../templates/translation.json.txt");
const USE_TRANSLATE_TEMPLATE: &str = include_str!("../templates/spa/spa.use-translate.txt");
const USE_LANG_TEMPLATE: &str = include_str!("../templates/spa/spa.use-lang.txt");

/// Rust port of `packages/cli/src/commands/TranslationCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct TranslationCreateArgs {
    /// Translation name.
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

fn ensure_dependency(cwd: &std::path::Path, dependency: &str) {
    let package_json_path = cwd.join("package.json");
    let present = std::fs::read_to_string(&package_json_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .map(|package_json| {
            ["dependencies", "devDependencies"].iter().any(|key| {
                package_json
                    .get(key)
                    .and_then(Value::as_object)
                    .and_then(|deps| deps.get(dependency))
                    .is_some()
            })
        })
        .unwrap_or(false);
    if present {
        return;
    }
    let _ = run_step(
        false,
        &format!("Installing {dependency}..."),
        Command::new("bun")
            .args(["add", dependency])
            .current_dir(cwd),
    );
}

fn read_module_type(cwd: &std::path::Path, module_kebab: &str) -> String {
    let yml_path = cwd
        .join("modules")
        .join(module_kebab)
        .join(format!("{module_kebab}.yml"));
    std::fs::read_to_string(yml_path)
        .ok()
        .and_then(|content| {
            let prefix = "type: \"";
            content.lines().find_map(|line| {
                line.trim()
                    .strip_prefix(prefix)
                    .and_then(|value| value.strip_suffix('"'))
                    .map(str::to_string)
            })
        })
        .unwrap_or_else(|| "module".to_string())
}

fn scaffold_spa_translation(
    cwd: &std::path::Path,
    module_kebab: &str,
    args: &TranslationCreateArgs,
) {
    let mut name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter translation name") {
            Some(name) => name,
            None => return,
        },
    };
    name = to_pascal_case(&name)
        .strip_suffix("Translation")
        .map(str::to_string)
        .unwrap_or_else(|| to_pascal_case(&name));

    ensure_module(module_kebab, cwd);

    let feature_kebab = to_kebab_case(&name);
    let translations_dir = cwd
        .join("modules")
        .join(module_kebab)
        .join("src")
        .join("features")
        .join(&feature_kebab)
        .join("translations");
    let hook_path = translations_dir.join(format!("use{name}Translate.ts"));

    if !args.r#override
        && hook_path.exists()
        && !ask_confirm(
            &format!("Hook \"use{name}Translate\" already exists. Override it?"),
            false,
        )
    {
        return;
    }

    let _ = std::fs::create_dir_all(&translations_dir);
    let _ = std::fs::write(
        &hook_path,
        USE_TRANSLATE_TEMPLATE.replace("{{NAME}}", &name),
    );
    crate::utils::success(format!("{} created successfully", hook_path.display()));

    let dict_path = translations_dir.join("translations.json");
    if !dict_path.exists() {
        let _ = std::fs::write(&dict_path, JSON_DICT_TEMPLATE);
        crate::utils::success(format!("{} created successfully", dict_path.display()));
    }

    let use_lang_path = cwd
        .join("modules")
        .join(module_kebab)
        .join("src")
        .join("shared")
        .join("hooks")
        .join("useLang.ts");
    if !use_lang_path.exists() {
        if let Some(parent) = use_lang_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&use_lang_path, USE_LANG_TEMPLATE);
        crate::utils::success(format!("{} created successfully", use_lang_path.display()));
    }

    ensure_dependency(cwd, "@talosjs/utils");
    ensure_dependency(cwd, "zustand");
}

pub fn run(args: &TranslationCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let module_kebab = to_kebab_case(
        to_pascal_case(args.module.as_deref().unwrap_or("shared"))
            .strip_suffix("Module")
            .unwrap_or(&to_pascal_case(args.module.as_deref().unwrap_or("shared"))),
    );

    if read_module_type(&cwd, &module_kebab) == "spa" {
        scaffold_spa_translation(&cwd, &module_kebab, args);
        return;
    }

    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter translation name") {
            Some(name) => name,
            None => return,
        },
    };
    let mut name = to_pascal_case(&name);
    if let Some(stripped) = name.strip_suffix("Translation") {
        name = stripped.to_string();
    }

    ensure_module(&module_kebab, &cwd);

    let base = cwd.join("modules").join(&module_kebab);
    let translations_dir = base.join("src").join("translations");
    let file_path = translations_dir.join(format!("{name}Translation.ts"));
    if !args.r#override
        && file_path.exists()
        && !ask_confirm(
            &format!("Translation \"{name}Translation\" already exists. Override it?"),
            false,
        )
    {
        return;
    }

    let _ = std::fs::create_dir_all(&translations_dir);
    let content = TRANSLATION_TEMPLATE
        .replace("{{NAME}}", &name)
        .replace("{{SNAKE}}", &to_snake_case(&name));
    let _ = std::fs::write(&file_path, content);

    let tests_dir = base.join("tests").join("translations");
    let _ = std::fs::create_dir_all(&tests_dir);
    let test_path = tests_dir.join(format!("{name}Translation.spec.ts"));
    let _ = std::fs::write(
        &test_path,
        TEST_TEMPLATE
            .replace("{{NAME}}", &name)
            .replace("{{MODULE}}", &module_kebab),
    );

    let dict_path = base.join("src").join("translations.yml");
    if !dict_path.exists() {
        let _ = std::fs::write(&dict_path, YAML_DICT_TEMPLATE);
    }

    crate::utils::success(format!("{} created successfully", file_path.display()));
    crate::utils::success(format!("{} created successfully", test_path.display()));
    if dict_path.exists() {
        crate::utils::success(format!("{} created successfully", dict_path.display()));
    }

    ensure_dependency(&cwd, "@talosjs/translation");
}
