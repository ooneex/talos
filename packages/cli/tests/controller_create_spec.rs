use clap::Parser;
use cli::commands::controller_create::ControllerCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: ControllerCreateArgs,
}

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
}

#[test]
fn controller_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// route normalization and module registration
// ---------------------------------------------------------------------------

mod support;

use cli::commands::controller_create::{add_class_to_module, normalize_route_path};
use support::TempDir;

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

#[test]
fn add_class_to_module_imports_and_registers_the_controller() {
    let dir = TempDir::new("controller-module");
    let path = dir.write(
        "user.module.ts",
        "import { Module } from \"@talosjs/module\";\n\nexport const UserModule = {\n  controllers: [],\n};\n",
    );

    add_class_to_module(&path, "UserFindController").expect("the class should be registered");

    let out = dir.read("user.module.ts");
    assert!(
        out.contains(r#"import { UserFindController } from "./controllers/UserFindController";"#)
    );
    assert!(out.contains("UserFindController"));
}

#[test]
fn add_class_to_module_reports_a_missing_module_file() {
    let dir = TempDir::new("controller-module-missing");

    assert!(add_class_to_module(&dir.path().join("nope.ts"), "XController").is_err());
}
