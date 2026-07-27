use std::path::PathBuf;

use clap::Args;

use crate::utils::{
    add_path_alias, add_to_app_module, add_to_microservice_module, add_to_shared_module,
    ask_destination_module, ask_input, current_dir, read_template, skeleton_templates_dir,
    to_kebab_case, to_pascal_case,
};

#[derive(Args, Debug)]
pub struct ModuleCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub destination: Option<String>,

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

pub struct ModuleCreateOptions {
    pub name: String,
    pub destination: Option<String>,
    pub cwd: PathBuf,
    pub silent: bool,
    pub no_cache: bool,
}

pub fn run(args: &ModuleCreateArgs) {
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter module name") {
            Some(name) => name,
            None => return,
        },
    };
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);

    execute(ModuleCreateOptions {
        name,
        destination: args.destination.clone(),
        cwd,
        silent: args.silent,
        no_cache: args.no_cache,
    });
}

pub fn execute(options: ModuleCreateOptions) {
    let ModuleCreateOptions {
        name,
        destination,
        cwd,
        silent,
        no_cache,
    } = options;

    let destination = destination.unwrap_or_else(|| {
        if silent {
            "app".to_string()
        } else {
            ask_destination_module(&cwd, "Select destination module")
        }
    });
    let destination_kebab = to_kebab_case(&destination);

    let pascal_name = to_pascal_case(&name)
        .strip_suffix("Module")
        .map(str::to_string)
        .unwrap_or_else(|| to_pascal_case(&name));
    let kebab_name = to_kebab_case(&pascal_name);

    let module_dir = cwd.join("modules").join(&kebab_name);
    let src_dir = module_dir.join("src");
    let tests_dir = module_dir.join("tests");

    let Some(templates_dir) = skeleton_templates_dir(silent, !no_cache) else {
        return;
    };
    let Some(module_template) = read_template(&templates_dir, "module/module.txt") else {
        return;
    };
    let Some(package_template) = read_template(&templates_dir, "module/package.txt") else {
        return;
    };
    let Some(tsconfig_template) = read_template(&templates_dir, "module/tsconfig.txt") else {
        return;
    };
    let Some(yml_template) = read_template(&templates_dir, "module/yml.txt") else {
        return;
    };
    let Some(test_template) = read_template(&templates_dir, "module/test.txt") else {
        return;
    };

    let module_content = module_template.replace("{{NAME}}", &pascal_name);
    let package_content = package_template.replace("{{NAME}}", &kebab_name);
    let test_content = test_template
        .replace("{{NAME}}", &pascal_name)
        .replace("{{name}}", &kebab_name);
    let yml_content = yml_template.replace("{{name}}", &kebab_name);

    let writes: [(PathBuf, &str); 5] = [
        (
            src_dir.join(format!("{pascal_name}Module.ts")),
            module_content.as_str(),
        ),
        (module_dir.join("package.json"), package_content.as_str()),
        (module_dir.join("tsconfig.json"), tsconfig_template.as_str()),
        (
            module_dir.join(format!("{kebab_name}.yml")),
            yml_content.as_str(),
        ),
        (
            tests_dir.join(format!("{pascal_name}Module.spec.ts")),
            test_content.as_str(),
        ),
    ];
    for (path, content) in writes {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Err(error) = std::fs::write(&path, content) {
            crate::utils::error(format!("Failed to write {}: {error}", path.display()));
            return;
        }
    }

    if kebab_name != destination_kebab {
        if destination_kebab == "app" {
            let app_module_path = cwd
                .join("modules")
                .join("app")
                .join("src")
                .join("AppModule.ts");
            if app_module_path.exists() {
                let _ = add_to_app_module(&app_module_path, &pascal_name, &kebab_name);
            }

            if kebab_name != "shared" {
                let shared_module_path = cwd
                    .join("modules")
                    .join("shared")
                    .join("src")
                    .join("SharedModule.ts");
                if shared_module_path.exists() {
                    let _ = add_to_shared_module(&shared_module_path, &pascal_name, &kebab_name);
                }
            }
        } else {
            let destination_pascal = to_pascal_case(&destination_kebab);
            let destination_module_path = cwd
                .join("modules")
                .join(&destination_kebab)
                .join("src")
                .join(format!("{destination_pascal}Module.ts"));
            if destination_module_path.exists() {
                let _ =
                    add_to_microservice_module(&destination_module_path, &pascal_name, &kebab_name);
            }
        }
    }

    let app_tsconfig_path = cwd.join("tsconfig.json");
    if app_tsconfig_path.exists() {
        let _ = add_path_alias(&app_tsconfig_path, &kebab_name);
    }

    if !silent {
        crate::utils::success(format!("modules/{kebab_name} created successfully"));
    }
}
