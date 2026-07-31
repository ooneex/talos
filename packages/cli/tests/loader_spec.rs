use cli::utils::{BAR_EMPTY, BAR_FILLED, LOADER_WIDTH, LoaderRow};

fn row(done: usize, total: usize, running: &[&str]) -> LoaderRow {
    LoaderRow {
        title: "Architecture".to_string(),
        total,
        done,
        running: running.iter().map(|name| name.to_string()).collect(),
    }
}

/// The bar is a run of slanted segments — filled, then track — and always
/// `LOADER_WIDTH` cells wide whatever the ratio.
#[test]
fn draws_the_bar_as_slanted_segments() {
    let line = row(4, 8, &[]).line("⠹", 12, 3, 120);
    assert!(line.contains(&format!("{}{}", BAR_FILLED.repeat(8), BAR_EMPTY.repeat(8))));
    assert_eq!(line.matches(BAR_FILLED).count(), 8);
    assert_eq!(line.matches(BAR_EMPTY).count(), 8);
}

#[test]
fn fills_the_bar_in_proportion_to_the_work_done() {
    for (done, total, filled) in [(0, 8, 0), (2, 8, 4), (8, 8, 16), (1, 3, 5)] {
        let line = row(done, total, &[]).line("⠹", 12, 3, 120);
        assert_eq!(
            line.matches(BAR_FILLED).count(),
            filled,
            "{done}/{total} should fill {filled} cells"
        );
        assert_eq!(line.matches(BAR_EMPTY).count(), LOADER_WIDTH - filled);
    }
}

/// A group with nothing to do is finished, not empty — dividing by zero would
/// otherwise leave the bar blank forever.
#[test]
fn fills_the_bar_of_an_empty_group() {
    let line = row(0, 0, &[]).line("⠹", 12, 3, 120);
    assert_eq!(line.matches(BAR_FILLED).count(), LOADER_WIDTH);
    assert!(line.contains("0/0"));
}

#[test]
fn marks_the_row_running_then_done() {
    assert!(row(2, 8, &["imports"]).line("⠹", 12, 3, 120).contains('⠹'));
    assert!(row(8, 8, &[]).line("⠹", 12, 3, 120).contains('✔'));
    assert!(row(2, 8, &[]).line("⠹", 12, 3, 120).contains('·'));
}

#[test]
fn names_the_running_checks_and_counts_the_rest() {
    let line =
        row(2, 8, &["boundaries", "container", "imports", "restricted"]).line("⠹", 12, 3, 120);
    assert!(line.contains("boundaries, container, imports +1"), "{line}");
    assert!(line.contains("2/8"));
}

/// The running names are what gives when the terminal is narrow — the bar and
/// the counts are the measure and stay whole.
#[test]
fn truncates_the_running_names_to_the_terminal_width() {
    let line = row(2, 8, &["a-very-long-check-name"]).line("⠹", 12, 3, 48);
    assert!(line.contains('…'), "{line}");
    assert_eq!(line.matches(BAR_EMPTY).count(), 12);
}
