use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Barrier, Condvar, Mutex};
use std::thread;
use std::time::Duration;

use cli::utils::{Action, run_actions, run_actions_rendered, run_actions_rendered_limited};

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

#[test]
fn run_actions_rendered_limited_caps_how_many_run_at_once() {
    const LIMIT: usize = 2;
    const TOTAL: usize = 6;

    let state = Arc::new((Mutex::new(0usize), Condvar::new()));
    let peak = Arc::new(AtomicUsize::new(0));
    let release = Arc::new(AtomicBool::new(false));
    let exceeded = Arc::new(AtomicBool::new(false));

    let observer_state = Arc::clone(&state);
    let observer_release = Arc::clone(&release);
    let observer = thread::spawn(move || {
        let (lock, cv) = &*observer_state;
        let mut running = lock.lock().unwrap();
        while *running < LIMIT {
            running = cv.wait(running).unwrap();
        }
        drop(running);
        thread::yield_now();
        observer_release.store(true, Ordering::SeqCst);
    });

    let actions = (0..TOTAL)
        .map(|index| {
            let state = Arc::clone(&state);
            let peak = Arc::clone(&peak);
            let release = Arc::clone(&release);
            let exceeded = Arc::clone(&exceeded);
            Action::new(format!("task-{index}"), move || {
                let (lock, cv) = &*state;
                {
                    let mut running = lock.lock().unwrap();
                    *running += 1;
                    if *running > LIMIT {
                        exceeded.store(true, Ordering::SeqCst);
                    }
                    peak.fetch_max(*running, Ordering::SeqCst);
                    cv.notify_all();
                }
                while !release.load(Ordering::SeqCst) {
                    thread::sleep(Duration::from_millis(1));
                }
                let mut running = lock.lock().unwrap();
                *running -= 1;
                cv.notify_all();
                Ok(())
            })
        })
        .collect();

    let failures = run_actions_rendered_limited(actions, false, Some(LIMIT));
    observer.join().expect("observer");

    assert!(failures.is_empty());
    assert!(!exceeded.load(Ordering::SeqCst));
    assert_eq!(peak.load(Ordering::SeqCst), LIMIT);
}

#[test]
fn run_actions_rendered_limited_still_reports_failures() {
    let failures = run_actions_rendered_limited(
        vec![
            Action::new("ok", || Ok(())),
            Action::new("bad", || Err("boom".to_string())),
            Action::new("ok-2", || Ok(())),
        ],
        false,
        Some(1),
    );

    assert_eq!(failures, vec![("bad".to_string(), "boom".to_string())]);
}
