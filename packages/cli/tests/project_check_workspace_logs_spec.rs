use cli::commands::project_check::{
    ERROR_DETAIL, WORKSPACE_LOG_LINES, WorkspaceFailure, workspace_failure_details,
};

fn failure(command: &str, output: Option<&str>) -> WorkspaceFailure {
    WorkspaceFailure {
        command: command.to_string(),
        output: output.map(str::to_string),
    }
}

#[test]
fn logs_print_the_failing_output_beneath_its_error() {
    let details = workspace_failure_details(
        &[failure(
            "lint",
            Some("modules/user/src/a.ts(3,1): error TS2322: bad\nlint: 1 error\n"),
        )],
        true,
    );

    assert_eq!(
        details,
        vec![format!(
            "{ERROR_DETAIL}`talos lint` failed\n        modules/user/src/a.ts(3,1): error TS2322: bad\n        lint: 1 error"
        )]
    );
}

#[test]
fn every_failing_step_gets_its_own_entry() {
    let details = workspace_failure_details(
        &[
            failure("build", Some("tsc boom")),
            failure("test", Some("1 fail")),
        ],
        true,
    );

    assert_eq!(details.len(), 2);
    assert!(details[0].starts_with(&format!("{ERROR_DETAIL}`talos build` failed")));
    assert!(details[0].ends_with("tsc boom"));
    assert!(details[1].ends_with("1 fail"));
}

#[test]
fn without_logs_the_output_is_withheld_and_logs_are_suggested() {
    let details = workspace_failure_details(&[failure("lint", Some("noise"))], false);

    assert_eq!(
        details,
        vec![format!(
            "{ERROR_DETAIL}`talos lint` failed — re-run with --logs to print its output here"
        )]
    );
}

#[test]
fn empty_output_adds_nothing_under_logs() {
    let details = workspace_failure_details(&[failure("lint", Some("  \n"))], true);

    assert_eq!(details, vec![format!("{ERROR_DETAIL}`talos lint` failed")]);
}

#[test]
fn long_output_keeps_only_the_trailing_lines() {
    let output = (0..WORKSPACE_LOG_LINES + 5)
        .map(|i| format!("line {i}"))
        .collect::<Vec<_>>()
        .join("\n");
    let details = workspace_failure_details(&[failure("lint", Some(&output))], true);
    let lines: Vec<&str> = details[0].lines().collect();

    assert_eq!(lines.len(), WORKSPACE_LOG_LINES + 2);
    assert_eq!(lines[1].trim(), "… 5 earlier lines omitted");
    assert_eq!(lines[2].trim(), "line 5");
    assert_eq!(
        lines.last().map(|l| l.trim()),
        Some(format!("line {}", WORKSPACE_LOG_LINES + 4)).as_deref()
    );
}
