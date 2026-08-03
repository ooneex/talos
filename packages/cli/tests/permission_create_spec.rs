use clap::Parser;
use cli::commands::permission_create::{PermissionCreateArgs, run};
use std::sync::Mutex;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: PermissionCreateArgs,
}

static ENV_GUARD: Mutex<()> = Mutex::new(());

#[test]
fn permission_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--name",
        "MyResource",
        "--module",
        "user",
        "--no-cache",
        "--override",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyResource"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert!(cli.args.no_cache);
    assert!(cli.args.r#override);
}

#[test]
fn permission_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(!cli.args.no_cache);
    assert!(!cli.args.r#override);
}

#[test]
fn permission_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn permission_create_scaffolds_the_permission_files() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let root = tempfile::tempdir().expect("tempdir");
    let templates = tempfile::tempdir().expect("tempdir");
    std::fs::write(
        templates.path().join("permission.txt"),
        "export class {{NAME}}Permission {}\n",
    )
    .expect("template");
    std::fs::write(
        templates.path().join("permission.test.txt"),
        "// {{NAME}} in {{MODULE}}\n",
    )
    .expect("template");
    let previous_dir = std::env::current_dir().expect("cwd");
    let previous_templates = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    std::env::set_current_dir(root.path()).expect("cd");
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
    }

    run(&PermissionCreateArgs {
        no_cache: false,
        name: Some("User".to_string()),
        module: Some("shared".to_string()),
        r#override: false,
    });

    std::env::set_current_dir(previous_dir).expect("restore");
    match previous_templates {
        Some(value) => unsafe { std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, value) },
        None => unsafe { std::env::remove_var(cli::utils::TEMPLATES_DIR_ENV) },
    }

    assert!(
        root.path()
            .join("modules/shared/src/permissions/UserPermission.ts")
            .is_file()
    );
    assert!(
        root.path()
            .join("modules/shared/tests/permissions/UserPermission.spec.ts")
            .is_file()
    );
}

#[test]
fn permission_create_returns_when_templates_cannot_be_resolved_or_loaded() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let root = tempfile::tempdir().expect("tempdir");
    let previous_dir = std::env::current_dir().expect("cwd");
    let previous_home = std::env::var_os("HOME");
    let previous_templates = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    std::env::set_current_dir(root.path()).expect("cd");
    unsafe {
        std::env::remove_var("HOME");
        std::env::remove_var(cli::utils::TEMPLATES_DIR_ENV);
    }
    run(&PermissionCreateArgs {
        no_cache: false,
        name: Some("User".to_string()),
        module: Some("shared".to_string()),
        r#override: false,
    });

    let templates = tempfile::tempdir().expect("tempdir");
    std::fs::write(templates.path().join("permission.txt"), "permission").expect("template");
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
    }
    run(&PermissionCreateArgs {
        no_cache: false,
        name: Some("User".to_string()),
        module: Some("shared".to_string()),
        r#override: false,
    });

    std::fs::write(templates.path().join("permission.test.txt"), "spec").expect("template");
    std::fs::remove_file(templates.path().join("permission.txt")).expect("remove");
    run(&PermissionCreateArgs {
        no_cache: false,
        name: Some("User".to_string()),
        module: Some("shared".to_string()),
        r#override: false,
    });

    std::env::set_current_dir(previous_dir).expect("restore");
    match previous_home {
        Some(value) => unsafe { std::env::set_var("HOME", value) },
        None => unsafe { std::env::remove_var("HOME") },
    }
    match previous_templates {
        Some(value) => unsafe { std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, value) },
        None => unsafe { std::env::remove_var(cli::utils::TEMPLATES_DIR_ENV) },
    }
}
