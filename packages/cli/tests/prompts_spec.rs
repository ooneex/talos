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
    find_destination_modules, validate_route_method, validate_route_name, validate_route_path,
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
