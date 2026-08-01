use clap::Parser;
use cli::commands::sdk_create::SdkCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: SdkCreateArgs,
}

#[test]
fn sdk_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos", "--name", "MySdk", "--module", "user", "--cwd", "./here", "--silent",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MySdk"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
}

#[test]
fn sdk_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn sdk_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// controller parsing and SDK file generation
// ---------------------------------------------------------------------------

use std::fs;
use std::path::{Path, PathBuf};

use cli::commands::sdk_create::{
    ControllerDefinition, build_api_entry, build_definition_entry, build_module_file,
    collect_controller_files, extract_existing_keys, match_balanced, merge_module_file,
    parse_controller, read_module_type, to_camel_case,
};

const CONTROLLER: &str = r#"
export type UserFindRouteType = {
  params: { id: string };
  payload: null;
  queries: { page: number };
  response: { name: string };
};

export class UserFindController {
  @Route.get("/users/:id", {
    name: "user.find.one",
    version: 2,
    description: "Find one user",
    roles: ["admin", "user"],
  })
  public async action() {}
}
"#;

/// A scratch directory that removes itself when the test ends.
struct TempDir(PathBuf);

impl TempDir {
    fn new(tag: &str) -> Self {
        let base = std::env::temp_dir().join(format!(
            "talos-sdk-create-{tag}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).expect("temp dir should be creatable");
        Self(base)
    }

    fn path(&self) -> &Path {
        &self.0
    }

    fn write(&self, name: &str, content: &str) -> &Self {
        let target = self.0.join(name);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).expect("parent dir should be creatable");
        }
        fs::write(target, content).expect("fixture should be writable");
        self
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn definition(method: &str, roles: &[&str], is_socket: bool) -> ControllerDefinition {
    ControllerDefinition {
        method: method.to_string(),
        key: format!("user.{method}"),
        version: 1,
        description: "Does a thing".to_string(),
        roles: roles.iter().map(|r| r.to_string()).collect(),
        path: "/users".to_string(),
        is_socket,
        type_name: "UserRouteType".to_string(),
        type_declaration: "type UserRouteType = { response: null };".to_string(),
    }
}

#[test]
fn to_camel_case_joins_on_dashes_and_dots() {
    assert_eq!(to_camel_case("find-one"), "findOne");
    assert_eq!(to_camel_case("user.find.one"), "userFindOne");
    assert_eq!(to_camel_case("single"), "single");
    assert_eq!(to_camel_case(""), "");
    // Empty segments are dropped rather than producing a stray capital.
    assert_eq!(to_camel_case("find--one"), "findOne");
}

#[test]
fn match_balanced_returns_the_body_between_matching_braces() {
    let text = "prefix { a { nested } b } suffix";
    let open = text.find('{').expect("an opening brace");

    let (body, end) = match_balanced(text, open).expect("braces are balanced");

    assert_eq!(body, " a { nested } b ");
    assert_eq!(&text[end..=end], "}");
}

#[test]
fn match_balanced_is_none_when_a_brace_never_closes() {
    let text = "prefix { a { nested }";

    assert!(match_balanced(text, text.find('{').expect("an opening brace")).is_none());
}

#[test]
fn read_module_type_reads_the_yml_and_defaults_to_module() {
    let dir = TempDir::new("module-type");
    dir.write("user/user.yml", "name: \"user\"\ntype: \"api\"\n");

    assert_eq!(read_module_type(dir.path(), "user"), "api");
    // No yml at all is an ordinary backend module.
    assert_eq!(read_module_type(dir.path(), "billing"), "module");
}

#[test]
fn collect_controller_files_walks_nested_directories() {
    let dir = TempDir::new("controllers");
    dir.write("a/UserController.ts", "");
    dir.write("a/b/BillingController.ts", "");
    dir.write("a/helper.ts", "");
    dir.write("a/UserController.spec.ts", "");

    let mut files = Vec::new();
    collect_controller_files(dir.path(), &mut files);
    let mut names: Vec<String> = files
        .iter()
        .filter_map(|p| p.file_name().and_then(|n| n.to_str()).map(str::to_string))
        .collect();
    names.sort();

    assert_eq!(names, ["BillingController.ts", "UserController.ts"]);
}

#[test]
fn parse_controller_reads_the_route_type_and_decorator() {
    let def = parse_controller(CONTROLLER, "user").expect("the controller should parse");

    assert_eq!(def.type_name, "UserFindRouteType");
    assert_eq!(def.key, "user.find.one");
    assert_eq!(def.version, 2);
    assert_eq!(def.description, "Find one user");
    assert_eq!(def.roles, ["admin", "user"]);
    assert_eq!(def.path, "/users/:id");
    assert!(!def.is_socket);
    // The module prefix is stripped before the method name is built.
    assert_eq!(def.method, "findOne");
    assert!(
        def.type_declaration
            .starts_with("type UserFindRouteType = {")
    );
}

#[test]
fn parse_controller_defaults_version_description_and_roles() {
    let content = r#"
export type PingRouteType = { response: null };
@Route.get("/ping", {
  name: "ping",
})
"#;

    let def = parse_controller(content, "user").expect("the controller should parse");

    assert_eq!(def.version, 1);
    assert_eq!(def.description, "");
    assert!(def.roles.is_empty());
    assert_eq!(def.method, "ping");
}

#[test]
fn parse_controller_marks_a_socket_route() {
    let content = r#"
export type ChatRouteType = { response: null };
@Route.socket("/chat", { name: "user.chat" })
"#;

    let def = parse_controller(content, "user").expect("the controller should parse");

    assert!(def.is_socket);
    assert_eq!(def.method, "chat");
}

#[test]
fn parse_controller_is_none_without_a_route_type_or_decorator() {
    assert!(parse_controller("export class Nothing {}", "user").is_none());
    assert!(parse_controller("export type XRouteType = { a: 1 };", "user").is_none());
}

#[test]
fn build_api_entry_requests_a_bearer_token_only_for_guarded_routes() {
    assert!(
        build_api_entry(&definition("findOne", &["admin"], false)).contains("bearerToken: string;")
    );
    assert!(!build_api_entry(&definition("findOne", &[], false)).contains("bearerToken"));
}

#[test]
fn build_api_entry_names_the_transport_it_should_use() {
    assert!(build_api_entry(&definition("chat", &[], true)).contains("use socket api"));
    assert!(build_api_entry(&definition("findOne", &[], false)).contains("use fetch api"));
}

#[test]
fn build_definition_entry_renders_the_versioned_endpoint() {
    let entry = build_definition_entry(&definition("findOne", &["admin"], false));

    assert!(entry.contains("key: \"user.findOne\""));
    assert!(entry.contains("version: 1"));
    assert!(entry.contains("roles: [\"admin\"]"));
    assert!(entry.contains("endpoint: \"/<prefix>/v1/users\""));
}

#[test]
fn build_definition_entry_escapes_quotes_in_the_description() {
    let mut def = definition("findOne", &[], false);
    def.description = "The \"best\" one".to_string();

    assert!(build_definition_entry(&def).contains(r#"description: "The \"best\" one""#));
}

#[test]
fn build_module_file_emits_types_api_and_definition_blocks() {
    let out = build_module_file("userSdk", &[definition("findOne", &["admin"], false)]);

    assert!(out.starts_with("import type { ResponseDataType } from \"@talosjs/http-response\";"));
    assert!(out.contains("type UserRouteType = { response: null };"));
    assert!(out.contains("export const userSdk = {"));
    assert!(out.contains("  api: {"));
    assert!(out.contains("  definition: {"));
    assert!(out.ends_with("};\n"));
}

#[test]
fn extract_existing_keys_finds_every_declared_key() {
    let keys = extract_existing_keys("key: \"user.find\"\n... key:  \"user.create\"\n");

    assert_eq!(keys.len(), 2);
    assert!(keys.contains("user.find"));
    assert!(keys.contains("user.create"));
    assert!(extract_existing_keys("no keys here").is_empty());
}

#[test]
fn merge_module_file_splices_new_entries_into_an_existing_file() {
    let existing = build_module_file("userSdk", &[definition("findOne", &[], false)]);

    let merged = merge_module_file(&existing, &[definition("createOne", &[], false)]);

    // Both the old and the new method survive the merge.
    assert!(merged.contains("findOne:"));
    assert!(merged.contains("createOne:"));
    assert!(merged.contains("key: \"user.findOne\""));
    assert!(merged.contains("key: \"user.createOne\""));
    assert!(merged.ends_with("};\n"));
}
