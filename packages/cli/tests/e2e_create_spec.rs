use clap::Parser;
use cli::commands::e2e_create::{E2eCreateArgs, run};
use std::sync::Mutex;

static ENV_GUARD: Mutex<()> = Mutex::new(());

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: E2eCreateArgs,
}

#[test]
fn e2e_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--name",
        "MyE2e",
        "--module",
        "user",
        "--override",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyE2e"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert!(cli.args.r#override);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn e2e_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(!cli.args.r#override);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn e2e_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[cfg(unix)]
fn write_executable(path: &std::path::Path, content: &str) {
    use std::os::unix::fs::PermissionsExt;

    std::fs::write(path, content).expect("script should be writable");
    let mut permissions = std::fs::metadata(path).expect("metadata").permissions();
    permissions.set_mode(0o755);
    std::fs::set_permissions(path, permissions).expect("permissions");
}

#[cfg(unix)]
#[test]
fn e2e_create_writes_the_spec_updates_scripts_and_uses_bunx() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let root = tempfile::tempdir().expect("tempdir");
    let templates = tempfile::tempdir().expect("tempdir");
    let bin = root.path().join("bin");
    std::fs::create_dir_all(&bin).expect("bin");
    write_executable(
        &bin.join("bunx"),
        "#!/bin/sh\nif [ \"$1\" = \"playwright\" ] && [ \"$2\" = \"install\" ]; then exit 0; fi\nexit 1\n",
    );
    std::fs::write(
        templates.path().join("e2e.spec.txt"),
        "test('e2e', () => {});\n",
    )
    .expect("template");
    std::fs::write(
        templates.path().join("playwright.config.txt"),
        "export default {};\n",
    )
    .expect("template");
    std::fs::create_dir_all(root.path().join("modules/shared")).expect("module");
    std::fs::write(
        root.path().join("modules/shared/package.json"),
        "{ \"name\": \"@module/shared\" }\n",
    )
    .expect("package");
    std::fs::write(
        root.path().join("package.json"),
        "{ \"devDependencies\": { \"@playwright/test\": \"1.0.0\" } }\n",
    )
    .expect("root package");
    let previous_templates = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    let previous_path = std::env::var_os("PATH");
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
        std::env::set_var(
            "PATH",
            previous_path
                .as_ref()
                .map(|value| format!("{}:{}", bin.display(), value.to_string_lossy()))
                .unwrap_or_else(|| bin.display().to_string()),
        );
    }

    run(&E2eCreateArgs {
        no_cache: false,
        name: Some("SmokeSpec".to_string()),
        module: Some("shared".to_string()),
        r#override: true,
        cwd: Some(root.path().display().to_string()),
    });

    unsafe {
        match previous_templates {
            Some(value) => std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, value),
            None => std::env::remove_var(cli::utils::TEMPLATES_DIR_ENV),
        }
        match previous_path {
            Some(value) => std::env::set_var("PATH", value),
            None => std::env::remove_var("PATH"),
        }
    }

    assert!(
        root.path()
            .join("modules/shared/e2e/Smoke.spec.ts")
            .is_file()
    );
    assert!(
        root.path()
            .join("modules/shared/playwright.config.ts")
            .is_file()
    );
    let package_json =
        std::fs::read_to_string(root.path().join("modules/shared/package.json")).expect("package");
    assert!(package_json.contains("\"e2e\": \"bunx playwright test\""));
}

#[cfg(unix)]
#[test]
fn e2e_create_strips_suffixes_and_preserves_existing_config_and_script() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let root = tempfile::tempdir().expect("tempdir");
    let templates = tempfile::tempdir().expect("tempdir");
    let bin = root.path().join("bin");
    std::fs::create_dir_all(&bin).expect("bin");
    write_executable(&bin.join("bunx"), "#!/bin/sh\nexit 0\n");
    std::fs::write(
        templates.path().join("e2e.spec.txt"),
        "test('e2e', () => {});\n",
    )
    .expect("template");
    std::fs::write(
        templates.path().join("playwright.config.txt"),
        "export default {};\n",
    )
    .expect("template");
    std::fs::create_dir_all(root.path().join("modules/shared/e2e")).expect("module");
    std::fs::write(
        root.path().join("modules/shared/playwright.config.ts"),
        "existing config\n",
    )
    .expect("config");
    std::fs::write(
        root.path().join("modules/shared/package.json"),
        "{ \"scripts\": { \"e2e\": \"existing\" } }\n",
    )
    .expect("package");
    std::fs::write(
        root.path().join("package.json"),
        "{ \"devDependencies\": { \"@playwright/test\": \"1.0.0\" } }\n",
    )
    .expect("root package");
    let previous_templates = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    let previous_path = std::env::var_os("PATH");
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
        std::env::set_var(
            "PATH",
            previous_path
                .as_ref()
                .map(|value| format!("{}:{}", bin.display(), value.to_string_lossy()))
                .unwrap_or_else(|| bin.display().to_string()),
        );
    }

    run(&E2eCreateArgs {
        no_cache: false,
        name: Some("SmokeE2eSpec".to_string()),
        module: None,
        r#override: true,
        cwd: Some(root.path().display().to_string()),
    });

    unsafe {
        match previous_templates {
            Some(value) => std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, value),
            None => std::env::remove_var(cli::utils::TEMPLATES_DIR_ENV),
        }
        match previous_path {
            Some(value) => std::env::set_var("PATH", value),
            None => std::env::remove_var("PATH"),
        }
    }

    assert!(
        root.path()
            .join("modules/shared/e2e/SmokeE2E.spec.ts")
            .is_file()
    );
    assert_eq!(
        std::fs::read_to_string(root.path().join("modules/shared/playwright.config.ts"))
            .expect("config"),
        "existing config\n"
    );
    assert!(
        std::fs::read_to_string(root.path().join("modules/shared/package.json"))
            .expect("package")
            .contains("\"e2e\": \"existing\"")
    );
}
