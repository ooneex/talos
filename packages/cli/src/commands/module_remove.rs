use clap::Args;
use regex::Regex;

use crate::utils::{
    ask_confirm, ask_input, current_dir, remove_from_app_module, remove_from_shared_module,
    remove_path_alias, to_kebab_case, to_pascal_case,
};

#[derive(Args, Debug)]
pub struct ModuleRemoveArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,
}

fn read_module_type(module_dir: &std::path::Path, kebab_name: &str) -> Option<String> {
    let yml_path = module_dir.join(format!("{kebab_name}.yml"));
    let content = std::fs::read_to_string(yml_path).ok()?;
    let re = Regex::new(r#"(?m)^type:\s*"?([a-z]+)"?"#).ok()?;
    re.captures(&content)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
}

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
            crate::utils::error(format!("Cannot remove the \"{kebab_name}\" module"));
        }
        return;
    }

    let module_dir = cwd.join("modules").join(&kebab_name);
    if !module_dir.join("package.json").exists() {
        if !silent {
            crate::utils::error(format!("Module \"{kebab_name}\" does not exist"));
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
        crate::utils::success(format!("modules/{kebab_name} removed successfully"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_module_type_reads_the_declared_type() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(
            dir.path().join("billing.yml"),
            "name: \"billing\"\ntype: \"microservice\"\n",
        )
        .expect("write");

        assert_eq!(
            read_module_type(dir.path(), "billing").as_deref(),
            Some("microservice")
        );
    }

    #[test]
    fn remove_from_app_yml_removes_the_module_block_and_extra_blank_lines() {
        let dir = tempfile::tempdir().expect("tempdir");
        let app_yml = dir.path().join("app.yml");
        std::fs::write(
            &app_yml,
            "modules:\n  - name: \"billing\"\n    source: \"modules/billing\"\n\n  - name: \"kept\"\n",
        )
        .expect("write");

        remove_from_app_yml(&app_yml, "billing");

        let content = std::fs::read_to_string(app_yml).expect("read");
        assert!(!content.contains("billing"));
        assert!(content.contains("kept"));
        assert!(!content.contains("\n\n\n"));
    }

    #[test]
    fn run_removes_a_module_without_prompting_when_silent() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();
        std::fs::create_dir_all(root.join("modules/billing/src")).expect("billing dir");
        std::fs::create_dir_all(root.join("modules/app/src")).expect("app dir");
        std::fs::create_dir_all(root.join("modules/shared/src")).expect("shared dir");
        std::fs::write(
            root.join("modules/billing/package.json"),
            "{ \"name\": \"@module/billing\" }\n",
        )
        .expect("package");
        std::fs::write(
            root.join("modules/billing/billing.yml"),
            "type: \"module\"\n",
        )
        .expect("yml");
        std::fs::write(
            root.join("modules/app/src/AppModule.ts"),
            "import { BillingModule } from \"@module/billing/BillingModule\";\n\nexport const AppModule = {\n  controllers: [\n    ...BillingModule.controllers,\n  ],\n  middlewares: [],\n  cronJobs: [],\n  events: [],\n};\n",
        )
        .expect("app module");
        std::fs::write(
            root.join("modules/shared/src/SharedModule.ts"),
            "import { BillingModule } from \"@module/billing/BillingModule\";\n\nexport const SharedModule = {\n  entities: [\n    ...BillingModule.entities,\n  ],\n};\n",
        )
        .expect("shared module");
        std::fs::write(
            root.join("tsconfig.json"),
            "{ \"compilerOptions\": { \"paths\": { \"@module/billing/*\": [\"modules/billing/src/*\"] } } }\n",
        )
        .expect("tsconfig");

        run(&ModuleRemoveArgs {
            name: Some("billing".to_string()),
            cwd: Some(root.display().to_string()),
            silent: true,
        });

        assert!(!root.join("modules/billing").exists());
        assert!(
            !std::fs::read_to_string(root.join("modules/app/src/AppModule.ts"))
                .expect("app module")
                .contains("BillingModule")
        );
        assert!(
            !std::fs::read_to_string(root.join("tsconfig.json"))
                .expect("tsconfig")
                .contains("@module/billing")
        );
    }
}
