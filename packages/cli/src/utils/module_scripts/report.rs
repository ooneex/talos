//! Rendering the audit as a console report — one row per module and the
//! output of every one that failed.

use console::style;

use super::super::{format_duration, success};
use super::{LOG_TAIL_LINES, ModuleScript, ModuleScriptsOptions, ScriptAudit, ScriptStatus};

/// Print the results of a run.
pub fn print_report(
    audit: &ScriptAudit,
    options: &ModuleScriptsOptions,
    logs: bool,
    elapsed_ms: u64,
) {
    let modules = &audit.modules;

    let scope = format!(
        "{} module{} · {}",
        modules.len(),
        if modules.len() == 1 { "" } else { "s" },
        format_duration(elapsed_ms)
    );

    println!();
    println!(
        "{}{}",
        style(format!("▸ {}", options.title)).magenta().bold(),
        style(format!("  {scope}")).dim()
    );

    print_rows(modules, options);
    print_failures(audit, options, logs);
    println!();
    print_summary(audit, options);
}

/// How a module's run is named in a report line — `user:migration:up`,
/// matching the script it runs rather than the `label`'s `modules/user`.
fn script_label(module: &ModuleScript, options: &ModuleScriptsOptions) -> String {
    format!("{}:{}", module.name, options.script)
}

fn print_rows(modules: &[ModuleScript], options: &ModuleScriptsOptions) {
    if modules.is_empty() {
        return;
    }

    let width = modules
        .iter()
        .map(|module| script_label(module, options).chars().count())
        .max()
        .unwrap_or(0);

    println!();
    for module in modules {
        let (icon, detail) = match &module.status {
            ScriptStatus::Succeeded => (
                style("✔").green().bold().to_string(),
                style(format_duration(module.duration_ms)).dim().to_string(),
            ),
            _ => (
                style("✖").red().bold().to_string(),
                style(format_duration(module.duration_ms)).red().to_string(),
            ),
        };
        println!(
            "{icon} {}  {detail}",
            style(format!("{:<width$}", script_label(module, options))).bold(),
        );
    }
}

/// The modules that failed or could not run, with their output under `--logs`.
fn print_failures(audit: &ScriptAudit, options: &ModuleScriptsOptions, logs: bool) {
    let broken = audit.broken();
    if broken.is_empty() {
        return;
    }

    println!();
    println!("{}", style("Failing modules").red().bold());
    for module in broken {
        let detail = match &module.status {
            ScriptStatus::Errored(reason) => reason.clone(),
            _ => format!("{} failed", options.script),
        };
        println!();
        println!(
            "{}  {}",
            style(script_label(module, options)).bold().underlined(),
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

fn print_summary(audit: &ScriptAudit, options: &ModuleScriptsOptions) {
    let succeeded = audit.succeeded();
    let broken = audit.broken().len();

    let detail = format!(
        "{succeeded} module{} {}",
        if succeeded == 1 { "" } else { "s" },
        options.done
    );

    if broken == 0 {
        success(format!("{} — {detail}", options.clean));
        return;
    }

    let message = format!(
        "{broken} module{} failing — {detail}",
        if broken == 1 { "" } else { "s" }
    );
    println!("{} {}", style("✖").red().bold(), style(message).red());
}

fn tail(output: &str, lines: usize) -> Vec<&str> {
    let all: Vec<&str> = output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    let start = all.len().saturating_sub(lines);
    all[start..].to_vec()
}
