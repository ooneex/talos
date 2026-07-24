use std::io::{Write, stdout};
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use console::{Term, style};

use super::monorepo_task::format_duration;

const FRAMES: [&str; 10] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const TICK: Duration = Duration::from_millis(80);
const BAR_WIDTH: usize = 22;

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

pub(crate) struct Footer {
    inner: Arc<FooterInner>,
    handle: Option<JoinHandle<()>>,
    enabled: bool,
}

impl Footer {
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

        print!("\u{1b}[?25l");
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

    pub(crate) fn enabled(&self) -> bool {
        self.enabled
    }

    pub(crate) fn task_started(&self, label: &str) {
        if !self.enabled {
            return;
        }
        let mut state = self.inner.state.lock().unwrap();
        state.running.push(label.to_string());
    }

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
        buf.push_str("\u{1b}[0J");
        for line in scrollback {
            buf.push_str(line);
            buf.push('\n');
        }
        paint_footer(&state, cols, elapsed, &mut buf);
        print!("{buf}");
        let _ = stdout().flush();
    }

    pub(crate) fn stop(self) {}
}

impl Drop for Footer {
    fn drop(&mut self) {
        self.inner.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
            print!("\u{1b}[0J\u{1b}[?25h");
            let _ = stdout().flush();
        }
    }
}

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
