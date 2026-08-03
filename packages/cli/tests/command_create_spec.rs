use clap::Parser;
use cli::commands::command_create::{CommandCreateArgs, run};
use std::sync::Mutex;

static ENV_GUARD: Mutex<()> = Mutex::new(());

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: CommandCreateArgs,
}

#[test]
fn command_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--name",
        "MyCommand",
        "--module",
        "user",
        "--override",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyCommand"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert!(cli.args.r#override);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn command_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(!cli.args.r#override);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn command_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn command_create_writes_command_files_and_index() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let root = tempfile::tempdir().expect("tempdir");
    let templates = tempfile::tempdir().expect("tempdir");
    std::fs::create_dir_all(templates.path().join("command")).expect("command templates");
    std::fs::create_dir_all(templates.path().join("module")).expect("module templates");
    std::fs::write(
        templates.path().join("command/command.txt"),
        "export class {{NAME}}Command { static name = '{{COMMAND_NAME}}'; }\n",
    )
    .expect("template");
    std::fs::write(
        templates.path().join("command/command.test.txt"),
        "// {{NAME}} in {{MODULE}}\n",
    )
    .expect("template");
    std::fs::write(
        templates.path().join("module/command.run.txt"),
        "// run {{name}}\n",
    )
    .expect("template");
    let previous = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
    }

    run(&CommandCreateArgs {
        no_cache: false,
        name: Some("Seed".to_string()),
        module: Some("shared".to_string()),
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
            .join("modules/shared/src/commands/SeedCommand.ts")
            .is_file()
    );
    assert!(
        root.path()
            .join("modules/shared/tests/commands/SeedCommand.spec.ts")
            .is_file()
    );
    assert!(
        root.path()
            .join("modules/shared/src/commands/commands.ts")
            .is_file()
    );
    assert!(
        root.path()
            .join("modules/shared/bin/command/run.ts")
            .is_file()
    );
}

#[test]
fn command_create_keeps_existing_files_when_override_is_not_confirmed() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let root = tempfile::tempdir().expect("tempdir");
    let templates = tempfile::tempdir().expect("tempdir");
    std::fs::create_dir_all(templates.path().join("command")).expect("command templates");
    std::fs::create_dir_all(templates.path().join("module")).expect("module templates");
    std::fs::write(
        templates.path().join("command/command.txt"),
        "new command\n",
    )
    .expect("template");
    std::fs::write(
        templates.path().join("command/command.test.txt"),
        "new test\n",
    )
    .expect("template");
    std::fs::write(templates.path().join("module/command.run.txt"), "new run\n").expect("template");
    let command_dir = root.path().join("modules/shared/src/commands");
    std::fs::create_dir_all(&command_dir).expect("command dir");
    std::fs::write(command_dir.join("SeedCommand.ts"), "old command\n").expect("existing");
    let previous = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
    }

    run(&CommandCreateArgs {
        no_cache: false,
        name: Some("SeedCommand".to_string()),
        module: None,
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
        std::fs::read_to_string(command_dir.join("SeedCommand.ts")).expect("existing"),
        "old command\n"
    );
}

#[test]
fn command_create_preserves_an_existing_run_entrypoint() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let root = tempfile::tempdir().expect("tempdir");
    let templates = tempfile::tempdir().expect("tempdir");
    std::fs::create_dir_all(templates.path().join("command")).expect("command templates");
    std::fs::create_dir_all(templates.path().join("module")).expect("module templates");
    std::fs::write(
        templates.path().join("command/command.txt"),
        "export class {{NAME}}Command { static name = '{{COMMAND_NAME}}'; }\n",
    )
    .expect("template");
    std::fs::write(
        templates.path().join("command/command.test.txt"),
        "// {{NAME}} in {{MODULE}}\n",
    )
    .expect("template");
    std::fs::write(
        templates.path().join("module/command.run.txt"),
        "new run {{name}}\n",
    )
    .expect("template");
    let run_path = root.path().join("modules/shared/bin/command/run.ts");
    std::fs::create_dir_all(run_path.parent().expect("parent")).expect("run dir");
    std::fs::write(&run_path, "existing run\n").expect("existing run");
    let previous = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
    }

    run(&CommandCreateArgs {
        no_cache: false,
        name: Some("Seed".to_string()),
        module: None,
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

    assert_eq!(
        std::fs::read_to_string(run_path).expect("run"),
        "existing run\n"
    );
}
