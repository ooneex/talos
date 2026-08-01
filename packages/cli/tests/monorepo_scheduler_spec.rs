//! Unit tests for how a finished task is reported: the excerpt pulled out of a
//! failing suite's output, and the lines each terminal status prints.

use std::path::PathBuf;

use cli::utils::monorepo_scheduler::{failure_excerpt, finish_lines};
use cli::utils::monorepo_task::{Task, TaskStatus};

fn task(status: TaskStatus, output: &str, exit_code: Option<i32>) -> Task {
    Task {
        key: "user#test".to_string(),
        label: "user test".to_string(),
        target_key: Some("user".to_string()),
        command: "bun test".to_string(),
        cwd: PathBuf::from("/repo/modules/user"),
        argv: vec!["bun".to_string(), "test".to_string()],
        cacheable: true,
        deps: Vec::new(),
        status,
        output: output.to_string(),
        exit_code,
        duration_ms: 1234,
        hash: None,
    }
}

// ---------------------------------------------------------------------------
// failure excerpts
// ---------------------------------------------------------------------------

#[test]
fn failure_excerpt_keeps_the_lines_around_a_signal() {
    let output = "\
line one
line two
error: something broke
the detail
more detail
line six
line seven
line eight
";

    let excerpt = failure_excerpt(output);

    assert!(excerpt.contains(&"error: something broke".to_string()));
    // One line of leading context and three trailing.
    assert!(excerpt.contains(&"line two".to_string()));
    assert!(excerpt.contains(&"line six".to_string()));
    assert!(!excerpt.contains(&"line eight".to_string()));
}

#[test]
fn failure_excerpt_recognises_the_usual_failure_words() {
    for signal in [
        "error: boom",
        "FAILED to build",
        "panic: index out of range",
        "Uncaught exception",
        "assertion failed",
        "not ok 3 - the test",
        "✗ the test",
        "src/a.ts(1,1): error TS2322: nope",
    ] {
        let excerpt = failure_excerpt(&format!("fine\n{signal}\nfine\n"));

        assert!(
            excerpt.iter().any(|line| line == signal),
            "{signal} should be treated as a failure signal"
        );
    }
}

#[test]
fn failure_excerpt_drops_passing_noise() {
    let output = "\
(pass) one
error: broke
(pass) two
";

    let excerpt = failure_excerpt(output);

    assert!(excerpt.contains(&"error: broke".to_string()));
    assert!(!excerpt.iter().any(|line| line.contains("(pass)")));
}

#[test]
fn failure_excerpt_separates_distant_runs_with_an_ellipsis() {
    let mut output = String::from("error: first\n");
    for i in 0..20 {
        output.push_str(&format!("filler {i}\n"));
    }
    output.push_str("error: second\n");

    let excerpt = failure_excerpt(&output);

    assert!(excerpt.contains(&"…".to_string()));
    assert!(excerpt.contains(&"error: first".to_string()));
    assert!(excerpt.contains(&"error: second".to_string()));
}

#[test]
fn failure_excerpt_falls_back_to_the_tail_when_nothing_looks_like_a_failure() {
    let mut output = String::new();
    for i in 0..40 {
        output.push_str(&format!("line {i}\n"));
    }

    let excerpt = failure_excerpt(&output);

    // The last twenty non-empty lines, so there is still something to read.
    assert_eq!(excerpt.len(), 20);
    assert_eq!(excerpt.last().map(String::as_str), Some("line 39"));
    assert_eq!(excerpt.first().map(String::as_str), Some("line 20"));
}

#[test]
fn failure_excerpt_normalizes_carriage_returns() {
    let excerpt = failure_excerpt("fine\r\nerror: broke\r\n");

    assert!(excerpt.iter().any(|line| line == "error: broke"));
}

#[test]
fn failure_excerpt_of_empty_output_is_empty() {
    assert!(failure_excerpt("").is_empty());
}

#[test]
fn failure_excerpt_is_capped() {
    let mut output = String::new();
    for i in 0..500 {
        output.push_str(&format!("error {i}\n"));
    }

    assert!(failure_excerpt(&output).len() <= 120);
}

// ---------------------------------------------------------------------------
// finish lines
// ---------------------------------------------------------------------------

#[test]
fn finish_lines_reports_a_success_on_one_line() {
    let (lines, is_error) = finish_lines(&task(TaskStatus::Success, "", None));

    assert!(!is_error);
    assert_eq!(lines.len(), 1);
    assert!(lines[0].contains("user test"));
}

#[test]
fn finish_lines_reports_a_failure_with_its_excerpt() {
    let (lines, is_error) = finish_lines(&task(
        TaskStatus::Failed,
        "fine\nerror: broke\nfine\n",
        Some(2),
    ));

    assert!(is_error);
    assert!(lines[0].contains("user test"));
    assert!(lines[0].contains("failed"));
    assert!(lines[0].contains("exit 2"));
    assert!(lines.iter().any(|line| line.contains("error: broke")));
}

#[test]
fn finish_lines_defaults_a_missing_exit_code_to_one() {
    let (lines, _) = finish_lines(&task(TaskStatus::Failed, "", None));

    assert!(lines[0].contains("exit 1"));
}

#[test]
fn finish_lines_prints_nothing_for_a_status_that_never_ran() {
    for status in [TaskStatus::Cached, TaskStatus::Skipped, TaskStatus::Pending] {
        let (lines, is_error) = finish_lines(&task(status, "", None));

        assert!(lines.is_empty());
        assert!(!is_error);
    }
}
