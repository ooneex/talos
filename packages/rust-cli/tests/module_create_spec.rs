//! Integration tests for `rust_cli::commands::module_create`, mirroring
//! `packages/cli/src/commands/ModuleCreateCommand.ts`.

use std::fs;

use rust_cli::commands::module_create::{ModuleCreateOptions, execute};

#[test]
fn execute_scaffolds_a_module_and_registers_it_into_app_module() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let cwd = tmp.path();

    // Seed a minimal `app` module with an `AppModule.ts` to register into.
    let app_src = cwd.join("modules/app/src");
    fs::create_dir_all(&app_src).expect("create app/src");
    fs::write(
        app_src.join("AppModule.ts"),
        "import { SomeExisting } from \"./SomeExisting\";\n\nexport const AppModule = {\n  controllers: [SomeExisting],\n  middlewares: [],\n  cronJobs: [],\n  events: [],\n};\n",
    )
    .expect("write AppModule.ts");

    execute(ModuleCreateOptions {
        name: "billing".to_string(),
        destination: Some("app".to_string()),
        cwd: cwd.to_path_buf(),
        silent: true,
    });

    let module_dir = cwd.join("modules/billing");
    assert!(module_dir.join("src/BillingModule.ts").exists());
    assert!(module_dir.join("package.json").exists());
    assert!(module_dir.join("tsconfig.json").exists());
    assert!(module_dir.join("billing.yml").exists());
    assert!(module_dir.join("tests/BillingModule.spec.ts").exists());

    let module_content = fs::read_to_string(module_dir.join("src/BillingModule.ts")).unwrap();
    assert!(module_content.contains("BillingModule"));

    let package_content = fs::read_to_string(module_dir.join("package.json")).unwrap();
    assert!(package_content.contains("@module/billing"));

    // AppModule.ts should now import/register BillingModule alongside the
    // pre-existing controller.
    let app_module_content = fs::read_to_string(app_src.join("AppModule.ts")).unwrap();
    assert!(
        app_module_content
            .contains("import { BillingModule } from \"@module/billing/BillingModule\";")
    );
    assert!(app_module_content.contains("...BillingModule.controllers"));
    assert!(app_module_content.contains("SomeExisting"));
}

#[test]
fn execute_skips_registration_when_module_is_its_own_destination() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let cwd = tmp.path();

    execute(ModuleCreateOptions {
        name: "app".to_string(),
        destination: Some("app".to_string()),
        cwd: cwd.to_path_buf(),
        silent: true,
    });

    assert!(cwd.join("modules/app/src/AppModule.ts").exists());
    // No self-registration should be attempted (no crash, no duplicate import).
    let content = fs::read_to_string(cwd.join("modules/app/src/AppModule.ts")).unwrap();
    assert_eq!(content.matches("import {").count(), 0);
}
