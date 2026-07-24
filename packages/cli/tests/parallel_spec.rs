use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Barrier, Mutex};

use rust_cli::utils::{Action, run_actions, run_actions_rendered};

#[test]
fn run_actions_reports_no_failures_when_all_succeed() {
    let actions = vec![
        Action::new("first", || Ok(())),
        Action::new("second", || Ok(())),
    ];

    assert!(run_actions(actions).is_empty());
}

#[test]
fn run_actions_returns_empty_for_no_actions() {
    assert!(run_actions(Vec::new()).is_empty());
}

#[test]
fn run_actions_collects_label_and_message_for_failures() {
    let actions = vec![
        Action::new("ok-step", || Ok(())),
        Action::new("bad-step", || Err("boom".to_string())),
    ];

    let failures = run_actions(actions);

    assert_eq!(failures.len(), 1);
    assert_eq!(failures[0].0, "bad-step");
    assert_eq!(failures[0].1, "boom");
}

#[test]
fn run_actions_rendered_without_rendering_still_runs_and_reports() {
    let ran = Arc::new(AtomicUsize::new(0));
    let actions = vec![
        Action::new("a", {
            let ran = ran.clone();
            move || {
                ran.fetch_add(1, Ordering::SeqCst);
                Ok(())
            }
        }),
        Action::new("b", {
            let ran = ran.clone();
            move || {
                ran.fetch_add(1, Ordering::SeqCst);
                Err("nope".to_string())
            }
        }),
    ];

    let failures = run_actions_rendered(actions, false);

    assert_eq!(ran.load(Ordering::SeqCst), 2);
    assert_eq!(failures.len(), 1);
    assert_eq!(failures[0].0, "b");
}

#[test]
fn run_actions_runs_every_action_concurrently() {
    let count = 4;
    let barrier = Arc::new(Barrier::new(count));
    let observed_together = Arc::new(Mutex::new(false));
    let arrived = Arc::new(AtomicUsize::new(0));

    let actions = (0..count)
        .map(|index| {
            let barrier = barrier.clone();
            let observed_together = observed_together.clone();
            let arrived = arrived.clone();
            Action::new(format!("task-{index}"), move || {
                arrived.fetch_add(1, Ordering::SeqCst);
                barrier.wait();
                *observed_together.lock().unwrap() = true;
                Ok(())
            })
        })
        .collect();

    let failures = run_actions(actions);

    assert!(failures.is_empty());
    assert_eq!(arrived.load(Ordering::SeqCst), count);
    assert!(*observed_together.lock().unwrap());
}
