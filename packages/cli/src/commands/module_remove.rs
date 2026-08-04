use clap::Args;

use crate::utils::{
    ask_input, declared_module_type, remove_from_app_yml, remove_standard_module_references,
    resolve_cwd, resolve_module_identity,
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
    declared_module_type(module_dir, kebab_name)
}

pub fn run(args: &ModuleRemoveArgs) {
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter module name to remove") {
            Some(name) => name,
            None => return,
        },
    };
    let cwd = resolve_cwd(args.cwd.as_deref());
    let silent = args.silent;
    let identity = resolve_module_identity(&cwd, &name);

    if !crate::utils::ensure_removable(&identity, "Module", silent)
        || !crate::utils::confirm_removal(&identity.kebab_name, "module", silent)
    {
        return;
    }

    remove_standard_module_references(&cwd, &identity.pascal_name, &identity.kebab_name);

    if read_module_type(&identity.module_dir, &identity.kebab_name).as_deref()
        == Some("microservice")
    {
        let app_yml_path = cwd.join("modules").join("app").join("app.yml");
        remove_from_app_yml(&app_yml_path, &identity.kebab_name);
    }

    let _ = std::fs::remove_dir_all(&identity.module_dir);

    if !silent {
        crate::utils::success(format!(
            "modules/{} removed successfully",
            identity.kebab_name
        ));
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
