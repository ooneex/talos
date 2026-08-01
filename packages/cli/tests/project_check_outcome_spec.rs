//! Unit tests for the outcome plumbing shared by every check: how `--only` /
//! `--skip` resolve, how a read-only check turns errors and warnings into an
//! outcome, how `--strict` hardens it, and the small parsers the accessibility
//! and hygiene checks lean on.

use cli::commands::project_check::{
    Category, CheckId, CheckOutcome, CheckStatus, ERROR_DETAIL, MAX_DETAILS, WARN_DETAIL,
    bare_marker, cap_details, harden, json_message_to_string, json_path_to_string, select_checks,
    split_csv, static_outcome,
};
use serde_json::json;

// ---------------------------------------------------------------------------
// check selection
// ---------------------------------------------------------------------------

#[test]
fn select_checks_defaults_to_the_default_set() {
    let selected = select_checks(None, None, &[]).expect("the default set is never empty");

    assert!(!selected.is_empty());
    assert!(selected.iter().all(|id| CheckId::DEFAULT.contains(id)));
}

#[test]
fn select_checks_honours_an_explicit_only_list() {
    let first = CheckId::DEFAULT[0];

    let selected = select_checks(Some(first.key()), None, &[]).expect("one check is a valid set");

    assert_eq!(selected, [first]);
}

#[test]
fn select_checks_expands_a_category_into_its_checks() {
    let category = Category::ALL[0];

    let selected = select_checks(Some(category.key()), None, &[]).expect("a category is valid");

    assert_eq!(selected, category.checks());
}

#[test]
fn select_checks_drops_what_skip_names() {
    let first = CheckId::DEFAULT[0];
    let full = select_checks(None, None, &[]).expect("the default set");

    let selected = select_checks(None, Some(first.key()), &[]).expect("a smaller set is still one");

    assert_eq!(selected.len(), full.len() - 1);
    assert!(!selected.contains(&first));
}

#[test]
fn select_checks_admits_an_opt_in_check_only_when_asked() {
    let opt_in = CheckId::ALL
        .into_iter()
        .find(|id| !CheckId::DEFAULT.contains(id));

    let Some(opt_in) = opt_in else {
        return; // every check is on by default
    };

    assert!(
        !select_checks(None, None, &[])
            .expect("defaults")
            .contains(&opt_in)
    );
    assert!(
        select_checks(None, None, &[opt_in])
            .expect("the opt-in check is added")
            .contains(&opt_in)
    );
}

#[test]
fn select_checks_rejects_an_unknown_name() {
    let error = select_checks(Some("definitely-not-a-check"), None, &[])
        .expect_err("an unknown check is an error");

    assert!(error.contains("definitely-not-a-check"));
    assert!(error.contains("expected a category"));
}

#[test]
fn select_checks_rejects_a_selection_that_leaves_nothing() {
    let first = CheckId::DEFAULT[0];

    let error = select_checks(Some(first.key()), Some(first.key()), &[])
        .expect_err("skipping the only check is an error");

    assert!(error.contains("No check left to run"));
}

#[test]
fn select_checks_ignores_blank_entries() {
    let first = CheckId::DEFAULT[0];

    let selected =
        select_checks(Some(&format!(" {} , , ", first.key())), None, &[]).expect("blanks are fine");

    assert_eq!(selected, [first]);
}

// ---------------------------------------------------------------------------
// static outcomes
// ---------------------------------------------------------------------------

#[test]
fn static_outcome_passes_when_there_is_nothing_to_report() {
    let outcome = static_outcome(CheckId::ALL[0], "12 modules", "all clean", vec![], vec![]);

    assert_eq!(outcome.status, CheckStatus::Passed);
    assert_eq!(outcome.summary, "12 modules · all clean");
    assert!(outcome.details.is_empty());
}

#[test]
fn static_outcome_only_warns_when_there_is_no_error() {
    let outcome = static_outcome(
        CheckId::ALL[0],
        "12 modules",
        "all clean",
        vec![],
        vec!["a warning".to_string()],
    );

    assert_eq!(outcome.status, CheckStatus::Warned);
    assert_eq!(outcome.summary, "12 modules · 1 warning");
    assert_eq!(outcome.details, [format!("{WARN_DETAIL}a warning")]);
}

#[test]
fn static_outcome_fails_as_soon_as_there_is_an_error() {
    let outcome = static_outcome(
        CheckId::ALL[0],
        "12 modules",
        "all clean",
        vec!["an error".to_string()],
        vec!["a warning".to_string()],
    );

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert_eq!(outcome.summary, "12 modules · 1 error · 1 warning");
    // Errors come first so a cap never hides them.
    assert_eq!(
        outcome.details,
        [
            format!("{ERROR_DETAIL}an error"),
            format!("{WARN_DETAIL}a warning"),
        ]
    );
}

#[test]
fn static_outcome_pluralizes_each_count() {
    let many = static_outcome(
        CheckId::ALL[0],
        "12 modules",
        "all clean",
        vec!["a".to_string(), "b".to_string()],
        vec!["c".to_string(), "d".to_string()],
    );

    assert_eq!(many.summary, "12 modules · 2 errors · 2 warnings");
}

// ---------------------------------------------------------------------------
// strict mode
// ---------------------------------------------------------------------------

#[test]
fn harden_turns_warnings_into_failures() {
    let warned = static_outcome(
        CheckId::ALL[0],
        "12 modules",
        "all clean",
        vec![],
        vec!["a warning".to_string()],
    );

    let hardened = harden(warned);

    assert_eq!(hardened.status, CheckStatus::Failed);
    assert_eq!(hardened.details, [format!("{ERROR_DETAIL}a warning")]);
}

#[test]
fn harden_leaves_a_passing_or_failing_outcome_as_it_is() {
    let passed = static_outcome(CheckId::ALL[0], "12 modules", "all clean", vec![], vec![]);
    assert_eq!(harden(passed).status, CheckStatus::Passed);

    let failed = static_outcome(
        CheckId::ALL[0],
        "12 modules",
        "all clean",
        vec!["an error".to_string()],
        vec![],
    );
    let hardened = harden(failed);
    assert_eq!(hardened.status, CheckStatus::Failed);
    assert_eq!(hardened.details, [format!("{ERROR_DETAIL}an error")]);
}

#[test]
fn harden_leaves_a_skipped_check_skipped() {
    let skipped = CheckOutcome::new(CheckId::ALL[0], CheckStatus::Skipped, "not applicable");

    assert_eq!(harden(skipped).status, CheckStatus::Skipped);
}

// ---------------------------------------------------------------------------
// detail capping and csv
// ---------------------------------------------------------------------------

#[test]
fn cap_details_leaves_a_short_list_alone() {
    let details: Vec<String> = (0..MAX_DETAILS).map(|i| i.to_string()).collect();

    assert_eq!(cap_details(details.clone()), details);
}

#[test]
fn cap_details_truncates_and_says_how_much_it_hid() {
    let details: Vec<String> = (0..MAX_DETAILS + 3).map(|i| i.to_string()).collect();

    let capped = cap_details(details);

    assert_eq!(capped.len(), MAX_DETAILS + 1);
    assert_eq!(capped[MAX_DETAILS], "… and 3 more");
}

#[test]
fn split_csv_trims_and_drops_blanks() {
    assert_eq!(split_csv(Some("a, b ,,c")), ["a", "b", "c"]);
    assert!(split_csv(Some("  , ,")).is_empty());
    assert!(split_csv(None).is_empty());
}

// ---------------------------------------------------------------------------
// biome json helpers
// ---------------------------------------------------------------------------

#[test]
fn json_path_to_string_reads_a_plain_string() {
    assert_eq!(
        json_path_to_string(&json!("src/App.tsx")).as_deref(),
        Some("src/App.tsx")
    );
}

#[test]
fn json_path_to_string_reads_the_wrapped_shape_biome_emits() {
    assert_eq!(
        json_path_to_string(&json!({ "file": "src/App.tsx" })).as_deref(),
        Some("src/App.tsx")
    );
}

#[test]
fn json_path_to_string_yields_an_empty_path_for_an_object_it_cannot_read() {
    // Only the first level is inspected, and an object always resolves to a
    // path so the caller reports the diagnostic rather than dropping it.
    assert_eq!(json_path_to_string(&json!({})).as_deref(), Some(""));
    assert_eq!(
        json_path_to_string(&json!({ "path": { "file": "src/App.tsx" } })).as_deref(),
        Some("")
    );
}

#[test]
fn json_path_to_string_is_none_for_a_non_string_scalar() {
    assert!(json_path_to_string(&json!(12)).is_none());
    assert!(json_path_to_string(&json!(null)).is_none());
}

#[test]
fn json_message_to_string_joins_the_fragments_biome_emits() {
    let message = json!([
        { "content": "Provide a " },
        { "content": "label" },
    ]);

    assert_eq!(
        json_message_to_string(&message).as_deref(),
        Some("Provide a label")
    );
}

#[test]
fn json_message_to_string_reads_a_plain_string() {
    assert_eq!(
        json_message_to_string(&json!("Provide a label")).as_deref(),
        Some("Provide a label")
    );
}

// ---------------------------------------------------------------------------
// hygiene markers
// ---------------------------------------------------------------------------

#[test]
fn bare_marker_flags_an_unattributed_marker() {
    assert_eq!(bare_marker("// TODO fix this"), Some("TODO"));
    assert_eq!(bare_marker("  // FIXME"), Some("FIXME"));
    assert_eq!(bare_marker("/* HACK around it */"), Some("HACK"));
    assert_eq!(bare_marker("# XXX"), Some("XXX"));
}

#[test]
fn bare_marker_accepts_an_attributed_or_linked_marker() {
    // `TODO(owner)` and a marker carrying a link are tracked work, not rot.
    assert!(bare_marker("// TODO(franck) fix this").is_none());
    assert!(bare_marker("// TODO see http://example.test/issue/1").is_none());
}

#[test]
fn bare_marker_ignores_lines_without_a_marker() {
    assert!(bare_marker("const x = 1;").is_none());
    assert!(bare_marker("// an ordinary comment").is_none());
    // The marker has to start the comment, not merely appear in it.
    assert!(bare_marker("// nothing to do TODO").is_none());
}
