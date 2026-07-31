use cli::utils::{
    BAR_EMPTY, BAR_FILLED, BAR_WIDTH, FooterState, build_footer_lines, format_duration,
};

fn state(finished: usize, total: usize, failed: usize, running: &[&str]) -> FooterState {
    FooterState {
        total,
        finished,
        failed,
        running: running.iter().map(|name| name.to_string()).collect(),
        frame: 0,
    }
}

/// The footer draws the same bar as the loader — slanted segments, filled then
/// track — so the two displays read as one measure.
#[test]
fn draws_the_bar_as_slanted_segments() {
    let lines = build_footer_lines(&state(11, 22, 0, &[]), 120, 0);
    assert!(lines[1].contains(&format!(
        "{}{}",
        BAR_FILLED.repeat(11),
        BAR_EMPTY.repeat(11)
    )));
}

#[test]
fn rounds_the_fill_to_the_nearest_cell_and_never_overflows() {
    for (finished, total, filled) in [(0, 22, 0), (1, 22, 1), (1, 3, 7), (22, 22, BAR_WIDTH)] {
        let lines = build_footer_lines(&state(finished, total, 0, &[]), 120, 0);
        assert_eq!(
            lines[1].matches(BAR_FILLED).count(),
            filled,
            "{finished}/{total} should fill {filled} cells"
        );
        assert_eq!(lines[1].matches(BAR_EMPTY).count(), BAR_WIDTH - filled);
    }
}

/// Nothing to run is a full bar, not a division by zero.
#[test]
fn fills_the_bar_when_there_is_no_work() {
    let lines = build_footer_lines(&state(0, 0, 0, &[]), 120, 0);
    assert_eq!(lines[1].matches(BAR_FILLED).count(), BAR_WIDTH);
    assert!(lines[1].contains("0/0"));
}

#[test]
fn summarises_the_counts_beside_the_bar() {
    let lines = build_footer_lines(&state(5, 10, 2, &["design", "spa"]), 120, 1_500);
    assert!(
        lines[1].contains("5/10 · 2 running · 2 failed"),
        "{}",
        lines[1]
    );
    assert!(lines[1].contains(&format_duration(1_500)));
}

/// One line per running task, under the bar, each spinning on the same frame.
#[test]
fn lists_the_running_tasks_under_the_bar() {
    let lines = build_footer_lines(&state(1, 4, 0, &["design", "spa"]), 120, 0);
    assert_eq!(lines.len(), 4);
    assert!(lines[2].contains("design"));
    assert!(lines[3].contains("spa"));
    assert!(lines[2].contains('⠋'));
}

#[test]
fn truncates_a_task_label_to_the_terminal_width() {
    let lines = build_footer_lines(&state(1, 4, 0, &["a-very-long-task-label"]), 16, 0);
    assert!(lines[2].contains('…'), "{}", lines[2]);
    assert!(!lines[2].contains("a-very-long-task-label"));
}
