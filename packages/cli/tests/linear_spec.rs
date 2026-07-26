use cli::utils::linear::priority_name;

#[test]
fn priority_name_maps_known_values() {
    assert_eq!(priority_name(Some(0)).as_deref(), Some("No priority"));
    assert_eq!(priority_name(Some(1)).as_deref(), Some("Urgent"));
    assert_eq!(priority_name(Some(2)).as_deref(), Some("High"));
    assert_eq!(priority_name(Some(3)).as_deref(), Some("Medium"));
    assert_eq!(priority_name(Some(4)).as_deref(), Some("Low"));
}

#[test]
fn priority_name_returns_none_for_missing_value() {
    assert!(priority_name(None).is_none());
}

#[test]
fn priority_name_falls_back_to_numeric_label() {
    assert_eq!(priority_name(Some(7)).as_deref(), Some("7"));
}
