use std::collections::BTreeSet;
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use console::{Term, style};

const SPINNER_FRAMES: [&str; 10] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL: Duration = Duration::from_millis(80);

/// How wide a loader bar is drawn, in cells.
pub const LOADER_WIDTH: usize = 16;

/// The bar is drawn as a run of slanted segments rather than a solid rule: the
/// gaps between them keep nine bars stacked under each other reading as a
/// measure beside every row instead of a wall, and the empty half stays legible
/// as track rather than disappearing into a hairline.
///
/// Shared so every bar the CLI draws is the same bar.
pub const BAR_FILLED: &str = "▰";
pub const BAR_EMPTY: &str = "▱";

/// How many running labels a group names before it gives up and counts the
/// rest.
const LOADER_NAMES: usize = 3;

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
        Self::start_attended(message)
    }

    fn start_attended(message: String) -> Self {
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

/// One row of a [`Loader`] — a named slice of the work, counted on its own.
pub struct LoaderGroup {
    title: String,
    total: usize,
}

impl LoaderGroup {
    pub fn new(title: impl Into<String>, total: usize) -> Self {
        Self {
            title: title.into(),
            total,
        }
    }
}

/// What one loader row knows about itself, and how it draws.
///
/// The drawing is a pure function of the row and the widths around it, so it is
/// public — the render can be exercised without a terminal or a render thread.
pub struct LoaderRow {
    pub title: String,
    pub total: usize,
    pub done: usize,
    pub running: BTreeSet<String>,
}

impl LoaderRow {
    /// `  ⠹ Architecture  ▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱   5/8  imports, restricted +2`
    pub fn line(&self, frame: &str, title_width: usize, count_width: usize, cols: usize) -> String {
        let done = self.done.min(self.total);
        let filled = (done * LOADER_WIDTH)
            .checked_div(self.total)
            .unwrap_or(LOADER_WIDTH);
        let icon = if !self.running.is_empty() {
            style(frame).cyan().to_string()
        } else if done == self.total {
            style("✔").green().to_string()
        } else {
            style("·").dim().to_string()
        };
        let counts = format!("{done}/{}", self.total);

        let names: Vec<&str> = self
            .running
            .iter()
            .map(String::as_str)
            .take(LOADER_NAMES)
            .collect();
        let hidden = self.running.len().saturating_sub(names.len());
        let mut running = names.join(", ");
        if hidden > 0 {
            running.push_str(&format!(" +{hidden}"));
        }

        // The icon is one cell whatever the escapes around it say, so the
        // printed width is countable without measuring the styled string.
        let used = 2 + 1 + 1 + title_width + 2 + LOADER_WIDTH + 2 + count_width + 2;
        let head = format!(
            "  {icon} {}  {}{}  {}",
            style(format!("{:<title_width$}", self.title)).bold(),
            style(BAR_FILLED.repeat(filled)).green(),
            style(BAR_EMPTY.repeat(LOADER_WIDTH - filled)).dim(),
            style(format!("{counts:>count_width$}")).dim(),
        );
        if running.is_empty() {
            return head;
        }
        format!(
            "{head}  {}",
            style(truncate(&running, cols.saturating_sub(used))).dim()
        )
    }
}

struct LoaderState {
    groups: Vec<LoaderRow>,
    title_width: usize,
    count_width: usize,
    frame: usize,
}

impl LoaderState {
    /// Paint every row, then walk back up so the next frame overwrites it.
    fn paint(&mut self) -> String {
        let cols = usize::from(Term::stdout().size().1);
        let frame = SPINNER_FRAMES[self.frame % SPINNER_FRAMES.len()];
        let mut buf = String::from("\u{1b}[0J");
        for group in &self.groups {
            buf.push_str(&group.line(frame, self.title_width, self.count_width, cols));
            buf.push('\n');
        }
        if !self.groups.is_empty() {
            buf.push_str(&format!("\u{1b}[{}A", self.groups.len()));
        }
        buf.push('\r');
        self.frame = self.frame.wrapping_add(1);
        buf
    }
}

struct LoaderInner {
    state: Mutex<LoaderState>,
    stop: AtomicBool,
    paused: AtomicBool,
    /// Held for the length of one draw, so a caller can pause and know the
    /// render thread is not halfway through a frame.
    draw: Mutex<()>,
}

impl LoaderInner {
    fn draw(&self) {
        let _draw = self.draw.lock().expect("the loader is not poisoned");
        if self.paused.load(Ordering::Relaxed) {
            return;
        }
        let buf = self
            .state
            .lock()
            .expect("the loader is not poisoned")
            .paint();
        print!("{buf}");
        let _ = std::io::stdout().flush();
    }
}

/// A spinner that also knows how much work is left, group by group.
///
/// Where [`Spinner`] fronts one opaque wait, a loader fronts a known number of
/// steps split into named groups — one row each, with the same frames, a bar,
/// its count, and whatever that group has in flight. Sixty steps under one bar
/// says only that time is passing; the same sixty under the headings they are
/// reported by says where the run actually is.
pub struct Loader {
    inner: Option<Arc<LoaderInner>>,
    handle: Option<JoinHandle<()>>,
}

impl Loader {
    /// A loader that draws nothing, for runs that own stdout — `--json` output,
    /// or anything piped somewhere else.
    pub fn hidden() -> Self {
        Self {
            inner: None,
            handle: None,
        }
    }

    /// Start drawing one row per group, in the order they are given.
    pub fn start(groups: Vec<LoaderGroup>) -> Self {
        if groups.is_empty() || !Term::stdout().features().is_attended() {
            return Self::hidden();
        }
        Self::start_attended(groups)
    }

    fn start_attended(groups: Vec<LoaderGroup>) -> Self {
        let inner = Arc::new(LoaderInner {
            state: Mutex::new(LoaderState {
                title_width: groups
                    .iter()
                    .map(|group| group.title.chars().count())
                    .max()
                    .unwrap_or(0),
                count_width: groups
                    .iter()
                    .map(|group| format!("{0}/{0}", group.total).len())
                    .max()
                    .unwrap_or(0),
                groups: groups
                    .into_iter()
                    .map(|group| LoaderRow {
                        title: group.title,
                        total: group.total,
                        done: 0,
                        running: BTreeSet::new(),
                    })
                    .collect(),
                frame: 0,
            }),
            stop: AtomicBool::new(false),
            paused: AtomicBool::new(false),
            draw: Mutex::new(()),
        });

        print!("\u{1b}[?25l");
        let _ = std::io::stdout().flush();
        let rendered = inner.clone();
        let handle = thread::spawn(move || {
            while !rendered.stop.load(Ordering::Relaxed) {
                rendered.draw();
                thread::sleep(SPINNER_INTERVAL);
            }
        });

        Self {
            inner: Some(inner),
            handle: Some(handle),
        }
    }

    /// Name a step that just started in `group`.
    pub fn entered(&self, group: usize, label: impl Into<String>) {
        self.with_group(group, |state| {
            state.running.insert(label.into());
        });
    }

    /// Drop a step's name and count it as finished.
    pub fn left(&self, group: usize, label: &str) {
        self.with_group(group, |state| {
            state.running.remove(label);
            state.done += 1;
        });
    }

    /// Count one step as finished without ever having named it — for work that
    /// owns the terminal while it runs and so is never drawn as running.
    pub fn advance(&self, group: usize) {
        self.with_group(group, |state| state.done += 1);
    }

    fn with_group(&self, group: usize, edit: impl FnOnce(&mut LoaderRow)) {
        let Some(inner) = &self.inner else {
            return;
        };
        let mut state = inner.state.lock().expect("the loader is not poisoned");
        if let Some(group) = state.groups.get_mut(group) {
            edit(group);
        }
    }

    /// Hand the terminal back to whatever prints next.
    ///
    /// Anything that draws more than one line — a nested runner with its own
    /// live display, a child process — has to own the terminal outright, or the
    /// two redraws land on top of each other. Pausing erases the rows, restores
    /// the cursor, and stops the frames until [`resume`](Self::resume).
    pub fn pause(&self) {
        let Some(inner) = &self.inner else {
            return;
        };
        inner.paused.store(true, Ordering::Relaxed);
        let _draw = inner.draw.lock().expect("the loader is not poisoned");
        print!("\u{1b}[0J\u{1b}[?25h");
        let _ = std::io::stdout().flush();
    }

    /// Take the terminal back and start drawing again.
    pub fn resume(&self) {
        let Some(inner) = &self.inner else {
            return;
        };
        let _draw = inner.draw.lock().expect("the loader is not poisoned");
        print!("\u{1b}[?25l");
        let _ = std::io::stdout().flush();
        inner.paused.store(false, Ordering::Relaxed);
    }

    /// Consume the loader. `Drop` is what tears it down, so a panic mid-run
    /// still restores the cursor.
    pub fn stop(self) {}
}

impl Drop for Loader {
    fn drop(&mut self) {
        let Some(inner) = self.inner.take() else {
            return;
        };
        inner.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
        print!("\u{1b}[0J\u{1b}[?25h");
        let _ = std::io::stdout().flush();
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spinner_attended_start_creates_a_running_handle() {
        let spinner = Spinner::start_attended("Loading".to_string());
        assert!(spinner.handle.is_some());
        spinner.stop();
    }

    #[test]
    fn loader_row_uses_done_and_running_state_in_its_line() {
        let mut running = BTreeSet::new();
        running.insert("alpha".to_string());
        running.insert("beta".to_string());
        running.insert("gamma".to_string());
        running.insert("delta".to_string());
        let row = LoaderRow {
            title: "Checks".to_string(),
            total: 8,
            done: 3,
            running,
        };

        let line = row.line("⠋", 6, 3, 120);

        assert!(line.contains("Checks"));
        assert!(line.contains("3/8"));
        assert!(line.contains("alpha"));
        assert!(line.contains("+1"));
    }

    #[test]
    fn loader_state_paint_moves_the_cursor_back_up() {
        let mut state = LoaderState {
            groups: vec![LoaderRow {
                title: "Checks".to_string(),
                total: 1,
                done: 1,
                running: BTreeSet::new(),
            }],
            title_width: 6,
            count_width: 3,
            frame: 0,
        };

        let painted = state.paint();

        assert!(painted.contains("Checks"));
        assert!(painted.contains("\u{1b}[1A"));
        assert_eq!(state.frame, 1);
    }

    #[test]
    fn loader_attended_start_supports_pause_resume_and_progress() {
        let loader = Loader::start_attended(vec![LoaderGroup::new("Checks", 2)]);

        loader.entered(0, "lint");
        loader.left(0, "lint");
        loader.advance(0);
        loader.pause();
        loader.resume();
        loader.stop();
    }

    #[test]
    fn truncate_returns_empty_for_zero_width() {
        assert_eq!(truncate("label", 0), "");
    }
}
