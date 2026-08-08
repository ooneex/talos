//! The pieces of the terminal display that draw without a terminal.
//!
//! The loader row, the footer and the task result lines are all pure functions
//! of the state around them, which is what makes them testable: the render
//! thread only starts on an attended terminal, but what it would have drawn can
//! be asked for directly.

use std::collections::BTreeSet;

use cli::utils::linear::priority_name;
use cli::utils::workspace_scheduler::{failure_excerpt, finish_lines};
use cli::utils::{
    FooterState, LoaderRow, Task, TaskStatus, build_footer_lines, error, info, step, success, warn,
};

fn row(title: &str, total: usize, done: usize, running: &[&str]) -> LoaderRow {
    LoaderRow {
        title: title.to_string(),
        total,
        done,
        running: running
            .iter()
            .map(|name| name.to_string())
            .collect::<BTreeSet<_>>(),
    }
}

fn task(label: &str, status: TaskStatus, output: &str) -> Task {
    Task {
        key: format!("modules/user#{label}"),
        label: label.to_string(),
        target_key: Some("modules/user".to_string()),
        command: label.to_string(),
        cwd: std::path::PathBuf::from("."),
        argv: vec!["bun".to_string(), "run".to_string(), label.to_string()],
        cacheable: true,
        deps: Vec::new(),
        status,
        output: output.to_string(),
        exit_code: Some(1),
        duration_ms: 1234,
        hash: None,
    }
}

// ---------------------------------------------------------------------------
// The loader row
// ---------------------------------------------------------------------------

#[test]
fn a_row_with_work_in_flight_shows_the_spinner_and_names_what_is_running() {
    let line = row("Architecture", 8, 5, &["imports", "restricted"]).line("⠹", 12, 3, 120);

    assert!(line.contains("Architecture"), "{line}");
    assert!(line.contains("⠹"), "{line}");
    assert!(line.contains("5/8"), "{line}");
    assert!(line.contains("imports"), "{line}");
    assert!(line.contains("restricted"), "{line}");
}

#[test]
fn a_row_running_more_than_it_can_name_says_how_many_it_left_out() {
    let line = row("Quality", 9, 1, &["a", "b", "c", "d", "e"]).line("⠹", 8, 3, 120);

    assert!(line.contains('+'), "{line}");
}

#[test]
fn a_finished_row_shows_a_tick_and_nothing_running() {
    let line = row("Data", 4, 4, &[]).line("⠹", 8, 3, 120);

    assert!(line.contains('✔'), "{line}");
    assert!(line.contains("4/4"), "{line}");
}

#[test]
fn a_row_that_has_not_started_shows_neither_a_tick_nor_a_spinner() {
    let line = row("Process", 3, 0, &[]).line("⠹", 8, 3, 120);

    assert!(line.contains("0/3"), "{line}");
    assert!(!line.contains('✔'), "{line}");
}

#[test]
fn a_row_with_nothing_to_do_is_drawn_full_rather_than_dividing_by_zero() {
    let line = row("Empty", 0, 0, &[]).line("⠹", 8, 3, 120);

    assert!(line.contains("0/0"), "{line}");
}

#[test]
fn a_narrow_terminal_cuts_the_running_list_instead_of_wrapping_it() {
    let wide = row("Runtime", 4, 1, &["a-very-long-check-name"]).line("⠹", 8, 3, 200);
    let narrow = row("Runtime", 4, 1, &["a-very-long-check-name"]).line("⠹", 8, 3, 50);

    assert!(narrow.len() < wide.len(), "{narrow}");
}

// ---------------------------------------------------------------------------
// The footer
// ---------------------------------------------------------------------------

fn footer(total: usize, finished: usize, failed: usize, running: &[&str]) -> FooterState {
    FooterState {
        total,
        finished,
        failed,
        running: running.iter().map(|name| name.to_string()).collect(),
        frame: 0,
    }
}

#[test]
fn the_footer_shows_the_tally_and_one_line_per_running_task() {
    let lines = build_footer_lines(&footer(10, 4, 0, &["core:build", "user:test"]), 120, 1500);

    assert_eq!(lines.len(), 4, "a blank line, the bar, then the two tasks");
    assert!(lines[1].contains("4/10"), "{lines:?}");
    assert!(lines[1].contains("2 running"), "{lines:?}");
    assert!(lines[2].contains("core:build"), "{lines:?}");
}

#[test]
fn a_failure_is_counted_in_the_footer() {
    let lines = build_footer_lines(&footer(10, 4, 2, &[]), 120, 1500);

    assert!(lines[1].contains("2 failed"), "{lines:?}");
}

#[test]
fn a_footer_with_nothing_to_run_draws_a_full_bar_rather_than_dividing_by_zero() {
    let lines = build_footer_lines(&footer(0, 0, 0, &[]), 120, 0);

    assert_eq!(lines.len(), 2);
    assert!(lines[1].contains("0/0"), "{lines:?}");
}

#[test]
fn a_narrow_footer_cuts_the_task_label() {
    let long = "a-very-long-task-label-that-will-not-fit";

    let wide = build_footer_lines(&footer(2, 0, 0, &[long]), 200, 0);
    let narrow = build_footer_lines(&footer(2, 0, 0, &[long]), 20, 0);

    assert!(narrow[2].len() < wide[2].len(), "{:?}", narrow);
}

// ---------------------------------------------------------------------------
// Task results
// ---------------------------------------------------------------------------

#[test]
fn a_task_that_passed_is_one_line_with_its_duration() {
    let (lines, is_error) = finish_lines(&task("core:build", TaskStatus::Success, ""));

    assert!(!is_error);
    assert_eq!(lines.len(), 1);
    assert!(lines[0].contains("core:build"), "{lines:?}");
    assert!(lines[0].contains('✔'), "{lines:?}");
}

#[test]
fn a_task_that_failed_carries_the_part_of_its_output_that_explains_why() {
    let output = "Running 3 tests\n(pass) adds\n(pass) subtracts\nerror: expected 3 to be 4\n  at tests/index.spec.ts:5\n(pass) multiplies\n";

    let (lines, is_error) = finish_lines(&task("core:test", TaskStatus::Failed, output));

    assert!(is_error);
    assert!(lines[0].contains("failed"), "{lines:?}");
    assert!(
        lines.iter().any(|line| line.contains("expected 3 to be 4")),
        "{lines:?}"
    );
    assert!(
        !lines.iter().any(|line| line.contains("multiplies")),
        "the passing lines are left out: {lines:?}"
    );
}

#[test]
fn a_task_that_was_cached_or_skipped_prints_nothing() {
    for status in [TaskStatus::Cached, TaskStatus::Skipped, TaskStatus::Pending] {
        let (lines, is_error) = finish_lines(&task("core:build", status, ""));
        assert!(lines.is_empty(), "{status:?} printed {lines:?}");
        assert!(!is_error);
    }
}

#[test]
fn an_excerpt_keeps_the_lines_around_every_signal_it_finds() {
    let output =
        "setup\nbefore\nAssertionError: nope\nafter one\nafter two\nafter three\nfar away\n";

    let excerpt = failure_excerpt(output);

    assert!(
        excerpt.iter().any(|line| line.contains("before")),
        "{excerpt:?}"
    );
    assert!(
        excerpt.iter().any(|line| line.contains("AssertionError")),
        "{excerpt:?}"
    );
    assert!(
        excerpt.iter().any(|line| line.contains("after three")),
        "{excerpt:?}"
    );
    assert!(
        !excerpt.iter().any(|line| line.contains("far away")),
        "{excerpt:?}"
    );
}

#[test]
fn an_output_with_no_signal_in_it_yields_an_excerpt_all_the_same() {
    let excerpt = failure_excerpt("just some output\nand some more\n");

    assert!(!excerpt.is_empty(), "the reader still gets something");
}

#[test]
fn carriage_returns_do_not_survive_into_the_excerpt() {
    let excerpt = failure_excerpt("error: broke\r\n");

    assert!(
        excerpt.iter().all(|line| !line.contains('\r')),
        "{excerpt:?}"
    );
}

// ---------------------------------------------------------------------------
// Message helpers
// ---------------------------------------------------------------------------

#[test]
fn every_message_helper_prints_without_needing_a_terminal() {
    success("done");
    error("broken");
    warn("careful");
    info("by the way");
    step("working");
}

// ---------------------------------------------------------------------------
// Linear priorities
// ---------------------------------------------------------------------------

#[test]
fn a_linear_priority_maps_to_the_name_the_issue_files_use() {
    assert_eq!(priority_name(Some(0)).as_deref(), Some("No priority"));
    assert_eq!(priority_name(Some(1)).as_deref(), Some("Urgent"));
    assert_eq!(priority_name(Some(2)).as_deref(), Some("High"));
    assert_eq!(priority_name(Some(3)).as_deref(), Some("Medium"));
    assert_eq!(priority_name(Some(4)).as_deref(), Some("Low"));
    assert_eq!(
        priority_name(Some(9)).as_deref(),
        Some("9"),
        "a value the table does not know is passed through"
    );
    assert_eq!(priority_name(None), None);
}
