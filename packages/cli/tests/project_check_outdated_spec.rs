//! Unit tests for the version arithmetic behind the `outdated` check: reading
//! the floor out of a semver range, and comparing it against the latest
//! release.

use cli::commands::project_check::outdated::{floor, is_behind, majors_behind, parts};

// ---------------------------------------------------------------------------
// floor
// ---------------------------------------------------------------------------

#[test]
fn floor_reads_the_lowest_version_a_range_allows() {
    assert_eq!(floor("^1.2.3").as_deref(), Some("1.2.3"));
    assert_eq!(floor("~1.2").as_deref(), Some("1.2"));
    assert_eq!(floor("1.2.3").as_deref(), Some("1.2.3"));
    assert_eq!(floor("v1.2.3").as_deref(), Some("1.2.3"));
    assert_eq!(floor(">=1.2 <2").as_deref(), Some("1.2"));
    assert_eq!(floor("  ^1.2.3  ").as_deref(), Some("1.2.3"));
}

#[test]
fn floor_stops_at_the_first_non_version_character() {
    assert_eq!(floor("1.2.*").as_deref(), Some("1.2"));
    assert_eq!(floor("1.2.3-beta.1").as_deref(), Some("1.2.3"));
}

#[test]
fn floor_ignores_ranges_that_do_not_name_a_registry_version() {
    assert!(floor("workspace:*").is_none());
    assert!(floor("file:../local").is_none());
    assert!(floor("link:../local").is_none());
    assert!(floor("git+ssh://git@github.com/acme/repo").is_none());
    assert!(floor("https://example.test/pkg.tgz").is_none());
}

#[test]
fn floor_ignores_an_unpinned_range() {
    assert!(floor("*").is_none());
    assert!(floor("latest").is_none());
    assert!(floor("x").is_none());
    assert!(floor("").is_none());
}

// ---------------------------------------------------------------------------
// comparison
// ---------------------------------------------------------------------------

#[test]
fn parts_reads_missing_components_as_zero() {
    assert_eq!(parts("1.2.3"), (1, 2, 3));
    assert_eq!(parts("1.2"), (1, 2, 0));
    assert_eq!(parts("1"), (1, 0, 0));
    assert_eq!(parts(""), (0, 0, 0));
}

#[test]
fn parts_reads_an_unparsable_component_as_zero() {
    assert_eq!(parts("1.beta.3"), (1, 0, 3));
    assert_eq!(parts("not-a-version"), (0, 0, 0));
}

#[test]
fn majors_behind_counts_only_the_leading_number() {
    assert_eq!(majors_behind("1.2.3", "3.0.0"), 2);
    assert_eq!(majors_behind("1.9.9", "2.0.0"), 1);
    assert_eq!(majors_behind("2.0.0", "2.9.9"), 0);
}

#[test]
fn majors_behind_never_goes_negative() {
    // A declared version ahead of the registry is zero majors behind, not a
    // wrapped-around huge number.
    assert_eq!(majors_behind("5.0.0", "2.0.0"), 0);
}

#[test]
fn is_behind_compares_every_component() {
    assert!(is_behind("1.2.3", "1.2.4"));
    assert!(is_behind("1.2.3", "1.3.0"));
    assert!(is_behind("1.2.3", "2.0.0"));
}

#[test]
fn is_behind_is_false_when_up_to_date_or_ahead() {
    assert!(!is_behind("1.2.3", "1.2.3"));
    assert!(!is_behind("2.0.0", "1.9.9"));
}
