//! Colorized console output, mirroring the level colors/symbols used by
//! `packages/logger/src/TerminalLogger.ts` (`✔` green success, `✖` red error,
//! `⚠` yellow warn, `→`/`▸` blue/cyan informational steps). Built on top of
//! the `console` crate, which `dialoguer`'s `ColorfulTheme` already pulls in,
//! so prompts and status messages share one consistent, `NO_COLOR`-aware
//! terminal styling stack.

use std::io::Write;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use console::{Term, style};

/// Braille spinner frames, mirroring `SPINNER_FRAMES` in
/// `packages/cli/src/utils.ts`.
const SPINNER_FRAMES: [&str; 10] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL: Duration = Duration::from_millis(80);

/// Rust port of `createSpinner` in `packages/cli/src/utils.ts`: an in-place
/// `\r`-redrawn braille spinner for a slow step with no discrete sub-tasks
/// to report progress on (e.g. workspace discovery). A no-op when stdout
/// isn't a TTY, so piped/CI output never gets `\r` noise.
///
/// The cursor is hidden for the duration (it otherwise blinks/jumps over
/// the animated glyph, which reads as visual garbage) and cleanup runs in
/// `Drop`, not just in `stop`, so a panic or early return between `start`
/// and `stop` can never leave an orphaned thread redrawing forever instead
/// of being cleared.
pub struct Spinner {
    stop_flag: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

impl Spinner {
    /// Starts rendering `message` behind a spinner glyph on its own thread.
    pub fn start(message: impl Into<String>) -> Self {
        let message = message.into();
        if !Term::stdout().features().is_attended() {
            return Self {
                stop_flag: Arc::new(AtomicBool::new(false)),
                handle: None,
            };
        }

        print!("\u{1b}[?25l"); // hide cursor
        let stop_flag = Arc::new(AtomicBool::new(false));
        let flag = stop_flag.clone();
        let handle = thread::spawn(move || {
            let mut frame = 0usize;
            while !flag.load(Ordering::Relaxed) {
                print!(
                    "\r\u{1b}[2K{} {message}",
                    SPINNER_FRAMES[frame % SPINNER_FRAMES.len()]
                );
                let _ = std::io::stdout().flush();
                frame += 1;
                thread::sleep(SPINNER_INTERVAL);
            }
        });

        Self {
            stop_flag,
            handle: Some(handle),
        }
    }

    /// Stops the spinner and clears its line, leaving the cursor where the
    /// spinner used to be so the next `println!` starts a clean line.
    /// Equivalent to just letting the `Spinner` drop, but named for
    /// readability at call sites.
    pub fn stop(self) {}
}

impl Drop for Spinner {
    fn drop(&mut self) {
        self.stop_flag.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
            print!("\r\u{1b}[2K\u{1b}[?25h"); // clear the line, show cursor
            let _ = std::io::stdout().flush();
        }
    }
}

/// Prints a green `✔ message` success line to stdout.
pub fn success(message: impl AsRef<str>) {
    println!(
        "{} {}",
        style("✔").green().bold(),
        style(message.as_ref()).green()
    );
}

/// Prints a red `✖ message` error line to stderr.
pub fn error(message: impl AsRef<str>) {
    eprintln!(
        "{} {}",
        style("✖").red().bold(),
        style(message.as_ref()).red()
    );
}

/// Prints a yellow `⚠ message` warning line to stdout.
pub fn warn(message: impl AsRef<str>) {
    println!(
        "{} {}",
        style("⚠").yellow().bold(),
        style(message.as_ref()).yellow()
    );
}

/// Prints a blue `→ message` informational line to stdout.
pub fn info(message: impl AsRef<str>) {
    println!(
        "{} {}",
        style("→").blue().bold(),
        style(message.as_ref()).blue()
    );
}

/// Prints a cyan `▸ message` step/progress line to stdout.
pub fn step(message: impl AsRef<str>) {
    println!(
        "{} {}",
        style("▸").cyan().bold(),
        style(message.as_ref()).cyan()
    );
}
