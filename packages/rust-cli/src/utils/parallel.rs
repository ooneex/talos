//! Runs a small set of independent actions concurrently, each rendered on its
//! own line with an animated braille spinner that flips to `✔`/`✖` when it
//! finishes. Used by `app:init`/`app:create` to overlap the slow, dependency-
//! free setup steps (`bun install`, `git init`, agent-skills scaffolding)
//! instead of running them one after another, while still giving per-action
//! progress the way the sequential [`Spinner`](super::style::Spinner) does.
//!
//! Action work runs on worker threads and must capture (never stream) its own
//! subprocess output, so the live multi-line display is never corrupted; any
//! captured failure output is returned to the caller to print once the display
//! has been torn down.

use std::io::{Write, stdout};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self};
use std::time::Duration;

use console::{Term, style};

/// Braille spinner frames, matching [`super::style`]'s single-line spinner.
const SPINNER_FRAMES: [&str; 10] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL: Duration = Duration::from_millis(80);

#[derive(Clone, Copy, PartialEq, Eq)]
enum ActionStatus {
    Running,
    Success,
    Failed,
}

/// A single unit of concurrent work with a human-readable label. The closure
/// returns `Ok(())` on success or `Err(message)` on failure, where `message`
/// is the captured output/error surfaced after the live display is cleared.
pub struct Action {
    label: String,
    work: Box<dyn FnOnce() -> Result<(), String> + Send + 'static>,
}

impl Action {
    /// Builds an action from a label and the work to run on a worker thread.
    pub fn new(
        label: impl Into<String>,
        work: impl FnOnce() -> Result<(), String> + Send + 'static,
    ) -> Self {
        Self {
            label: label.into(),
            work: Box::new(work),
        }
    }
}

/// Renders one line per action in place, choosing a spinner glyph for running
/// actions and a colored `✔`/`✖` for finished ones. Assumes the cursor is at
/// the top of the block; leaves it just below the block afterwards.
fn render_lines(labels: &[String], statuses: &[Mutex<ActionStatus>], frame: usize) {
    let mut out = String::new();
    for (index, label) in labels.iter().enumerate() {
        let glyph = match *statuses[index].lock().unwrap() {
            ActionStatus::Running => style(SPINNER_FRAMES[frame % SPINNER_FRAMES.len()])
                .cyan()
                .to_string(),
            ActionStatus::Success => style("✔").green().bold().to_string(),
            ActionStatus::Failed => style("✖").red().bold().to_string(),
        };
        out.push_str(&format!("\r\u{1b}[2K{glyph} {label}\n"));
    }
    print!("{out}");
    let _ = stdout().flush();
}

/// Runs every action concurrently and returns the `(label, error)` pairs for
/// any that failed (empty when all succeed). On an attended terminal each
/// action animates on its own line; otherwise the actions still run in
/// parallel and only their final `✔`/`✖` lines are printed, keeping piped/CI
/// output free of `\r` redraw noise.
pub fn run_actions(actions: Vec<Action>) -> Vec<(String, String)> {
    run_actions_rendered(actions, true)
}

/// Like [`run_actions`] but only renders progress when `render` is `true`.
/// Passing `false` (e.g. for a `--silent` command) still runs every action
/// concurrently but prints nothing, so callers keep parallel speed without any
/// spinner or finish-line output.
pub fn run_actions_rendered(actions: Vec<Action>, render: bool) -> Vec<(String, String)> {
    if actions.is_empty() {
        return Vec::new();
    }

    let count = actions.len();
    let labels: Vec<String> = actions.iter().map(|action| action.label.clone()).collect();
    let statuses: Arc<Vec<Mutex<ActionStatus>>> = Arc::new(
        (0..count)
            .map(|_| Mutex::new(ActionStatus::Running))
            .collect(),
    );
    let errors: Arc<Mutex<Vec<(String, String)>>> = Arc::new(Mutex::new(Vec::new()));

    let mut workers = Vec::with_capacity(count);
    for (index, action) in actions.into_iter().enumerate() {
        let statuses = statuses.clone();
        let errors = errors.clone();
        workers.push(thread::spawn(move || {
            let status = match (action.work)() {
                Ok(()) => ActionStatus::Success,
                Err(message) => {
                    errors.lock().unwrap().push((action.label, message));
                    ActionStatus::Failed
                }
            };
            *statuses[index].lock().unwrap() = status;
        }));
    }

    let attended = render && Term::stdout().features().is_attended();
    let stop = Arc::new(AtomicBool::new(false));
    let renderer = if attended {
        print!("\u{1b}[?25l"); // hide cursor
        render_lines(&labels, &statuses, 0);
        let render_labels = labels.clone();
        let render_statuses = statuses.clone();
        let render_stop = stop.clone();
        Some(thread::spawn(move || {
            let mut frame = 1usize;
            while !render_stop.load(Ordering::Relaxed) {
                thread::sleep(SPINNER_INTERVAL);
                print!("\u{1b}[{count}A"); // back to the top of the block
                render_lines(&render_labels, &render_statuses, frame);
                frame += 1;
            }
        }))
    } else {
        None
    };

    for worker in workers {
        let _ = worker.join();
    }

    if let Some(renderer) = renderer {
        stop.store(true, Ordering::Relaxed);
        let _ = renderer.join();
        print!("\u{1b}[{count}A"); // final repaint of the settled block
        render_lines(&labels, &statuses, 0);
        print!("\u{1b}[?25h"); // show cursor
        let _ = stdout().flush();
    } else if render {
        for (index, label) in labels.iter().enumerate() {
            let glyph = match *statuses[index].lock().unwrap() {
                ActionStatus::Success => style("✔").green().bold().to_string(),
                _ => style("✖").red().bold().to_string(),
            };
            println!("{glyph} {label}");
        }
    }

    Arc::try_unwrap(errors)
        .map(|mutex| mutex.into_inner().unwrap())
        .unwrap_or_default()
}
