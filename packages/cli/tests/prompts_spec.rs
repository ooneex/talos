use std::path::PathBuf;

use cli::utils::{resolve_name_and_destination, validate_destination, validate_name};

#[test]
fn validate_name_accepts_letters_numbers_and_hyphens() {
    assert!(validate_name("my-app-2").is_ok());
    assert!(validate_name("MyApp").is_ok());
}

#[test]
fn validate_name_rejects_leading_digit_or_hyphen() {
    assert!(validate_name("2myapp").is_err());
    assert!(validate_name("-myapp").is_err());
}

#[test]
fn validate_name_rejects_invalid_characters() {
    assert!(validate_name("my app").is_err());
    assert!(validate_name("my_app").is_err());
    assert!(validate_name("").is_err());
}

#[test]
fn validate_destination_accepts_valid_paths() {
    assert!(validate_destination(".").is_ok());
    assert!(validate_destination("./my-app_dir/nested~1").is_ok());
}

#[test]
fn validate_destination_rejects_blank_or_invalid_paths() {
    assert!(validate_destination("").is_err());
    assert!(validate_destination("   ").is_err());
    assert!(validate_destination("my app").is_err());
    assert!(validate_destination("path*glob").is_err());
}

#[test]
fn resolve_name_and_destination_uses_provided_values_without_prompting() {
    let resolved = resolve_name_and_destination(Some("MyApp".into()), Some("./dest".into()));
    let (name, kebab_name, destination) = resolved.expect("both values were provided");

    assert_eq!(name, "MyApp");
    assert_eq!(kebab_name, "my-app");
    assert_eq!(destination, PathBuf::from("./dest"));
}

// ---------------------------------------------------------------------------
// route validators and destination discovery
// ---------------------------------------------------------------------------

mod support;

use cli::utils::{
    ask_confirm, ask_destination, ask_destination_module, ask_input, ask_input_with_default,
    ask_multiselect, ask_name, ask_password, ask_plain_input, ask_route_method, ask_route_name,
    ask_route_path, ask_select, find_destination_modules, validate_route_method,
    validate_route_name, validate_route_path,
};
use support::TempDir;

#[test]
fn validate_route_name_requires_three_dotted_segments() {
    assert!(validate_route_name("api.users.list").is_ok());
    assert!(validate_route_name("v1.user.findOne").is_ok());
}

#[test]
fn validate_route_name_rejects_the_wrong_shape() {
    assert!(validate_route_name("api.users").is_err());
    assert!(validate_route_name("api.users.list.extra").is_err());
    assert!(validate_route_name("api-users-list").is_err());
    // Too short even with the right shape.
    assert!(validate_route_name("a.b.c").is_err());
    // Surrounding whitespace is never silently trimmed.
    assert!(validate_route_name(" api.users.list").is_err());
}

#[test]
fn validate_route_path_accepts_static_and_parameter_segments() {
    assert!(validate_route_path("/").is_ok());
    assert!(validate_route_path("/users").is_ok());
    assert!(validate_route_path("/api/users/:id").is_ok());
    assert!(validate_route_path("/my-route/my_route").is_ok());
}

#[test]
fn validate_route_path_requires_a_leading_slash_and_no_trailing_one() {
    assert!(validate_route_path("users").is_err());
    assert!(validate_route_path("/users/").is_err());
    assert!(validate_route_path(" /users").is_err());
}

#[test]
fn validate_route_path_rejects_empty_and_malformed_segments() {
    assert!(validate_route_path("/users//list").is_err());
    // A parameter must start with a letter.
    assert!(validate_route_path("/users/:1id").is_err());
    assert!(validate_route_path("/users/:").is_err());
    assert!(validate_route_path("/users/what?").is_err());
    assert!(validate_route_path("/users/na:me").is_err());
}

#[test]
fn validate_route_method_accepts_every_http_verb_case_insensitively() {
    for method in ["GET", "post", "Put", "DELETE", "patch", "OPTIONS", "head"] {
        assert!(
            validate_route_method(method).is_ok(),
            "{method} should be accepted"
        );
    }
}

#[test]
fn validate_route_method_rejects_anything_else() {
    assert!(validate_route_method("TRACE").is_err());
    assert!(validate_route_method("").is_err());
    assert!(validate_route_method(" GET").is_err());
}

#[test]
fn find_destination_modules_lists_api_and_microservice_modules_sorted() {
    let dir = TempDir::new("prompts-destinations");
    dir.write("modules/user/user.yml", "type: \"module\"\n");
    dir.write("modules/gateway/gateway.yml", "type: \"microservice\"\n");
    dir.write("modules/app/app.yml", "type: \"api\"\n");

    assert_eq!(find_destination_modules(dir.path()), ["app", "gateway"]);
}

#[test]
fn find_destination_modules_is_empty_without_a_modules_directory() {
    let dir = TempDir::new("prompts-destinations-missing");

    assert!(find_destination_modules(dir.path()).is_empty());
}

#[test]
fn interactive_prompt_wrappers_fall_back_cleanly_without_a_terminal() {
    assert!(ask_input("Name").is_none());
    assert!(ask_input_with_default("Name", "app").is_none());
    assert!(ask_plain_input("Any").is_none());
    assert!(ask_name().is_none());
    assert!(ask_destination("./app").is_none());
    assert!(ask_confirm("Continue?", true));
    assert!(!ask_confirm("Continue?", false));
    assert!(ask_select("Pick", &["a", "b"]).is_none());
    assert!(ask_multiselect("Pick", &["a", "b"], &[true, false]).is_none());
    assert!(ask_password("Secret").is_none());
    assert!(ask_route_name("Route name").is_none());
    assert!(ask_route_path("Route path", "/users").is_none());
    assert!(ask_route_method("Method").is_none());
}

#[test]
fn ask_destination_module_falls_back_to_app_when_no_prompt_can_be_shown() {
    let dir = TempDir::new("prompts-destination-module");
    dir.write("modules/app/app.yml", "type: \"api\"\n");
    dir.write("modules/gateway/gateway.yml", "type: \"microservice\"\n");

    assert_eq!(ask_destination_module(dir.path(), "Choose"), "app");
}

#[test]
fn find_destination_modules_ignores_non_destinations_and_missing_descriptors() {
    let dir = TempDir::new("prompts-destination-filter");
    dir.write("modules/admin/admin.yml", "type: \"admin\"\n");
    dir.write("modules/lib/lib.yml", "type: \"module\"\n");
    dir.dir("modules/missing");
    dir.write("modules/app/app.yml", "type: \"api\"\n");

    assert_eq!(find_destination_modules(dir.path()), ["app"]);
}

#[test]
fn ask_destination_module_falls_back_to_app_even_without_an_app_choice() {
    let dir = TempDir::new("prompts-destination-fallback");
    dir.write("modules/gateway/gateway.yml", "type: \"microservice\"\n");

    assert_eq!(ask_destination_module(dir.path(), "Choose"), "app");
}

#[test]
fn resolve_name_and_destination_requires_missing_values_to_be_prompted() {
    assert!(resolve_name_and_destination(None, Some("./dest".into())).is_none());
    assert!(resolve_name_and_destination(Some("MyApp".into()), None).is_none());
}
