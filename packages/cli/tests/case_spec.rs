use rust_cli::utils::{to_kebab_case, to_snake_case};

#[test]
fn to_kebab_case_converts_simple_words() {
    assert_eq!(to_kebab_case("hello world"), "hello-world");
}

#[test]
fn to_kebab_case_splits_camel_case() {
    assert_eq!(to_kebab_case("myAppName"), "my-app-name");
}

#[test]
fn to_kebab_case_splits_pascal_case() {
    assert_eq!(to_kebab_case("MyAppName"), "my-app-name");
}

#[test]
fn to_kebab_case_handles_acronyms() {
    assert_eq!(to_kebab_case("HTMLElement"), "html-element");
}

#[test]
fn to_kebab_case_handles_digits() {
    assert_eq!(to_kebab_case("App2Name"), "app-2-name");
    assert_eq!(to_kebab_case("v1Api"), "v-1-api");
}

#[test]
fn to_kebab_case_collapses_separators() {
    assert_eq!(
        to_kebab_case("already-kebab_case name"),
        "already-kebab-case-name"
    );
}

#[test]
fn to_kebab_case_trims_and_handles_empty_input() {
    assert_eq!(to_kebab_case("  Trimmed Name  "), "trimmed-name");
    assert_eq!(to_kebab_case(""), "");
    assert_eq!(to_kebab_case("   "), "");
}

#[test]
fn to_snake_case_converts_simple_words() {
    assert_eq!(to_snake_case("hello world"), "hello_world");
}

#[test]
fn to_snake_case_splits_camel_and_pascal_case() {
    assert_eq!(to_snake_case("myAppName"), "my_app_name");
    assert_eq!(to_snake_case("MyAppName"), "my_app_name");
}

#[test]
fn to_snake_case_handles_acronyms_and_digits() {
    assert_eq!(to_snake_case("HTMLElement"), "html_element");
    assert_eq!(to_snake_case("App2Name"), "app_2_name");
}

#[test]
fn to_snake_case_handles_empty_input() {
    assert_eq!(to_snake_case(""), "");
}
