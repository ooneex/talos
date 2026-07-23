use clap::Args;
use regex::Regex;

use crate::utils::{
    ask_confirm, ask_input, current_dir, remove_from_app_module, remove_from_shared_module,
    remove_path_alias, to_kebab_case, to_pascal_case,
};

/// Rust port of `packages/cli/src/commands/MicroserviceRemoveCommand.ts`.
#[derive(Args, Debug)]
pub struct MicroserviceRemoveArgs {
    /// Microservice name to remove.
    #[arg(long)]
    pub name: Option<String>,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,

    /// Suppress prompts and success/error messages.
    #[arg(long, default_value_t = false)]
    pub silent: bool,
}

fn remove_block(path: &std::path::Path, pattern: &str) {
    let Ok(content) = std::fs::read_to_string(path) else {
        return;
    };
    let Ok(re) = Regex::new(pattern) else {
        return;
    };
    let cleaned = re.replace(&content, "").into_owned();
    let cleaned = Regex::new(r"\n{3,}")
        .ok()
        .map(|re| re.replace_all(&cleaned, "\n\n").into_owned())
        .unwrap_or(cleaned);
    let _ = std::fs::write(path, cleaned);
}

pub fn run(args: &MicroserviceRemoveArgs) {
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter microservice name to remove") {
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
            crate::utils::error(format!("Cannot remove the \"{kebab_name}\" module"));
        }
        return;
    }

    let module_dir = cwd.join("modules").join(&kebab_name);
    if !module_dir.join("package.json").exists() {
        if !silent {
            crate::utils::error(format!("Microservice \"{kebab_name}\" does not exist"));
        }
        return;
    }

    if !silent
        && !ask_confirm(
            &format!("Are you sure you want to remove the \"{kebab_name}\" microservice?"),
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

    let esc = regex::escape(&kebab_name);
    remove_block(
        &cwd.join("modules").join("app").join("app.yml"),
        &format!(
            r#"(?m)(?:^[ \t]*# {esc} microservice[^\n]*\n)?^  - name: \"{esc}\"\n(?:^ {{4,}}[^\n]*\n)*"#
        ),
    );
    remove_block(
        &cwd.join(".env.yml"),
        &format!(r"(?m)^  {esc}:\n(?:^ {{4,}}[^\n]*\n)*"),
    );
    remove_block(
        &cwd.join("modules").join("app").join("docker-compose.yml"),
        &format!(r#"(?m)(?:^[ \t]*# {esc} microservice[^\n]*\n)?^  {esc}:\n(?:^ {{4,}}[^\n]*\n)*"#),
    );

    let app_tsconfig_path = cwd.join("tsconfig.json");
    let _ = remove_path_alias(&app_tsconfig_path, &kebab_name);
    let _ = std::fs::remove_dir_all(&module_dir);

    if !silent {
        crate::utils::success(format!("modules/{kebab_name} removed successfully"));
    }
}
