use std::io::{Write, stdout};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self};
use std::time::Duration;

use console::{Term, style};

const SPINNER_FRAMES: [&str; 10] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL: Duration = Duration::from_millis(80);

#[derive(Clone, Copy, PartialEq, Eq)]
enum ActionStatus {
    Running,
    Success,
    Failed,
}

pub struct Action {
    label: String,
    work: Box<dyn FnOnce() -> Result<(), String> + Send + 'static>,
}

impl Action {
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

pub fn run_actions(actions: Vec<Action>) -> Vec<(String, String)> {
    run_actions_rendered(actions, true)
}

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
        print!("\u{1b}[?25l");
        render_lines(&labels, &statuses, 0);
        let render_labels = labels.clone();
        let render_statuses = statuses.clone();
        let render_stop = stop.clone();
        Some(thread::spawn(move || {
            let mut frame = 1usize;
            while !render_stop.load(Ordering::Relaxed) {
                thread::sleep(SPINNER_INTERVAL);
                print!("\u{1b}[{count}A");
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
        print!("\u{1b}[{count}A");
        render_lines(&labels, &statuses, 0);
        print!("\u{1b}[?25h");
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
