use cli::utils::github::{is_available, map_state_to_yaml, normalize_number};

#[test]
fn normalize_number_strips_the_hash_and_surrounding_space() {
    assert_eq!(normalize_number("123"), "123");
    assert_eq!(normalize_number("#123"), "123");
    assert_eq!(normalize_number("  #123  "), "123");
}

#[test]
fn normalize_number_leaves_anything_else_intact() {
    assert_eq!(normalize_number(""), "");
    assert_eq!(normalize_number("abc"), "abc");
}

#[test]
fn map_state_to_yaml_maps_closed_to_done_and_everything_else_to_todo() {
    assert_eq!(map_state_to_yaml("CLOSED"), "Done");
    assert_eq!(map_state_to_yaml("closed"), "Done");
    assert_eq!(map_state_to_yaml("OPEN"), "Todo");
    assert_eq!(map_state_to_yaml(""), "Todo");
}

#[test]
fn is_available_answers_without_panicking_whether_gh_is_installed() {
    // The value depends on the machine; what matters is that a missing `gh`
    // is reported rather than propagated as an error.
    let _ = is_available();
}
