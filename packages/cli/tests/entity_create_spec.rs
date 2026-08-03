use clap::Parser;
use cli::commands::entity_create::{EntityCreateArgs, run};
use std::sync::Mutex;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: EntityCreateArgs,
}

static ENV_GUARD: Mutex<()> = Mutex::new(());

#[test]
fn entity_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--name",
        "User",
        "--module",
        "user",
        "--table-name",
        "users",
        "--no-cache",
        "--override",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("User"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert_eq!(cli.args.table_name.as_deref(), Some("users"));
    assert!(cli.args.no_cache);
    assert!(cli.args.r#override);
}

#[test]
fn entity_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(cli.args.table_name.is_none());
    assert!(!cli.args.no_cache);
    assert!(!cli.args.r#override);
}

#[test]
fn entity_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn entity_create_scaffolds_the_entity_files_with_the_table_name() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let root = tempfile::tempdir().expect("tempdir");
    let templates = tempfile::tempdir().expect("tempdir");
    std::fs::write(
        templates.path().join("entity.txt"),
        "export class {{NAME}}Entity { table = '{{TABLE_NAME}}'; }\n",
    )
    .expect("template");
    std::fs::write(
        templates.path().join("entity.test.txt"),
        "// {{NAME}} in {{MODULE}}\n",
    )
    .expect("template");
    let previous_dir = std::env::current_dir().expect("cwd");
    let previous_templates = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    std::env::set_current_dir(root.path()).expect("cd");
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
    }

    run(&EntityCreateArgs {
        no_cache: false,
        name: Some("Invoice".to_string()),
        module: Some("shared".to_string()),
        table_name: Some("invoice_rows".to_string()),
        r#override: false,
    });

    std::env::set_current_dir(previous_dir).expect("restore");
    match previous_templates {
        Some(value) => unsafe { std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, value) },
        None => unsafe { std::env::remove_var(cli::utils::TEMPLATES_DIR_ENV) },
    }

    let source = std::fs::read_to_string(
        root.path()
            .join("modules/shared/src/entities/InvoiceEntity.ts"),
    )
    .expect("entity");
    assert!(source.contains("invoice_rows"), "{source}");
    assert!(
        root.path()
            .join("modules/shared/tests/entities/InvoiceEntity.spec.ts")
            .is_file()
    );
}

#[test]
fn entity_create_returns_when_templates_cannot_be_resolved_or_loaded() {
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
    run(&EntityCreateArgs {
        no_cache: false,
        name: Some("Invoice".to_string()),
        module: Some("shared".to_string()),
        table_name: None,
        r#override: false,
    });

    let templates = tempfile::tempdir().expect("tempdir");
    std::fs::write(templates.path().join("entity.txt"), "entity").expect("template");
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
    }
    run(&EntityCreateArgs {
        no_cache: false,
        name: Some("Invoice".to_string()),
        module: Some("shared".to_string()),
        table_name: None,
        r#override: false,
    });

    std::fs::write(templates.path().join("entity.test.txt"), "spec").expect("template");
    std::fs::remove_file(templates.path().join("entity.txt")).expect("remove");
    run(&EntityCreateArgs {
        no_cache: false,
        name: Some("Invoice".to_string()),
        module: Some("shared".to_string()),
        table_name: None,
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
