mod support;

use cli::utils::{
    add_path_alias, add_to_app_module, add_to_microservice_module, add_to_shared_module,
    remove_from_app_module, remove_from_shared_module, remove_path_alias, strip_jsonc,
};
use support::TempDir;

/// The shape `app.module.ts` is scaffolded with — every registry field present
/// but empty, which is what a fresh app looks like.
const APP_MODULE: &str = r#"import { Module } from "@talosjs/module";

export const AppModule = {
  controllers: [],
  middlewares: [],
  cronJobs: [],
  events: [],
};
"#;

const SHARED_MODULE: &str = r#"import { Module } from "@talosjs/module";

export const SharedModule = {
  entities: [],
};
"#;

// ---------------------------------------------------------------------------
// app module registration
// ---------------------------------------------------------------------------

#[test]
fn add_to_app_module_imports_and_spreads_into_every_field() {
    let dir = TempDir::new("registry-app-add");
    let path = dir.write("app.module.ts", APP_MODULE);

    add_to_app_module(&path, "User", "user").expect("the module should be registered");

    let out = dir.read("app.module.ts");
    assert!(out.contains(r#"import { UserModule } from "@module/user/UserModule";"#));
    for field in ["controllers", "middlewares", "cronJobs", "events"] {
        assert!(
            out.contains(&format!("...UserModule.{field}")),
            "{field} should carry the spread"
        );
    }
}

#[test]
fn add_to_app_module_keeps_modules_already_registered() {
    let dir = TempDir::new("registry-app-second");
    let path = dir.write("app.module.ts", APP_MODULE);

    add_to_app_module(&path, "User", "user").expect("the first module registers");
    add_to_app_module(&path, "Billing", "billing").expect("the second module registers");

    let out = dir.read("app.module.ts");
    assert!(out.contains("...UserModule.controllers"));
    assert!(out.contains("...BillingModule.controllers"));
    assert!(out.contains(r#"import { UserModule }"#));
    assert!(out.contains(r#"import { BillingModule }"#));
}

#[test]
fn add_to_app_module_reports_a_missing_file() {
    let dir = TempDir::new("registry-app-missing");

    assert!(add_to_app_module(&dir.path().join("nope.ts"), "User", "user").is_err());
}

#[test]
fn remove_from_app_module_undoes_the_registration() {
    let dir = TempDir::new("registry-app-remove");
    let path = dir.write("app.module.ts", APP_MODULE);
    add_to_app_module(&path, "User", "user").expect("the module registers");

    remove_from_app_module(&path, "User", "user").expect("the module is removed");

    let out = dir.read("app.module.ts");
    assert!(!out.contains("UserModule"));
    assert!(out.contains("controllers: ["));
}

#[test]
fn remove_from_app_module_leaves_other_modules_registered() {
    let dir = TempDir::new("registry-app-remove-one");
    let path = dir.write("app.module.ts", APP_MODULE);
    add_to_app_module(&path, "User", "user").expect("the first registers");
    add_to_app_module(&path, "Billing", "billing").expect("the second registers");

    remove_from_app_module(&path, "User", "user").expect("only user is removed");

    let out = dir.read("app.module.ts");
    assert!(!out.contains("UserModule"));
    assert!(out.contains("...BillingModule.controllers"));
}

#[test]
fn remove_from_app_module_is_fine_when_the_file_does_not_exist() {
    let dir = TempDir::new("registry-app-remove-missing");

    assert!(remove_from_app_module(&dir.path().join("nope.ts"), "User", "user").is_ok());
}

// ---------------------------------------------------------------------------
// microservice + shared modules
// ---------------------------------------------------------------------------

#[test]
fn add_to_microservice_module_spreads_into_its_own_field_set() {
    let dir = TempDir::new("registry-microservice");
    let path = dir.write(
        "microservice.module.ts",
        "export const M = {\n  controllers: [],\n  middlewares: [],\n  cronJobs: [],\n  events: [],\n  entities: [],\n};\n",
    );

    add_to_microservice_module(&path, "User", "user").expect("the module registers");

    let out = dir.read("microservice.module.ts");
    assert!(out.contains(r#"import { UserModule } from "@module/user/UserModule";"#));
    assert!(out.contains("...UserModule.controllers"));
    assert!(out.contains("...UserModule.entities"));
}

#[test]
fn add_to_shared_module_only_touches_entities() {
    let dir = TempDir::new("registry-shared-add");
    let path = dir.write("shared.module.ts", SHARED_MODULE);

    add_to_shared_module(&path, "User", "user").expect("the module registers");

    let out = dir.read("shared.module.ts");
    assert!(out.contains(r#"import { UserModule } from "@module/user/UserModule";"#));
    assert!(out.contains("...UserModule.entities"));
}

#[test]
fn remove_from_shared_module_undoes_the_registration() {
    let dir = TempDir::new("registry-shared-remove");
    let path = dir.write("shared.module.ts", SHARED_MODULE);
    add_to_shared_module(&path, "User", "user").expect("the module registers");

    remove_from_shared_module(&path, "User", "user").expect("the module is removed");

    assert!(!dir.read("shared.module.ts").contains("UserModule"));
}

#[test]
fn remove_from_shared_module_is_fine_when_the_file_does_not_exist() {
    let dir = TempDir::new("registry-shared-missing");

    assert!(remove_from_shared_module(&dir.path().join("nope.ts"), "User", "user").is_ok());
}

// ---------------------------------------------------------------------------
// tsconfig path aliases
// ---------------------------------------------------------------------------

#[test]
fn add_path_alias_writes_the_module_alias() {
    let dir = TempDir::new("registry-alias-add");
    let path = dir.write("tsconfig.json", r#"{"compilerOptions": {"paths": {}}}"#);

    add_path_alias(&path, "user").expect("the alias should be written");

    let out = dir.read("tsconfig.json");
    assert!(out.contains(r#""@module/user/*""#));
    assert!(out.contains(r#""./modules/user/src/*""#));
    assert!(out.ends_with('\n'));
}

#[test]
fn add_path_alias_creates_the_missing_sections() {
    let dir = TempDir::new("registry-alias-create");
    let path = dir.write("tsconfig.json", "{}");

    add_path_alias(&path, "user").expect("the alias should be written");

    let out = dir.read("tsconfig.json");
    assert!(out.contains("compilerOptions"));
    assert!(out.contains(r#""@module/user/*""#));
}

#[test]
fn add_path_alias_reads_through_jsonc_comments() {
    let dir = TempDir::new("registry-alias-jsonc");
    let path = dir.write(
        "tsconfig.json",
        "{\n  // the compiler options\n  \"compilerOptions\": { \"paths\": {} }\n}",
    );

    add_path_alias(&path, "user").expect("the alias should be written");

    assert!(dir.read("tsconfig.json").contains(r#""@module/user/*""#));
}

#[test]
fn add_path_alias_reports_unusable_input() {
    let dir = TempDir::new("registry-alias-bad");

    assert!(add_path_alias(&dir.path().join("nope.json"), "user").is_err());

    let path = dir.write("tsconfig.json", "not json at all");
    assert!(add_path_alias(&path, "user").is_err());

    let path = dir.write("array.json", "[]");
    assert!(add_path_alias(&path, "user").is_err());
}

#[test]
fn remove_path_alias_drops_only_the_named_module() {
    let dir = TempDir::new("registry-alias-remove");
    let path = dir.write("tsconfig.json", r#"{"compilerOptions": {"paths": {}}}"#);
    add_path_alias(&path, "user").expect("the first alias is written");
    add_path_alias(&path, "billing").expect("the second alias is written");

    remove_path_alias(&path, "user").expect("the alias is removed");

    let out = dir.read("tsconfig.json");
    assert!(!out.contains(r#""@module/user/*""#));
    assert!(out.contains(r#""@module/billing/*""#));
}

#[test]
fn remove_path_alias_is_fine_when_there_is_nothing_to_remove() {
    let dir = TempDir::new("registry-alias-remove-missing");

    // No tsconfig at all.
    assert!(remove_path_alias(&dir.path().join("nope.json"), "user").is_ok());

    // A tsconfig without a paths section.
    let path = dir.write("tsconfig.json", "{}");
    assert!(remove_path_alias(&path, "user").is_ok());
}

// ---------------------------------------------------------------------------
// jsonc
// ---------------------------------------------------------------------------

#[test]
fn strip_jsonc_removes_line_and_block_comments() {
    let stripped = strip_jsonc(
        "{\n  // a line comment\n  \"a\": 1, /* inline */\n  /* block\n  spanning */ \"b\": 2\n}",
    );

    assert!(!stripped.contains("comment"));
    assert!(!stripped.contains("block"));
    assert!(stripped.contains("\"a\": 1,"));
    assert!(stripped.contains("\"b\": 2"));
    assert!(serde_json::from_str::<serde_json::Value>(&stripped).is_ok());
}

#[test]
fn strip_jsonc_leaves_comment_markers_inside_strings_alone() {
    let stripped = strip_jsonc(r#"{"url": "https://example.test", "note": "/* not a comment */"}"#);

    assert!(stripped.contains("https://example.test"));
    assert!(stripped.contains("/* not a comment */"));
}

#[test]
fn strip_jsonc_leaves_plain_json_unchanged() {
    let json = r#"{"a": 1, "b": [2, 3]}"#;

    assert_eq!(strip_jsonc(json), json);
}
