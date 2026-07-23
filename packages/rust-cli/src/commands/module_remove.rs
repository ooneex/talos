use clap::Args;
use regex::Regex;

use crate::utils::{
    ask_confirm, ask_input, current_dir, remove_from_app_module, remove_from_shared_module,
    remove_path_alias, to_kebab_case, to_pascal_case,
};

/// Rust port of `packages/cli/src/commands/ModuleRemoveCommand.ts`.
#[derive(Args, Debug)]
pub struct ModuleRemoveArgs {
    /// Module name to remove.
    #[arg(long)]
    pub name: Option<String>,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,

    /// Suppress prompts and success/error messages.
    #[arg(long, default_value_t = false)]
    pub silent: bool,
}

/// Reads the `type:` field declared in the module's `<name>.yml` config, or
/// `None` when the file is missing or the field isn't present.
fn read_module_type(module_dir: &std::path::Path, kebab_name: &str) -> Option<String> {
    let yml_path = module_dir.join(format!("{kebab_name}.yml"));
    let content = std::fs::read_to_string(yml_path).ok()?;
    let re = Regex::new(r#"(?m)^type:\s*"?([a-z]+)"?"#).ok()?;
    re.captures(&content)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
}

/// Removes the microservice's comment line and list item from `app.yml`.
fn remove_from_app_yml(app_yml_path: &std::path::Path, kebab_name: &str) {
    let Ok(mut content) = std::fs::read_to_string(app_yml_path) else {
        return;
    };
    let esc = regex::escape(kebab_name);

    if let Ok(re) = Regex::new(&format!(
        r#"(?m)(?:^[ \t]*# {esc} microservice[^\n]*\n)?^  - name: "{esc}"\n(?:^ {{4,}}[^\n]*\n)*"#
    )) {
        content = re.replace(&content, "").into_owned();
    }
    if let Ok(re) = Regex::new(r"\n{3,}") {
        content = re.replace_all(&content, "\n\n").into_owned();
    }

    let _ = std::fs::write(app_yml_path, content);
}

pub fn run(args: &ModuleRemoveArgs) {
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter module name to remove") {
            Some(name) => name,
            None => return,
        },
    };
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let silent = args.silent;

    let pascal_name = to_pascal_case(&name)
        .strip_suffix("Module")
        .map(str::to_string)
        .unwrap_or_else(|| to_pascal_case(&name));
    let kebab_name = to_kebab_case(&pascal_name);

    if kebab_name == "app" || kebab_name == "shared" {
        if !silent {
            eprintln!("✖ Cannot remove the \"{kebab_name}\" module");
        }
        return;
    }

    let module_dir = cwd.join("modules").join(&kebab_name);
    if !module_dir.join("package.json").exists() {
        if !silent {
            eprintln!("✖ Module \"{kebab_name}\" does not exist");
        }
        return;
    }

    if !silent
        && !ask_confirm(
            &format!("Are you sure you want to remove the \"{kebab_name}\" module?"),
            false,
        )
    {
        return;
    }

    let app_module_path = cwd
        .join("modules")
        .join("app")
        .join("src")
        .join("AppModule.ts");
    let _ = remove_from_app_module(&app_module_path, &pascal_name, &kebab_name);

    let shared_module_path = cwd
        .join("modules")
        .join("shared")
        .join("src")
        .join("SharedModule.ts");
    let _ = remove_from_shared_module(&shared_module_path, &pascal_name, &kebab_name);

    if read_module_type(&module_dir, &kebab_name).as_deref() == Some("microservice") {
        let app_yml_path = cwd.join("modules").join("app").join("app.yml");
        remove_from_app_yml(&app_yml_path, &kebab_name);
    }

    let app_tsconfig_path = cwd.join("tsconfig.json");
    let _ = remove_path_alias(&app_tsconfig_path, &kebab_name);

    let _ = std::fs::remove_dir_all(&module_dir);

    if !silent {
        println!("✔ modules/{kebab_name} removed successfully");
    }
}
