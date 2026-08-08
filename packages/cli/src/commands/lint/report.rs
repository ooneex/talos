//! Rendering the lint audit as a console report — one row per module and the
//! output of every one that failed.

use console::style;

use crate::utils::{format_duration, success, warn};

use super::{LOG_TAIL_LINES, LintAudit, LintStatus, ModuleLint};

/// Print the lint results.
pub fn print_report(audit: &LintAudit, logs: bool, elapsed_ms: u64) {
    let ran = audit.ran();
    let skipped = audit
        .modules
        .iter()
        .filter(|module| matches!(module.status, LintStatus::Skipped(_)))
        .count();

    let scope = format!(
        "{} module{} · {}",
        ran.len(),
        if ran.len() == 1 { "" } else { "s" },
        format_duration(elapsed_ms)
    );

    println!();
    println!(
        "{}{}",
        style("▸ Lint report").magenta().bold(),
        style(format!("  {scope}")).dim()
    );

    if ran.is_empty() && audit.broken().is_empty() {
        println!();
        warn(format!(
            "No module ran — {skipped} module{} no lint script",
            if skipped == 1 { " carries" } else { "s carry" }
        ));
        return;
    }

    print_rows(&ran);
    print_failures(audit, logs);
    println!();
    print_summary(audit, skipped);
}

fn print_rows(ran: &[&ModuleLint]) {
    if ran.is_empty() {
        return;
    }

    let width = ran
        .iter()
        .map(|module| module.label.chars().count())
        .max()
        .unwrap_or(0);

    println!();
    for module in ran {
        let (icon, detail) = match &module.status {
            LintStatus::Passed => (
                style("✔").green().bold().to_string(),
                style(format_duration(module.duration_ms)).dim().to_string(),
            ),
            LintStatus::Failed => (
                style("✖").red().bold().to_string(),
                style(format_duration(module.duration_ms)).red().to_string(),
            ),
            _ => continue,
        };
        let cached = if module.cached {
            style(" cached").dim().to_string()
        } else {
            String::new()
        };
        println!(
            "{icon} {}  {detail}{cached}",
            style(format!("{:<width$}", module.label)).bold(),
        );
    }
}

/// The modules that failed or could not run, with their output under `--logs`.
fn print_failures(audit: &LintAudit, logs: bool) {
    let broken = audit.broken();
    if broken.is_empty() {
        return;
    }

    println!();
    println!("{}", style("Failing modules").red().bold());
    for module in broken {
        let detail = match &module.status {
            LintStatus::Errored(reason) => reason.clone(),
            _ => "lint failed".to_string(),
        };
        println!();
        println!(
            "{}  {}",
            style(&module.label).bold().underlined(),
            style(detail).red()
        );

        if !logs {
            println!("  {}", style("re-run with --logs to see the output").dim());
            continue;
        }
        for line in tail(&module.output, LOG_TAIL_LINES) {
            println!("  {}", style(line).dim());
        }
    }
}

fn print_summary(audit: &LintAudit, skipped: usize) {
    let passed = audit
        .modules
        .iter()
        .filter(|module| module.status == LintStatus::Passed)
        .count();
    let broken = audit.broken().len();

    let mut parts = vec![format!(
        "{passed} module{} clean",
        if passed == 1 { "" } else { "s" }
    )];
    if skipped > 0 {
        parts.push(format!("{skipped} skipped"));
    }
    let cached = audit.cached();
    if cached > 0 {
        parts.push(format!("{cached} cached"));
    }
    let detail = parts.join(" · ");

    if broken == 0 {
        success(format!("Every module is clean — {detail}"));
        return;
    }

    let message = format!(
        "{broken} module{} failing — {detail}",
        if broken == 1 { "" } else { "s" }
    );
    println!("{} {}", style("✖").red().bold(), style(message).red());
}

pub fn tail(output: &str, lines: usize) -> Vec<&str> {
    let all: Vec<&str> = output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    let start = all.len().saturating_sub(lines);
    all[start..].to_vec()
}
