use std::process::Command;

use rust_cli::utils::{ensure_bin, run_spinner_step, run_step};

#[test]
fn ensure_bin_finds_a_real_binary() {
    assert!(ensure_bin("git"));
}

#[test]
fn ensure_bin_rejects_a_missing_binary() {
    assert!(!ensure_bin("definitely-not-a-real-binary-talos-rs"));
}

#[test]
fn run_step_succeeds_for_a_zero_exit_command() {
    assert!(run_step(true, "unused", &mut Command::new("true")));
}

#[test]
fn run_step_fails_for_a_non_zero_exit_command() {
    assert!(!run_step(true, "unused", &mut Command::new("false")));
}

#[test]
fn run_step_fails_for_a_missing_binary() {
    assert!(!run_step(
        true,
        "unused",
        &mut Command::new("definitely-not-a-real-binary-talos-rs")
    ));
}

#[test]
fn run_spinner_step_succeeds_for_a_zero_exit_command() {
    assert!(run_spinner_step(true, "step", &mut Command::new("true")));
}

#[test]
fn run_spinner_step_fails_for_a_non_zero_exit_command() {
    assert!(!run_spinner_step(true, "step", &mut Command::new("false")));
}

#[test]
fn run_spinner_step_fails_for_a_missing_binary() {
    assert!(!run_spinner_step(
        true,
        "step",
        &mut Command::new("definitely-not-a-real-binary-talos-rs")
    ));
}
