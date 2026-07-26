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
