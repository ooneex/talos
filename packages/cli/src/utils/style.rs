use std::io::Write;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use console::{Term, style};

const SPINNER_FRAMES: [&str; 10] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL: Duration = Duration::from_millis(80);

/// How wide the loader bar is drawn, in cells.
const LOADER_WIDTH: usize = 16;

pub struct Spinner {
    stop_flag: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

impl Spinner {
    pub fn start(message: impl Into<String>) -> Self {
        let message = message.into();
        if !Term::stdout().features().is_attended() {
            return Self {
                stop_flag: Arc::new(AtomicBool::new(false)),
                handle: None,
            };
        }

        print!("\u{1b}[?25l");
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

    pub fn stop(self) {}
}

impl Drop for Spinner {
    fn drop(&mut self) {
        self.stop_flag.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
            print!("\r\u{1b}[2K\u{1b}[?25h");
            let _ = std::io::stdout().flush();
        }
    }
}

struct LoaderState {
    stop: AtomicBool,
    done: AtomicUsize,
    total: usize,
    unit: String,
    message: Mutex<String>,
}

impl LoaderState {
    fn line(&self, frame: usize) -> String {
        let done = self.done.load(Ordering::Relaxed).min(self.total);
        let filled = (done * LOADER_WIDTH)
            .checked_div(self.total)
            .unwrap_or(LOADER_WIDTH);
        let bar = format!(
            "{}{}",
            "█".repeat(filled),
            "░".repeat(LOADER_WIDTH - filled)
        );
        let message = self.message.lock().expect("the loader is not poisoned");

        format!(
            "{} {} {}{}",
            style(SPINNER_FRAMES[frame % SPINNER_FRAMES.len()]).cyan(),
            style(bar).cyan(),
            style(format!("{done}/{} {}", self.total, self.unit)).bold(),
            if message.is_empty() {
                String::new()
            } else {
                format!("  {}", style(&*message).dim())
            }
        )
    }
}

/// A spinner that also knows how much work is left.
///
/// Where [`Spinner`] fronts one opaque wait, a loader fronts a known number of
/// steps: it draws the same frames next to a bar, the count, and whatever the
/// caller last named as in flight.
pub struct Loader {
    state: Option<Arc<LoaderState>>,
    handle: Option<JoinHandle<()>>,
}

impl Loader {
    /// A loader that draws nothing, for runs that own stdout — `--json` output,
    /// or anything piped somewhere else.
    pub fn hidden() -> Self {
        Self {
            state: None,
            handle: None,
        }
    }

    pub fn start(total: usize, unit: impl Into<String>) -> Self {
        if !Term::stdout().features().is_attended() {
            return Self::hidden();
        }

        let state = Arc::new(LoaderState {
            stop: AtomicBool::new(false),
            done: AtomicUsize::new(0),
            total,
            unit: unit.into(),
            message: Mutex::new(String::new()),
        });
        let rendered = state.clone();
        print!("\u{1b}[?25l");
        let handle = thread::spawn(move || {
            let mut frame = 0usize;
            while !rendered.stop.load(Ordering::Relaxed) {
                print!("\r\u{1b}[2K{}", rendered.line(frame));
                let _ = std::io::stdout().flush();
                frame += 1;
                thread::sleep(SPINNER_INTERVAL);
            }
        });

        Self {
            state: Some(state),
            handle: Some(handle),
        }
    }

    /// Name what is in flight right now. An empty message drops the suffix.
    pub fn set_message(&self, message: impl Into<String>) {
        if let Some(state) = &self.state {
            *state.message.lock().expect("the loader is not poisoned") = message.into();
        }
    }

    /// Count one step as finished.
    pub fn advance(&self) {
        if let Some(state) = &self.state {
            state.done.fetch_add(1, Ordering::Relaxed);
        }
    }

    /// Erase the line so a caller can print underneath it. The next frame
    /// redraws it.
    pub fn clear(&self) {
        if self.state.is_some() {
            print!("\r\u{1b}[2K");
            let _ = std::io::stdout().flush();
        }
    }

    /// Consume the loader. `Drop` is what tears it down, so a panic mid-run
    /// still restores the cursor.
    pub fn stop(self) {}
}

impl Drop for Loader {
    fn drop(&mut self) {
        let Some(state) = self.state.take() else {
            return;
        };
        state.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
        print!("\r\u{1b}[2K\u{1b}[?25h");
        let _ = std::io::stdout().flush();
    }
}

pub fn success(message: impl AsRef<str>) {
    println!(
        "{} {}",
        style("✔").green().bold(),
        style(message.as_ref()).green()
    );
}

pub fn error(message: impl AsRef<str>) {
    eprintln!(
        "{} {}",
        style("✖").red().bold(),
        style(message.as_ref()).red()
    );
}

pub fn warn(message: impl AsRef<str>) {
    println!(
        "{} {}",
        style("⚠").yellow().bold(),
        style(message.as_ref()).yellow()
    );
}

pub fn info(message: impl AsRef<str>) {
    println!(
        "{} {}",
        style("→").blue().bold(),
        style(message.as_ref()).blue()
    );
}

pub fn step(message: impl AsRef<str>) {
    println!(
        "{} {}",
        style("▸").cyan().bold(),
        style(message.as_ref()).cyan()
    );
}
