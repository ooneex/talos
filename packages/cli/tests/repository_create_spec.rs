use clap::Parser;
use cli::commands::repository_create::{RepositoryCreateArgs, run};
use std::sync::Mutex;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: RepositoryCreateArgs,
}

static ENV_GUARD: Mutex<()> = Mutex::new(());

#[test]
fn repository_create_parses_all_flags() {
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
fn repository_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(!cli.args.no_cache);
    assert!(!cli.args.r#override);
}

#[test]
fn repository_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn repository_create_scaffolds_the_repository_files() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let root = tempfile::tempdir().expect("tempdir");
    let templates = tempfile::tempdir().expect("tempdir");
    std::fs::write(
        templates.path().join("repository.txt"),
        "export class {{NAME}}Repository {}\n",
    )
    .expect("template");
    std::fs::write(
        templates.path().join("repository.test.txt"),
        "// {{NAME}} in {{MODULE}}\n",
    )
    .expect("template");
    let previous_dir = std::env::current_dir().expect("cwd");
    let previous_templates = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    std::env::set_current_dir(root.path()).expect("cd");
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
    }

    run(&RepositoryCreateArgs {
        no_cache: false,
        name: Some("Audit".to_string()),
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
            .join("modules/shared/src/repositories/AuditRepository.ts")
            .is_file()
    );
    assert!(
        root.path()
            .join("modules/shared/tests/repositories/AuditRepository.spec.ts")
            .is_file()
    );
}

#[test]
fn repository_create_returns_when_templates_cannot_be_resolved_or_loaded() {
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
    run(&RepositoryCreateArgs {
        no_cache: false,
        name: Some("Audit".to_string()),
        module: Some("shared".to_string()),
        r#override: false,
    });

    let templates = tempfile::tempdir().expect("tempdir");
    std::fs::write(templates.path().join("repository.txt"), "repository").expect("template");
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
    }
    run(&RepositoryCreateArgs {
        no_cache: false,
        name: Some("Audit".to_string()),
        module: Some("shared".to_string()),
        r#override: false,
    });

    std::fs::write(templates.path().join("repository.test.txt"), "spec").expect("template");
    std::fs::remove_file(templates.path().join("repository.txt")).expect("remove");
    run(&RepositoryCreateArgs {
        no_cache: false,
        name: Some("Audit".to_string()),
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
