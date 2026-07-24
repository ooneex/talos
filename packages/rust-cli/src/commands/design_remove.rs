use clap::Args;

use crate::utils::{
    ask_confirm, ask_input, current_dir, remove_from_app_module, remove_from_shared_module,
    remove_path_alias, to_kebab_case, to_pascal_case,
};

#[derive(Args, Debug)]
pub struct DesignRemoveArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,
}

pub fn run(args: &DesignRemoveArgs) {
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter design name to remove") {
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
            crate::utils::error(format!("Design module \"{kebab_name}\" does not exist"));
        }
        return;
    }

    let yml_path = module_dir.join(format!("{kebab_name}.yml"));
    let is_design_module = yml_path.exists()
        && std::fs::read_to_string(&yml_path)
            .map(|content| content.contains("type: \"design\""))
            .unwrap_or(false);
    if !is_design_module {
        if !silent {
            crate::utils::error(format!("Module \"{kebab_name}\" is not a design module"));
        }
        return;
    }

    if !silent
        && !ask_confirm(
            &format!("Are you sure you want to remove the \"{kebab_name}\" design module?"),
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

    let app_tsconfig_path = cwd.join("tsconfig.json");
    let _ = remove_path_alias(&app_tsconfig_path, &kebab_name);

    let _ = std::fs::remove_dir_all(&module_dir);

    if !silent {
        crate::utils::success(format!("modules/{kebab_name} removed successfully"));
    }
}
