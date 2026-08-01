//! Generating a browser SDK from a module's controllers.
//!
//! `sdk:create` reads every `@Route` decorator in the target module, turns each
//! into a typed client method, and writes one file per module plus an index.
//! The workspace and the module templates are both on disk, so the whole
//! generation runs offline — only the dependency install at the very end needs
//! a network, and the tests run with a `PATH` that has no `bun` on it so it
//! stops there.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

use cli::commands::sdk_create::{
    build_module_file, extract_existing_keys, merge_module_file, parse_controller, to_camel_case,
};

/// A controller with one route, written the way the generator expects to read it.
const CONTROLLER: &str = r#"import { Route } from "@talosjs/controller";

export type UserListRouteType = {
  params: { id: string };
  payload: never;
  queries: { page: number };
  response: { users: string[] };
};

@Route.get("/users", {
  name: "user.list",
  version: 2,
  description: "List every user",
  roles: ["admin", "member"],
})
export class UserController {}
"#;

const TEMPLATES: &[(&str, &str)] = &[
    ("module/module.txt", "export const {{NAME}}Module = {};\n"),
    (
        "module/package.txt",
        "{\n  \"name\": \"@module/{{NAME}}\"\n}\n",
    ),
    ("module/tsconfig.txt", "{}\n"),
    ("module/yml.txt", "type: \"module\"\n"),
    ("module/test.txt", "// {{NAME}}Module {{name}}\n"),
    ("module/bunfig.txt", "[test]\n"),
];

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("a parent")).expect("create parent");
    fs::write(path, content).expect("write file");
}

fn templates() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("talos-sdk-templates-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    for (name, body) in TEMPLATES {
        write(&dir.join(name), body);
    }
    dir
}

/// A workspace with an api module carrying one controller.
fn workspace() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().to_path_buf();
    write(&root.join("package.json"), "{ \"name\": \"scratch\" }\n");
    write(&root.join("modules/app/app.yml"), "type: \"api\"\n");
    write(
        &root.join("modules/app/package.json"),
        "{ \"name\": \"@module/app\" }\n",
    );
    write(
        &root.join("modules/app/src/controllers/UserController.ts"),
        CONTROLLER,
    );
    (dir, root)
}

fn talos(root: &Path, templates: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .arg(format!("--cwd={}", root.display()))
        .env("TALOS_TEMPLATES_DIR", templates)
        // The generation is done before the dependency install; with no `bun`
        // to run, the command stops there instead of reaching the registry.
        .env("PATH", "/nonexistent")
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .output()
        .expect("the talos binary should run")
}

fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_else(|_| panic!("{} should exist", path.display()))
}

// ---------------------------------------------------------------------------
// Reading a controller
// ---------------------------------------------------------------------------

#[test]
fn a_controller_yields_the_route_its_decorator_and_its_type_describe() {
    let definition = parse_controller(CONTROLLER, "user").expect("the controller parses");

    assert_eq!(definition.method, "list", "the module prefix is dropped");
    assert_eq!(definition.key, "user.list");
    assert_eq!(definition.version, 2);
    assert_eq!(definition.description, "List every user");
    assert_eq!(definition.roles, vec!["admin", "member"]);
    assert_eq!(definition.path, "/users");
    assert_eq!(definition.type_name, "UserListRouteType");
    assert!(!definition.is_socket);
    assert!(
        definition.type_declaration.contains("queries"),
        "the whole type body comes along: {}",
        definition.type_declaration
    );
}

#[test]
fn a_socket_route_is_marked_as_one() {
    let socket = CONTROLLER.replace("@Route.get(", "@Route.socket(");

    let definition = parse_controller(&socket, "user").expect("the controller parses");

    assert!(definition.is_socket);
    assert_eq!(definition.method, "list");
}

#[test]
fn a_route_declaring_no_version_or_roles_takes_the_defaults() {
    let bare = r#"export type PingRouteType = { response: string };

@Route.get("/ping", {
  name: "health.ping",
})
export class PingController {}
"#;

    let definition = parse_controller(bare, "health").expect("the controller parses");

    assert_eq!(definition.version, 1);
    assert!(definition.roles.is_empty());
    assert_eq!(definition.description, "");
}

#[test]
fn a_file_that_is_not_a_controller_yields_nothing() {
    assert!(parse_controller("export const x = 1;\n", "user").is_none());
    assert!(
        parse_controller("export type UserRouteType = { a: 1 };\n", "user").is_none(),
        "a type with no route decorator is not a controller"
    );
}

#[test]
fn a_kebab_name_becomes_the_camel_case_method_name() {
    assert_eq!(to_camel_case("user-list"), "userList");
    assert_eq!(to_camel_case("user"), "user");
    assert_eq!(to_camel_case(""), "");
}

// ---------------------------------------------------------------------------
// Building and merging the generated file
// ---------------------------------------------------------------------------

#[test]
fn the_generated_module_file_carries_the_api_and_the_definitions() {
    let definition = parse_controller(CONTROLLER, "user").expect("the controller parses");

    let file = build_module_file("app", &[definition]);

    assert!(file.contains("UserListRouteType"), "{file}");
    assert!(file.contains("key: \"user.list\""), "{file}");
    assert!(file.contains("/<prefix>/v2/users"), "{file}");
    assert!(
        file.contains("bearerToken"),
        "a route with roles takes a token: {file}"
    );
}

#[test]
fn a_route_that_is_already_in_the_file_is_not_added_twice() {
    let definition = parse_controller(CONTROLLER, "user").expect("the controller parses");
    let existing = build_module_file("app", &[definition.clone()]);

    let keys = extract_existing_keys(&existing);

    assert!(keys.contains("user.list"), "{keys:?}");
}

#[test]
fn merging_appends_only_the_routes_the_file_does_not_have_yet() {
    let first = parse_controller(CONTROLLER, "user").expect("the controller parses");
    let existing = build_module_file("app", &[first]);
    let second = parse_controller(
        &CONTROLLER
            .replace("UserListRouteType", "UserCreateRouteType")
            .replace("user.list", "user.create")
            .replace("@Route.get", "@Route.post"),
        "user",
    )
    .expect("the second controller parses");

    let merged = merge_module_file(&existing, &[second]);

    assert!(merged.contains("user.list"), "{merged}");
    assert!(merged.contains("user.create"), "{merged}");
    assert_eq!(
        merged.matches("key: \"user.list\"").count(),
        1,
        "the route already there is left alone: {merged}"
    );
}

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

#[test]
fn the_sdk_module_is_scaffolded_and_typed_as_an_sdk_pointing_at_its_target() {
    let (_dir, root) = workspace();
    let templates = templates();

    talos(&root, &templates, &["sdk:create", "--name=sdk", "--module=app", "--silent"]);

    let sdk = root.join("modules/sdk");
    let manifest = read(&sdk.join("sdk.yml"));
    assert!(manifest.contains("type: \"sdk\""), "{manifest}");
    assert!(manifest.contains("target: \"app\""), "{manifest}");
    assert!(
        read(&sdk.join("package.json")).contains("\"@scratch/sdk\""),
        "the package takes the workspace's scope"
    );
    assert!(
        sdk.join("bunup.config.ts").is_file(),
        "the bundler config is written"
    );
}

#[test]
fn one_file_per_module_is_generated_and_re_exported_from_the_index() {
    let (_dir, root) = workspace();
    let templates = templates();

    talos(&root, &templates, &["sdk:create", "--name=sdk", "--module=app", "--silent"]);

    let generated = read(&root.join("modules/sdk/src/app.ts"));
    assert!(generated.contains("user.list"), "{generated}");
    assert!(generated.contains("UserListRouteType"), "{generated}");

    let index = read(&root.join("modules/sdk/src/index.ts"));
    assert!(index.contains("import { app } from \"./app\""), "{index}");
    assert!(index.contains("export const sdk"), "{index}");
}

#[test]
fn a_second_run_leaves_the_routes_it_already_generated_alone() {
    let (_dir, root) = workspace();
    let templates = templates();
    talos(&root, &templates, &["sdk:create", "--name=sdk", "--module=app", "--silent"]);

    write(
        &root.join("modules/app/src/controllers/PingController.ts"),
        "export type PingRouteType = { response: string };\n\n@Route.get(\"/ping\", {\n  name: \"app.ping\",\n})\nexport class PingController {}\n",
    );
    talos(&root, &templates, &["sdk:create", "--name=sdk", "--module=app", "--silent"]);

    let generated = read(&root.join("modules/sdk/src/app.ts"));
    assert_eq!(
        generated.matches("key: \"user.list\"").count(),
        1,
        "{generated}"
    );
    assert!(generated.contains("app.ping"), "{generated}");
}

#[test]
fn a_target_module_with_no_controller_generates_an_empty_sdk() {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path();
    let templates = templates();
    write(&root.join("package.json"), "{ \"name\": \"scratch\" }\n");
    write(&root.join("modules/app/app.yml"), "type: \"api\"\n");
    write(
        &root.join("modules/app/package.json"),
        "{ \"name\": \"@module/app\" }\n",
    );

    talos(root, &templates, &["sdk:create", "--name=sdk", "--module=app", "--silent"]);

    let index = read(&root.join("modules/sdk/src/index.ts"));
    assert_eq!(index, "export const sdk = {\n\n};\n", "{index}");
}
