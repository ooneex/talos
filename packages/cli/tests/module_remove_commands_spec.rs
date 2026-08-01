//! Runs the five `*:remove` commands over a scratch workspace.
//!
//! They share one shape: refuse the two modules the app cannot live without,
//! refuse a module of the wrong type, and otherwise unwire the module from the
//! app module, the shared module and the root tsconfig before deleting it.
//! `--silent` stands in for the confirmation a user would answer.

use std::fs;
use std::path::{Path, PathBuf};

use cli::commands::{
    admin_remove::{self, AdminRemoveArgs},
    design_remove::{self, DesignRemoveArgs},
    microservice_remove::{self, MicroserviceRemoveArgs},
    module_remove::{self, ModuleRemoveArgs},
    spa_remove::{self, SpaRemoveArgs},
    storybook_remove::{self, StorybookRemoveArgs},
};

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("a parent")).expect("create parent");
    fs::write(path, content).expect("write file");
}

/// A workspace holding one module of every removable type, each wired into the
/// app module, the shared module and the root tsconfig.
fn workspace() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().to_path_buf();

    let members = [
        ("brand", "design", "Brand"),
        ("web", "spa", "Web"),
        ("back-office", "admin", "BackOffice"),
        ("gallery", "storybook", "Gallery"),
        ("billing", "microservice", "Billing"),
        ("user", "module", "User"),
    ];

    for (name, kind, _) in members {
        let module = root.join("modules").join(name);
        write(
            &module.join(format!("{name}.yml")),
            &format!("type: \"{kind}\"\n"),
        );
        write(
            &module.join("package.json"),
            &format!("{{ \"name\": \"@module/{name}\" }}\n"),
        );
        write(&module.join("src/index.ts"), "export {};\n");
    }

    let imports: String = members
        .iter()
        .map(|(name, _, pascal)| {
            format!("import {{ {pascal}Module }} from \"@module/{name}/{pascal}Module\";\n")
        })
        .collect();
    let spreads = |field: &str| -> String {
        members
            .iter()
            .map(|(_, _, pascal)| format!("...{pascal}Module.{field}"))
            .collect::<Vec<_>>()
            .join(", ")
    };

    write(
        &root.join("modules/app/src/AppModule.ts"),
        &format!(
            "{imports}\nexport const AppModule = {{\n  controllers: [{}],\n  middlewares: [{}],\n  cronJobs: [{}],\n  events: [{}],\n}};\n",
            spreads("controllers"),
            spreads("middlewares"),
            spreads("cronJobs"),
            spreads("events"),
        ),
    );
    write(
        &root.join("modules/shared/src/SharedModule.ts"),
        &format!(
            "{imports}\nexport const SharedModule = {{\n  entities: [{}],\n}};\n",
            spreads("entities"),
        ),
    );
    write(
        &root.join("modules/app/package.json"),
        "{ \"name\": \"@module/app\" }\n",
    );
    write(
        &root.join("modules/shared/package.json"),
        "{ \"name\": \"@module/shared\" }\n",
    );

    let paths: String = members
        .iter()
        .map(|(name, _, _)| format!("      \"@module/{name}/*\": [\"./modules/{name}/src/*\"]"))
        .collect::<Vec<_>>()
        .join(",\n");
    write(
        &root.join("tsconfig.json"),
        &format!("{{\n  \"compilerOptions\": {{\n    \"paths\": {{\n{paths}\n    }}\n  }}\n}}\n"),
    );

    (dir, root)
}

fn cwd(root: &Path) -> Option<String> {
    Some(root.to_string_lossy().to_string())
}

fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_else(|_| panic!("{} should exist", path.display()))
}

// ---------------------------------------------------------------------------

#[test]
fn design_remove_deletes_the_module_and_unwires_every_reference_to_it() {
    let (_dir, root) = workspace();

    design_remove::run(&DesignRemoveArgs {
        name: Some("BrandModule".to_string()),
        cwd: cwd(&root),
        silent: true,
    });

    assert!(
        !root.join("modules/brand").exists(),
        "the directory is gone"
    );
    assert!(
        !read(&root.join("modules/app/src/AppModule.ts")).contains("BrandModule"),
        "the app module no longer registers it"
    );
    assert!(
        !read(&root.join("modules/shared/src/SharedModule.ts")).contains("BrandModule"),
        "neither does the shared module"
    );
    assert!(
        !read(&root.join("tsconfig.json")).contains("@module/brand"),
        "and the path alias is dropped"
    );
}

#[test]
fn spa_admin_storybook_and_microservice_each_remove_their_own_module() {
    let (_dir, root) = workspace();

    spa_remove::run(&SpaRemoveArgs {
        name: Some("web".to_string()),
        cwd: cwd(&root),
        silent: true,
    });
    admin_remove::run(&AdminRemoveArgs {
        name: Some("back-office".to_string()),
        cwd: cwd(&root),
        silent: true,
    });
    storybook_remove::run(&StorybookRemoveArgs {
        name: Some("gallery".to_string()),
        cwd: cwd(&root),
        silent: true,
    });
    microservice_remove::run(&MicroserviceRemoveArgs {
        name: Some("billing".to_string()),
        cwd: cwd(&root),
        silent: true,
    });
    module_remove::run(&ModuleRemoveArgs {
        name: Some("user".to_string()),
        cwd: cwd(&root),
        silent: true,
    });

    for name in ["web", "back-office", "gallery", "billing", "user"] {
        assert!(!root.join("modules").join(name).exists(), "{name} is gone");
    }
    let app_module = read(&root.join("modules/app/src/AppModule.ts"));
    for pascal in ["Web", "BackOffice", "Gallery", "Billing", "User"] {
        assert!(
            !app_module.contains(&format!("{pascal}Module")),
            "{pascal}Module went with its module: {app_module}"
        );
    }
    assert!(
        app_module.contains("BrandModule"),
        "the design module was never asked for: {app_module}"
    );
}

#[test]
fn a_remover_refuses_a_module_of_the_wrong_type() {
    let (_dir, root) = workspace();

    design_remove::run(&DesignRemoveArgs {
        name: Some("web".to_string()),
        cwd: cwd(&root),
        silent: true,
    });

    assert!(
        root.join("modules/web").exists(),
        "a spa is not a design module, so it is left alone"
    );
}

#[test]
fn a_remover_refuses_a_module_that_is_not_there() {
    let (_dir, root) = workspace();

    spa_remove::run(&SpaRemoveArgs {
        name: Some("nowhere".to_string()),
        cwd: cwd(&root),
        silent: true,
    });

    assert!(
        read(&root.join("modules/app/src/AppModule.ts")).contains("WebModule"),
        "nothing else was touched"
    );
}

#[test]
fn the_app_and_shared_modules_are_refused_by_every_remover() {
    let (_dir, root) = workspace();

    for name in ["app", "shared"] {
        design_remove::run(&DesignRemoveArgs {
            name: Some(name.to_string()),
            cwd: cwd(&root),
            silent: true,
        });
        spa_remove::run(&SpaRemoveArgs {
            name: Some(name.to_string()),
            cwd: cwd(&root),
            silent: true,
        });
        admin_remove::run(&AdminRemoveArgs {
            name: Some(name.to_string()),
            cwd: cwd(&root),
            silent: true,
        });
        storybook_remove::run(&StorybookRemoveArgs {
            name: Some(name.to_string()),
            cwd: cwd(&root),
            silent: true,
        });
        microservice_remove::run(&MicroserviceRemoveArgs {
            name: Some(name.to_string()),
            cwd: cwd(&root),
            silent: true,
        });
        module_remove::run(&ModuleRemoveArgs {
            name: Some(name.to_string()),
            cwd: cwd(&root),
            silent: true,
        });

        assert!(
            root.join("modules").join(name).exists(),
            "{name} survives every remover"
        );
    }
}

#[test]
fn removing_a_microservice_also_takes_it_out_of_the_app_environment() {
    let (_dir, root) = workspace();
    write(
        &root.join("modules/app/.env.yml"),
        "microservices:\n  billing:\n    port: 3001\n  search:\n    port: 3002\n",
    );

    microservice_remove::run(&MicroserviceRemoveArgs {
        name: Some("billing".to_string()),
        cwd: cwd(&root),
        silent: true,
    });

    let env = read(&root.join("modules/app/.env.yml"));
    assert!(!env.contains("billing"), "{env}");
    assert!(env.contains("search"), "the other service stays: {env}");
}
