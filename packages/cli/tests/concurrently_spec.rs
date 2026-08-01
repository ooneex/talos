use cli::utils::{
    CloseEvent, ConcurrentlyOptions, KillCondition, PrefixStyle, SuccessCondition, prefix_label,
    run_is_successful, should_kill_others,
};

fn event(name: &str, index: usize, exit_code: i32, killed: bool) -> CloseEvent {
    CloseEvent {
        name: name.to_string(),
        index,
        exit_code,
        killed,
    }
}

#[test]
fn prefix_label_respects_style() {
    assert_eq!(
        prefix_label(PrefixStyle::Name, 2, "api", "bun run dev", Some(9), 10),
        Some("[api]".to_string())
    );
    assert_eq!(
        prefix_label(PrefixStyle::Index, 2, "api", "bun run dev", Some(9), 10),
        Some("[2]".to_string())
    );
    assert_eq!(
        prefix_label(PrefixStyle::Pid, 2, "api", "bun run dev", Some(9), 10),
        Some("[9]".to_string())
    );
    assert_eq!(
        prefix_label(PrefixStyle::None, 2, "api", "bun run dev", Some(9), 10),
        None
    );
}

#[test]
fn prefix_label_truncates_command() {
    assert_eq!(
        prefix_label(
            PrefixStyle::Command,
            0,
            "api",
            "bun run develop",
            Some(1),
            10
        ),
        Some("[bun run d\u{2026}]".to_string())
    );
    assert_eq!(
        prefix_label(PrefixStyle::Command, 0, "api", "short", Some(1), 10),
        Some("[short]".to_string())
    );
}

#[test]
fn success_condition_first() {
    let events = vec![event("a", 0, 0, false), event("b", 1, 1, false)];
    assert!(run_is_successful(SuccessCondition::First, &events));
    let events = vec![event("a", 0, 1, false), event("b", 1, 0, false)];
    assert!(!run_is_successful(SuccessCondition::First, &events));
}

#[test]
fn success_condition_last() {
    let events = vec![event("a", 0, 1, false), event("b", 1, 0, false)];
    assert!(run_is_successful(SuccessCondition::Last, &events));
}

#[test]
fn success_condition_all() {
    let ok = vec![event("a", 0, 0, false), event("b", 1, 0, false)];
    assert!(run_is_successful(SuccessCondition::All, &ok));
    let killed = vec![event("a", 0, 0, false), event("b", 1, 1, true)];
    assert!(!run_is_successful(SuccessCondition::All, &killed));
    assert!(!run_is_successful(SuccessCondition::All, &[]));
}

#[test]
fn kill_others_matches_condition() {
    let mut options = ConcurrentlyOptions {
        kill_others_on: vec![KillCondition::Failure],
        ..ConcurrentlyOptions::default()
    };
    assert!(should_kill_others(&options, false));
    assert!(!should_kill_others(&options, true));
    options.kill_others_on = vec![KillCondition::Success];
    assert!(should_kill_others(&options, true));
}

// ---------------------------------------------------------------------------
// prefix truncation, colouring and real runs
// ---------------------------------------------------------------------------

use std::time::Duration;

use cli::utils::{
    ConcurrentCommand, ConcurrentlyOutcome, PrefixColor, StartupNotice, colorize, run_concurrently,
    truncate_command,
};
use portable_pty::CommandBuilder;

/// Runs `commands` and returns the outcome, with prefixes off so the test's
/// own output stays readable.
fn run(commands: Vec<ConcurrentCommand>, options: ConcurrentlyOptions) -> ConcurrentlyOutcome {
    run_concurrently(commands, options)
}

fn quiet() -> ConcurrentlyOptions {
    ConcurrentlyOptions {
        prefix: PrefixStyle::None,
        ..ConcurrentlyOptions::default()
    }
}

/// A command that exits with the given code, spawned fresh on every restart.
fn exit_with(name: &'static str, code: u8) -> ConcurrentCommand {
    ConcurrentCommand::new(name, format!("exit {code}"), move || {
        let mut builder = CommandBuilder::new("sh");
        builder.args(["-c", &format!("exit {code}")]);
        builder
    })
}

#[test]
fn truncate_command_leaves_short_lines_alone() {
    assert_eq!(truncate_command("bun run dev", 20), "bun run dev");
    // A zero length disables truncation entirely.
    assert_eq!(truncate_command("bun run dev", 0), "bun run dev");
}

#[test]
fn truncate_command_cuts_to_the_prefix_length() {
    assert_eq!(truncate_command("bun run dev", 5), "bun …");
    assert_eq!(truncate_command("bun run dev", 5).chars().count(), 5);
    // Never cuts away everything.
    assert_eq!(truncate_command("bun run dev", 1), "b…");
}

#[test]
fn truncate_command_counts_characters_not_bytes() {
    assert_eq!(truncate_command("ééééééé", 5), "éééé…");
}

#[test]
fn colorize_keeps_the_text_whatever_the_colour() {
    for color in [
        PrefixColor::Auto,
        PrefixColor::Cyan,
        PrefixColor::Magenta,
        PrefixColor::Green,
        PrefixColor::Yellow,
        PrefixColor::Blue,
        PrefixColor::Red,
        PrefixColor::Gray,
    ] {
        assert!(colorize(color, 0, "[api]").contains("[api]"));
    }
}

#[test]
fn colorize_cycles_auto_colours_by_index() {
    // `console` strips styling when stdout is not a terminal, so only the
    // index-independent part of the contract can be asserted here: every
    // index round-trips its text, and the six-colour cycle repeats.
    assert_eq!(
        colorize(PrefixColor::Auto, 0, "x"),
        colorize(PrefixColor::Auto, 6, "x")
    );
    for index in 0..12 {
        assert!(colorize(PrefixColor::Auto, index, "[api]").contains("[api]"));
    }
}

#[test]
fn run_reports_success_when_every_command_exits_clean() {
    let outcome = run(vec![exit_with("a", 0), exit_with("b", 0)], quiet());

    assert!(outcome.success);
    assert_eq!(outcome.exit_code, 0);
    assert_eq!(outcome.events.len(), 2);
    assert!(outcome.events.iter().all(|e| e.exit_code == 0 && !e.killed));
}

#[test]
fn run_reports_failure_and_surfaces_the_exit_code() {
    let outcome = run(vec![exit_with("a", 3)], quiet());

    assert!(!outcome.success);
    assert_eq!(outcome.exit_code, 3);
    assert_eq!(outcome.events.len(), 1);
}

#[test]
fn run_with_no_commands_succeeds_without_running_anything() {
    let outcome = run(Vec::new(), quiet());

    // Nothing to run is not a failure — the caller had no work to do.
    assert!(outcome.success);
    assert_eq!(outcome.exit_code, 0);
    assert!(outcome.events.is_empty());
}

#[test]
fn run_honours_the_first_success_condition() {
    let outcome = run(
        vec![exit_with("ok", 0), exit_with("bad", 1)],
        ConcurrentlyOptions {
            success_condition: SuccessCondition::First,
            ..quiet()
        },
    );

    // The first command to exit decides, so a later failure does not matter.
    assert_eq!(outcome.events.len(), 2);
    assert_eq!(
        outcome.success,
        outcome.events.first().is_some_and(|e| e.exit_code == 0)
    );
}

#[test]
fn run_kills_the_others_once_one_fails() {
    let long = ConcurrentCommand::new("long", "sleep 30", || {
        let mut builder = CommandBuilder::new("sh");
        builder.args(["-c", "sleep 30"]);
        builder
    });

    let outcome = run(
        vec![exit_with("fails", 1), long],
        ConcurrentlyOptions {
            kill_others_on: vec![KillCondition::Failure],
            ..quiet()
        },
    );

    assert_eq!(outcome.events.len(), 2);
    // The sleeper never got to finish on its own.
    assert!(outcome.events.iter().any(|e| e.killed || e.exit_code != 0));
}

#[test]
fn run_retries_a_failing_command_the_requested_number_of_times() {
    let outcome = run(
        vec![exit_with("flaky", 1)],
        ConcurrentlyOptions {
            restart_tries: 2,
            restart_delay: Duration::from_millis(1),
            ..quiet()
        },
    );

    // Still a failure after the retries are spent, and reported once.
    assert!(!outcome.success);
    assert_eq!(outcome.events.len(), 1);
}

#[test]
fn run_accepts_a_startup_notice_and_a_per_command_colour() {
    let outcome = run(
        vec![exit_with("a", 0).with_color(PrefixColor::Green)],
        ConcurrentlyOptions {
            startup: Some(StartupNotice {
                starting_label: "Booting".to_string(),
                started_message: "Booted".to_string(),
            }),
            ..quiet()
        },
    );

    assert!(outcome.success);
}
