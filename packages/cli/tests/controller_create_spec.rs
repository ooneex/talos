use clap::Parser;
use cli::commands::controller_create::{ControllerCreateArgs, run};
use std::sync::Mutex;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: ControllerCreateArgs,
}

static ENV_GUARD: Mutex<()> = Mutex::new(());

#[test]
fn controller_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--name",
        "MyController",
        "--module",
        "user",
        "--is-socket",
        "true",
        "--override",
        "--route.name",
        "users",
        "--route.path",
        "/users",
        "--route.method",
        "POST",
        "--cwd",
        "./here",
        "--no-cache",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyController"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert_eq!(cli.args.is_socket, Some(true));
    assert!(cli.args.r#override);
    assert_eq!(cli.args.route_name.as_deref(), Some("users"));
    assert_eq!(cli.args.route_path.as_deref(), Some("/users"));
    assert_eq!(cli.args.route_method.as_deref(), Some("POST"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.no_cache);
}

#[test]
fn controller_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(cli.args.is_socket.is_none());
    assert!(!cli.args.r#override);
    assert!(cli.args.route_name.is_none());
    assert!(cli.args.route_path.is_none());
    assert!(cli.args.route_method.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.no_cache);
}

#[test]
fn controller_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// route normalization and module registration
// ---------------------------------------------------------------------------

mod support;

use cli::commands::controller_create::normalize_route_path;

#[test]
fn normalize_route_path_kebab_cases_each_segment() {
    assert_eq!(
        normalize_route_path("/myUsers/subPath"),
        "/my-users/sub-path"
    );
    assert_eq!(normalize_route_path("users"), "/users");
}

#[test]
fn normalize_route_path_keeps_parameters_marked() {
    assert_eq!(normalize_route_path("/users/:userId"), "/users/:user-id");
}

#[test]
fn normalize_route_path_collapses_slashes_and_keeps_root() {
    assert_eq!(normalize_route_path("/"), "/");
    assert_eq!(normalize_route_path("  /  "), "/");
    assert_eq!(normalize_route_path("//users//list//"), "/users/list");
}

// Module-registration coverage (import insertion, array append, and the
// missing-file error path) now lives with the shared
// `utils::scaffold::add_class_to_module` it delegates to.

#[test]
fn controller_create_writes_source_test_and_module_registration() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let root = tempfile::tempdir().expect("tempdir");
    let templates = tempfile::tempdir().expect("tempdir");
    std::fs::write(
        root.path().join("package.json"),
        "{ \"dependencies\": { \"@talosjs/controller\": \"1.0.0\" } }\n",
    )
    .expect("package");
    std::fs::create_dir_all(templates.path()).expect("templates");
    std::fs::write(
        templates.path().join("controller.txt"),
        "export class {{NAME}}Controller { route = '{{ROUTE_NAME}} {{ROUTE_PATH}} {{ROUTE_METHOD}} {{TYPE_NAME}}'; }\n",
    )
    .expect("template");
    std::fs::write(
        templates.path().join("controller.socket.txt"),
        "export class {{NAME}}Controller { socket = '{{ROUTE_NAME}} {{ROUTE_PATH}} {{TYPE_NAME}}'; }\n",
    )
    .expect("template");
    std::fs::write(
        templates.path().join("controller.test.txt"),
        "// {{NAME}} {{MODULE}}\n",
    )
    .expect("template");
    std::fs::create_dir_all(root.path().join("modules/shared/src")).expect("src");
    std::fs::write(
        root.path().join("modules/shared/src/SharedModule.ts"),
        "import { Module } from \"@talosjs/module\";\n\nexport const SharedModule = {\n  controllers: [],\n};\n",
    )
    .expect("module");

    let previous = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
    }

    run(&ControllerCreateArgs {
        no_cache: false,
        name: Some("User".to_string()),
        module: Some("shared".to_string()),
        is_socket: Some(false),
        r#override: true,
        route_name: Some("api.users.list".to_string()),
        route_path: Some("/users/:userId".to_string()),
        route_method: Some("POST".to_string()),
        cwd: Some(root.path().display().to_string()),
    });

    match previous {
        Some(value) => unsafe { std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, value) },
        None => unsafe { std::env::remove_var(cli::utils::TEMPLATES_DIR_ENV) },
    }

    let source = std::fs::read_to_string(
        root.path()
            .join("modules/shared/src/controllers/UserController.ts"),
    )
    .expect("source");
    assert!(
        source.contains("api.users.list /users/:user-id post ApiUsersList"),
        "{source}"
    );
    let spec = std::fs::read_to_string(
        root.path()
            .join("modules/shared/tests/controllers/UserController.spec.ts"),
    )
    .expect("spec");
    assert!(spec.contains("User shared"), "{spec}");
    let module = std::fs::read_to_string(root.path().join("modules/shared/src/SharedModule.ts"))
        .expect("module");
    assert!(module.contains("UserController"), "{module}");
}

#[test]
fn controller_create_keeps_an_existing_file_when_override_is_not_confirmed() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let root = tempfile::tempdir().expect("tempdir");
    let templates = tempfile::tempdir().expect("tempdir");
    std::fs::write(templates.path().join("controller.txt"), "new\n").expect("template");
    std::fs::write(templates.path().join("controller.test.txt"), "test\n").expect("template");
    let file = root
        .path()
        .join("modules/shared/src/controllers/UserController.ts");
    std::fs::create_dir_all(file.parent().expect("parent")).expect("dir");
    std::fs::write(&file, "existing\n").expect("existing");
    let previous = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
    }

    run(&ControllerCreateArgs {
        no_cache: false,
        name: Some("User".to_string()),
        module: Some("shared".to_string()),
        is_socket: Some(false),
        r#override: false,
        route_name: Some("api.users.list".to_string()),
        route_path: Some("/users".to_string()),
        route_method: Some("GET".to_string()),
        cwd: Some(root.path().display().to_string()),
    });

    match previous {
        Some(value) => unsafe { std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, value) },
        None => unsafe { std::env::remove_var(cli::utils::TEMPLATES_DIR_ENV) },
    }

    assert_eq!(std::fs::read_to_string(file).expect("file"), "existing\n");
}

#[test]
fn controller_create_uses_the_socket_template_without_a_route_method() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let root = tempfile::tempdir().expect("tempdir");
    let templates = tempfile::tempdir().expect("tempdir");
    std::fs::write(
        templates.path().join("controller.socket.txt"),
        "socket {{NAME}} {{ROUTE_NAME}} {{ROUTE_PATH}} {{TYPE_NAME}}\n",
    )
    .expect("template");
    std::fs::write(templates.path().join("controller.test.txt"), "spec\n").expect("template");
    let previous = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
    }

    run(&ControllerCreateArgs {
        no_cache: false,
        name: Some("Socket".to_string()),
        module: Some("shared".to_string()),
        is_socket: Some(true),
        r#override: true,
        route_name: Some("api.socket.connect".to_string()),
        route_path: Some("/socket/connect".to_string()),
        route_method: None,
        cwd: Some(root.path().display().to_string()),
    });

    match previous {
        Some(value) => unsafe { std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, value) },
        None => unsafe { std::env::remove_var(cli::utils::TEMPLATES_DIR_ENV) },
    }

    let source = std::fs::read_to_string(
        root.path()
            .join("modules/shared/src/controllers/SocketController.ts"),
    )
    .expect("source");
    assert!(source.contains("socket Socket api.socket.connect /socket/connect ApiSocketConnect"));
}
