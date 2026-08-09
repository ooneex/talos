// Rendering a task's finish line, extracting the failure excerpt shown for a
// failed task's output, and the static report printed once a `Loader`-driven
// run finishes — split out of the parent module to keep it under the
// file-size budget.

use console::style;
use regex::Regex;

use crate::utils::success;
use crate::utils::workspace_task::{Task, TaskStatus, format_duration};

pub fn finish_lines(task: &Task) -> (Vec<String>, bool) {
    match task.status {
        TaskStatus::Success => (
            vec![format!(
                "{} {}{}",
                style("✔").green(),
                task.label,
                style(format!("  {}", format_duration(task.duration_ms))).dim()
            )],
            false,
        ),
        TaskStatus::Failed => {
            let mut lines = vec![format!(
                "{} {}{}{}",
                style("✖").red(),
                task.label,
                style("  failed").red(),
                style(format!(
                    "  exit {}  {}",
                    task.exit_code.unwrap_or(1),
                    format_duration(task.duration_ms)
                ))
                .dim()
            )];
            for line in failure_excerpt(&task.output) {
                lines.push(format!("{} {line}", style("┃").red()));
            }
            (lines, true)
        }
        TaskStatus::Cached | TaskStatus::Skipped | TaskStatus::Pending => (Vec::new(), false),
    }
}

pub fn failure_excerpt(output: &str) -> Vec<String> {
    let normalized = output.replace('\r', "");
    let lines: Vec<String> = normalized.lines().map(str::to_string).collect();
    let signal = Regex::new(
        r"(?i)\b(?:error|fail(?:ed|ure|s|ing)?|panic|exception|uncaught|unhandled|throw(?:s|n)?|assert\w*|not ok|refus\w*)\b|error TS\d|\(fail\)|[✗✕×✖✘]",
    )
    .expect("the failure signal pattern is valid");
    let noise = Regex::new(r"\(pass\)|^\s*\^+\s*$").expect("the failure-noise pattern is valid");
    let before = 1i64;
    let after = 3i64;
    let max_lines = 120;

    let mut keep = vec![false; lines.len()];
    let mut matched = false;
    for (i, line) in lines.iter().enumerate() {
        if noise.is_match(line) || !signal.is_match(line) {
            continue;
        }
        matched = true;
        let start = (i as i64 - before).max(0) as usize;
        let end = ((i as i64 + after) as usize).min(lines.len().saturating_sub(1));
        for k in keep.iter_mut().take(end + 1).skip(start) {
            *k = true;
        }
    }
    for (i, line) in lines.iter().enumerate() {
        if noise.is_match(line) {
            keep[i] = false;
        }
    }

    if !matched {
        let filtered: Vec<String> = lines
            .iter()
            .filter(|l| !l.trim().is_empty() && !noise.is_match(l))
            .cloned()
            .collect();
        let start = filtered.len().saturating_sub(20);
        return filtered[start..].to_vec();
    }

    let mut excerpt: Vec<String> = Vec::new();
    let mut run: Vec<String> = Vec::new();
    let flush = |run: &mut Vec<String>, excerpt: &mut Vec<String>| {
        while run.first().is_some_and(|l| l.trim().is_empty()) {
            run.remove(0);
        }
        while run.last().is_some_and(|l| l.trim().is_empty()) {
            run.pop();
        }
        if run.is_empty() {
            return;
        }
        if !excerpt.is_empty() {
            excerpt.push("…".to_string());
        }
        excerpt.append(run);
    };
    for (i, line) in lines.iter().enumerate() {
        if keep[i] {
            run.push(line.clone());
        } else {
            flush(&mut run, &mut excerpt);
        }
    }
    flush(&mut run, &mut excerpt);
    excerpt.truncate(max_lines);
    excerpt
}

/// Print a scheduler run's results — one row per task and the output of
/// every one that failed — laid out the same way `lint`'s report is.
pub fn print_task_report(title: &str, tasks: &[Task], logs: bool, elapsed_ms: u64) {
    let ran: Vec<&Task> = tasks
        .iter()
        .filter(|task| {
            matches!(
                task.status,
                TaskStatus::Success | TaskStatus::Cached | TaskStatus::Failed
            )
        })
        .collect();
    let skipped = tasks
        .iter()
        .filter(|task| task.status == TaskStatus::Skipped)
        .count();

    let scope = format!(
        "{} task{} · {}",
        ran.len(),
        if ran.len() == 1 { "" } else { "s" },
        format_duration(elapsed_ms)
    );

    println!();
    println!(
        "{}{}",
        style(format!("▸ {title}")).magenta().bold(),
        style(format!("  {scope}")).dim()
    );

    print_rows(&ran);
    print_failures(&ran, logs);
    println!();
    print_summary(&ran, skipped);
}

fn print_rows(ran: &[&Task]) {
    if ran.is_empty() {
        return;
    }

    let width = ran
        .iter()
        .map(|task| task.label.chars().count())
        .max()
        .unwrap_or(0);

    println!();
    for task in ran {
        let (icon, detail) = match task.status {
            TaskStatus::Success | TaskStatus::Cached => (
                style("✔").green().bold().to_string(),
                style(format_duration(task.duration_ms)).dim().to_string(),
            ),
            TaskStatus::Failed => (
                style("✖").red().bold().to_string(),
                style(format_duration(task.duration_ms)).red().to_string(),
            ),
            TaskStatus::Skipped | TaskStatus::Pending => continue,
        };
        let cached = if task.status == TaskStatus::Cached {
            style(" cached").dim().to_string()
        } else {
            String::new()
        };
        println!(
            "{icon} {}  {detail}{cached}",
            style(format!("{:<width$}", task.label)).bold(),
        );
    }
}

/// The tasks that failed, with their output under `--logs`.
fn print_failures(ran: &[&Task], logs: bool) {
    let broken: Vec<&&Task> = ran
        .iter()
        .filter(|task| task.status == TaskStatus::Failed)
        .collect();
    if broken.is_empty() {
        return;
    }

    println!();
    println!("{}", style("Failing tasks").red().bold());
    for task in broken {
        println!();
        println!(
            "{}  {}",
            style(&task.label).bold().underlined(),
            style(format!("failed  exit {}", task.exit_code.unwrap_or(1))).red()
        );

        if !logs {
            println!("  {}", style("re-run with --logs to see the output").dim());
            continue;
        }
        for line in failure_excerpt(&task.output) {
            println!("  {}", style(line).dim());
        }
    }
}

fn print_summary(ran: &[&Task], skipped: usize) {
    let completed = ran
        .iter()
        .filter(|task| task.status == TaskStatus::Success)
        .count();
    let cached = ran
        .iter()
        .filter(|task| task.status == TaskStatus::Cached)
        .count();
    let broken = ran
        .iter()
        .filter(|task| task.status == TaskStatus::Failed)
        .count();

    let mut parts = vec![format!("{completed} run"), format!("{cached} cached")];
    if skipped > 0 {
        parts.push(format!("{skipped} skipped"));
    }
    let detail = parts.join(" · ");

    if broken == 0 {
        success(format!("Every task ran clean — {detail}"));
        return;
    }

    let message = format!(
        "{broken} task{} failing — {detail}",
        if broken == 1 { "" } else { "s" }
    );
    println!("{} {}", style("✖").red().bold(), style(message).red());
}
