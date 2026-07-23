//! The live TTY footer for `monorepo:run`: a spinner-animated progress bar
//! pinned to the bottom of the terminal while tasks run, with finished tasks
//! streaming into scrollback above it. This is the Rust equivalent of the
//! `startRenderer`/`buildFooter` pair in
//! `packages/cli/src/commands/MonorepoRunCommand.ts`.
//!
//! Unlike the TypeScript version — which streams each subprocess's stdout and
//! can therefore show the latest log line next to every running task — the
//! Rust scheduler captures a task's output in one shot via `Command::output`,
//! so no partial output exists mid-run. The footer instead shows a spinner
//! and the label of each in-flight task, plus the shared progress bar and a
//! running/failed/elapsed summary.
//!
//! Rendering discipline: exactly one thread writes to stdout at a time. The
//! animation thread and the scheduler thread (via `task_finished`) both hold
//! the same mutex for the whole build-and-write, so a footer redraw can never
//! interleave with a persisted scrollback line. The invariant maintained
//! across every write is "the cursor sits at column 0 of the footer's first
//! line"; every routine clears from there to the end of the screen with
//! `\x1b[0J`, draws, then returns the cursor to that spot, so the next writer
//! can rely on the same starting point. A no-op when stdout isn't a TTY, so
//! piped/CI output keeps the plain scrollback stream with no escape codes.

use std::io::{Write, stdout};
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use console::{Term, style};

use super::monorepo_task::format_duration;

/// Braille spinner frames, matching `SPINNER_FRAMES` in
/// `packages/cli/src/utils.ts` (and the standalone `Spinner` in `style.rs`).
const FRAMES: [&str; 10] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const TICK: Duration = Duration::from_millis(80);
/// Progress bar width in cells, matching `buildFooter`'s `width = 22`.
const BAR_WIDTH: usize = 22;

/// Live progress state shared between the scheduler and the animation thread.
struct FooterState {
    total: usize,
    finished: usize,
    failed: usize,
    running: Vec<String>,
    frame: usize,
}

struct FooterInner {
    state: Mutex<FooterState>,
    stop: AtomicBool,
    started_at: Instant,
}

/// Handle to the live footer. Dropping it (or calling [`Footer::stop`]) stops
/// the animation thread, clears the footer, and restores the cursor.
pub(crate) struct Footer {
    inner: Arc<FooterInner>,
    handle: Option<JoinHandle<()>>,
    enabled: bool,
}

impl Footer {
    /// Starts the footer for a run of `total` tasks. Returns a disabled
    /// (no-op) handle when stdout isn't an interactive terminal, so callers
    /// can unconditionally drive it and fall back to plain scrollback via
    /// [`Footer::enabled`].
    pub(crate) fn start(total: usize) -> Self {
        let inner = Arc::new(FooterInner {
            state: Mutex::new(FooterState {
                total,
                finished: 0,
                failed: 0,
                running: Vec::new(),
                frame: 0,
            }),
            stop: AtomicBool::new(false),
            started_at: Instant::now(),
        });

        if !Term::stdout().features().is_attended() {
            return Self {
                inner,
                handle: None,
                enabled: false,
            };
        }

        print!("\u{1b}[?25l"); // hide cursor
        let _ = stdout().flush();

        let thread_inner = inner.clone();
        let handle = thread::spawn(move || {
            while !thread_inner.stop.load(Ordering::Relaxed) {
                let cols = usize::from(Term::stdout().size().1);
                let elapsed = thread_inner.started_at.elapsed().as_millis() as u64;
                {
                    let mut state = thread_inner.state.lock().unwrap();
                    let mut buf = String::new();
                    paint_footer(&state, cols, elapsed, &mut buf);
                    state.frame = state.frame.wrapping_add(1);
                    print!("{buf}");
                    let _ = stdout().flush();
                }
                thread::sleep(TICK);
            }
        });

        Self {
            inner,
            handle: Some(handle),
            enabled: true,
        }
    }

    /// Whether a live footer is being drawn. `false` means non-interactive
    /// output, so the scheduler should print finish lines to scrollback
    /// itself instead of routing them through [`Footer::task_finished`].
    pub(crate) fn enabled(&self) -> bool {
        self.enabled
    }

    /// Records that a task has started running, so its label appears under the
    /// progress bar with a spinner until it finishes.
    pub(crate) fn task_started(&self, label: &str) {
        if !self.enabled {
            return;
        }
        let mut state = self.inner.state.lock().unwrap();
        state.running.push(label.to_string());
    }

    /// Records that a task has finished, updating the progress counters and
    /// persisting `scrollback` (its finish line and any failure excerpt) above
    /// the footer in one atomic redraw. `scrollback` may be empty for cached
    /// or skipped tasks, which still advance the progress bar but print
    /// nothing.
    pub(crate) fn task_finished(&self, label: &str, failed: bool, scrollback: &[String]) {
        if !self.enabled {
            return;
        }
        let cols = usize::from(Term::stdout().size().1);
        let elapsed = self.inner.started_at.elapsed().as_millis() as u64;
        let mut state = self.inner.state.lock().unwrap();
        if let Some(pos) = state.running.iter().position(|l| l == label) {
            state.running.remove(pos);
        }
        state.finished += 1;
        if failed {
            state.failed += 1;
        }

        let mut buf = String::new();
        buf.push_str("\u{1b}[0J"); // wipe the current footer
        for line in scrollback {
            buf.push_str(line);
            buf.push('\n');
        }
        // Cursor now sits at the footer's first line again; repaint it there
        // so the counters update immediately rather than on the next tick.
        paint_footer(&state, cols, elapsed, &mut buf);
        print!("{buf}");
        let _ = stdout().flush();
    }

    /// Stops the animation thread, clears the footer, and restores the cursor.
    /// Equivalent to dropping the handle, but named for readability at call
    /// sites (mirrors `renderer.stop()` in the TypeScript version).
    pub(crate) fn stop(self) {}
}

impl Drop for Footer {
    fn drop(&mut self) {
        self.inner.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
            print!("\u{1b}[0J\u{1b}[?25h"); // clear the footer, show cursor
            let _ = stdout().flush();
        }
    }
}

/// Clears from the cursor (the footer's first line) to the end of the screen,
/// draws the footer, then returns the cursor to that first line so the next
/// writer starts from the same known position.
fn paint_footer(state: &FooterState, cols: usize, elapsed_ms: u64, buf: &mut String) {
    buf.push_str("\u{1b}[0J");
    let lines = build_footer_lines(state, cols, elapsed_ms);
    for line in &lines {
        buf.push_str(line);
        buf.push('\n');
    }
    if !lines.is_empty() {
        buf.push_str(&format!("\u{1b}[{}A", lines.len()));
    }
    buf.push('\r');
}

/// Builds the footer's lines: a blank spacer, the progress bar with its
/// running/failed/elapsed summary, then one spinner+label line per in-flight
/// task. Mirrors `buildFooter` in `MonorepoRunCommand.ts`.
fn build_footer_lines(state: &FooterState, cols: usize, elapsed_ms: u64) -> Vec<String> {
    let ratio = if state.total == 0 {
        1.0
    } else {
        state.finished as f64 / state.total as f64
    };
    let filled = ((ratio * BAR_WIDTH as f64).round() as usize).min(BAR_WIDTH);
    let filled_glyphs = "█".repeat(filled);
    let bar = format!(
        "{}{}",
        if state.failed > 0 {
            style(filled_glyphs).red()
        } else {
            style(filled_glyphs).green()
        },
        style("░".repeat(BAR_WIDTH - filled)).dim()
    );

    let mut summary = vec![format!("{}/{}", state.finished, state.total)];
    if !state.running.is_empty() {
        summary.push(format!("{} running", state.running.len()));
    }
    if state.failed > 0 {
        summary.push(format!("{} failed", state.failed));
    }

    let mut lines = vec![
        String::new(),
        format!(
            "  {}  {}{}",
            bar,
            style(summary.join(" · ")).cyan(),
            style(format!("  {}", format_duration(elapsed_ms))).dim()
        ),
    ];

    let frame = FRAMES[state.frame % FRAMES.len()];
    for label in &state.running {
        let label = truncate(label, cols.saturating_sub(6));
        lines.push(format!("  {} {}", style(frame).cyan(), label));
    }
    lines
}

/// Truncates a plain (un-styled) label to at most `max` display characters,
/// ending with an ellipsis when shortened, so a long label never wraps and
/// breaks the footer's line-count bookkeeping.
fn truncate(label: &str, max: usize) -> String {
    if max == 0 {
        return String::new();
    }
    if label.chars().count() <= max {
        return label.to_string();
    }
    let kept: String = label.chars().take(max.saturating_sub(1)).collect();
    format!("{kept}…")
}
