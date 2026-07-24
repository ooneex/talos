use std::path::PathBuf;

use rust_cli::utils::{resolve_name_and_destination, validate_destination, validate_name};

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
