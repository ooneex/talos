use clap::Parser;
use cli::commands::database_create::{DatabaseCreateArgs, run};
use std::sync::Mutex;

static ENV_GUARD: Mutex<()> = Mutex::new(());

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: DatabaseCreateArgs,
}

#[test]
fn database_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--name",
        "MyDatabase",
        "--module",
        "user",
        "--type",
        "postgres",
        "--override",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyDatabase"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert_eq!(cli.args.r#type.as_deref(), Some("postgres"));
    assert!(cli.args.r#override);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn database_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(cli.args.r#type.is_none());
    assert!(!cli.args.r#override);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn database_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn database_create_writes_database_and_test_files_from_templates() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let root = tempfile::tempdir().expect("tempdir");
    let templates = tempfile::tempdir().expect("tempdir");
    std::fs::create_dir_all(templates.path()).expect("templates");
    std::fs::write(
        templates.path().join("database.pg.txt"),
        "export class {{NAME}}Database {}\n",
    )
    .expect("template");
    std::fs::write(
        templates.path().join("database.test.txt"),
        "// {{NAME}} in {{MODULE}}\n",
    )
    .expect("template");
    std::fs::create_dir_all(root.path().join("modules/shared")).expect("module");
    std::fs::write(
        root.path().join("package.json"),
        "{ \"dependencies\": { \"@talosjs/database\": \"1.0.0\" } }\n",
    )
    .expect("package");
    let previous = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
    }

    run(&DatabaseCreateArgs {
        no_cache: false,
        name: Some("Analytics".to_string()),
        module: Some("shared".to_string()),
        r#type: Some("postgres".to_string()),
        r#override: true,
        cwd: Some(root.path().display().to_string()),
    });

    match previous {
        Some(value) => unsafe {
            std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, value);
        },
        None => unsafe {
            std::env::remove_var(cli::utils::TEMPLATES_DIR_ENV);
        },
    }

    assert!(
        root.path()
            .join("modules/shared/src/databases/AnalyticsDatabase.ts")
            .is_file()
    );
    assert!(
        root.path()
            .join("modules/shared/tests/databases/AnalyticsDatabase.spec.ts")
            .is_file()
    );
}

#[test]
fn database_create_strips_suffixes_and_uses_the_redis_template() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let root = tempfile::tempdir().expect("tempdir");
    let templates = tempfile::tempdir().expect("tempdir");
    std::fs::write(
        templates.path().join("database.redis.txt"),
        "export class {{NAME}}Database {}\n",
    )
    .expect("template");
    std::fs::write(
        templates.path().join("database.redis.test.txt"),
        "// redis {{NAME}} in {{MODULE}}\n",
    )
    .expect("template");
    std::fs::create_dir_all(root.path().join("modules/shared")).expect("module");
    std::fs::write(
        root.path().join("package.json"),
        "{ \"dependencies\": { \"@talosjs/database\": \"1.0.0\" } }\n",
    )
    .expect("package");
    let previous = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
    }

    run(&DatabaseCreateArgs {
        no_cache: false,
        name: Some("CacheDatabaseAdapter".to_string()),
        module: None,
        r#type: Some("redis".to_string()),
        r#override: true,
        cwd: Some(root.path().display().to_string()),
    });

    match previous {
        Some(value) => unsafe {
            std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, value);
        },
        None => unsafe {
            std::env::remove_var(cli::utils::TEMPLATES_DIR_ENV);
        },
    }

    assert!(
        root.path()
            .join("modules/shared/src/databases/CacheDatabase.ts")
            .is_file()
    );
    let test = std::fs::read_to_string(
        root.path()
            .join("modules/shared/tests/databases/CacheDatabase.spec.ts"),
    )
    .expect("test");
    assert!(test.contains("redis Cache"));
}

#[test]
fn database_create_keeps_the_existing_file_when_override_is_not_confirmed() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let root = tempfile::tempdir().expect("tempdir");
    let templates = tempfile::tempdir().expect("tempdir");
    std::fs::write(
        templates.path().join("database.sqlite.txt"),
        "new {{NAME}}\n",
    )
    .expect("template");
    std::fs::write(
        templates.path().join("database.test.txt"),
        "new test {{NAME}}\n",
    )
    .expect("template");
    let database_dir = root.path().join("modules/shared/src/databases");
    std::fs::create_dir_all(&database_dir).expect("database dir");
    std::fs::write(database_dir.join("CacheDatabase.ts"), "old\n").expect("existing");
    std::fs::write(
        root.path().join("package.json"),
        "{ \"dependencies\": { \"@talosjs/database\": \"1.0.0\" } }\n",
    )
    .expect("package");
    let previous = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
    }

    run(&DatabaseCreateArgs {
        no_cache: false,
        name: Some("CacheDatabase".to_string()),
        module: None,
        r#type: Some("sqlite".to_string()),
        r#override: false,
        cwd: Some(root.path().display().to_string()),
    });

    match previous {
        Some(value) => unsafe {
            std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, value);
        },
        None => unsafe {
            std::env::remove_var(cli::utils::TEMPLATES_DIR_ENV);
        },
    }

    assert_eq!(
        std::fs::read_to_string(database_dir.join("CacheDatabase.ts")).expect("existing"),
        "old\n"
    );
}
