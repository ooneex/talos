// Rendering a task's finish line and extracting the failure excerpt shown
// for a failed task's output — split out of the parent module to keep it
// under the file-size budget.

use console::style;
use regex::Regex;

use crate::utils::Footer;
use crate::utils::monorepo_task::{Task, TaskStatus, format_duration};

pub(super) fn report_finish(task: &Task, footer: &Footer) {
    let (lines, is_error) = finish_lines(task);

    if footer.enabled() {
        footer.task_finished(&task.label, is_error, &lines);
        return;
    }

    if is_error {
        for line in &lines {
            eprintln!("{line}");
        }
    } else {
        for line in &lines {
            println!("{line}");
        }
    }
}

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
