//! Rendering the coverage audit as a console report — one row per module,
//! the least-covered files under threshold, failing suites with their
//! output, and the closing summary line.

use console::style;

use crate::utils::{BAR_EMPTY, BAR_FILLED, LOADER_WIDTH, format_duration, success, warn};

use super::{CoverageAudit, LOG_TAIL_LINES, MAX_LOW_FILES, ModuleCoverage, RunStatus};

// ---------------------------------------------------------------------------
// Report output
// ---------------------------------------------------------------------------

/// Print the measured suites.
///
/// `compact` drops the modules that are already where they should be: a report
/// embedded in a larger one — `project:check` — is read for what needs work,
/// and sixty rows of `100%` bury the five that do. The command's own report
/// keeps every row, because there the table *is* the answer.
pub fn print_report(
    audit: &CoverageAudit,
    logs: bool,
    strict: bool,
    elapsed_ms: u64,
    compact: bool,
) {
    let ran = audit.ran();
    let skipped = audit
        .modules
        .iter()
        .filter(|module| matches!(module.status, RunStatus::Skipped(_)))
        .count();

    let mut scope: Vec<String> = vec![format!(
        "{} module{}",
        ran.len(),
        if ran.len() == 1 { "" } else { "s" }
    )];
    let tests = audit.tests();
    scope.push(format!("{tests} test{}", if tests == 1 { "" } else { "s" }));
    scope.push(format!("threshold {}%", trim_percent(audit.threshold)));
    scope.push(format_duration(elapsed_ms));

    println!();
    println!(
        "{}{}",
        style("▸ Coverage report").magenta().bold(),
        style(format!("  {}", scope.join(" · "))).dim()
    );

    // A run where every suite fell over has no row to draw, but the failures
    // are the whole report — only a run with nothing at all to say stops here.
    if ran.is_empty() && audit.broken().is_empty() {
        println!();
        warn(format!(
            "No suite ran — {skipped} module{} no test suite",
            if skipped == 1 { " carries" } else { "s carry" }
        ));
        return;
    }

    // Worst first either way, so the compact table is the head of the full one:
    // what needs work, and a count of what does not.
    let (rows, hidden): (Vec<&ModuleCoverage>, usize) = if compact {
        (
            ran.iter()
                .copied()
                .filter(|module| {
                    !module.is_covered(audit.threshold) && module.status != RunStatus::Unmeasured
                })
                .collect(),
            ran.iter()
                .filter(|module| module.is_covered(audit.threshold))
                .count(),
        )
    } else {
        (ran.clone(), 0)
    };
    print_rows(audit, &rows, hidden, strict);
    print_low_files(audit, strict);
    print_failures(audit, logs);
    println!();
    print_summary(audit, skipped, strict);
}

/// One row per module: status, a line-coverage bar, both rates, and its tests.
///
/// Under `--strict` a module under the threshold is a failure, and is drawn as
/// one: a red cross where the warning sign was, so the report never contradicts
/// the status the run exits with.
/// The header line above the module table.
fn print_rows_header(width: usize, tests_width: usize) {
    println!();
    println!(
        "  {}  {}  {}  {}  {}  {}",
        style(format!("{:<width$}", "Module")).dim(),
        style(format!("{:<LOADER_WIDTH$}", "")).dim(),
        style(format!("{:>7}", "Lines")).dim(),
        style(format!("{:>7}", "Funcs")).dim(),
        style(format!("{:<tests_width$}", "Tests")).dim(),
        style("Time").dim()
    );
}

/// How a module's suite is named in a report line — `name:coverage`, matching
/// what was run rather than the `label`'s cache-facing `group/name`, the same
/// way `lint` names its rows `name:lint`.
fn script_label(module: &ModuleCoverage) -> String {
    format!("{}:coverage", module.name)
}

/// How a module's tests are counted in its row — the failures when there are
/// any, since those are what the row is read for.
fn tests_text(module: &ModuleCoverage) -> String {
    match module.status {
        RunStatus::Failed => format!("{} failed", module.failed),
        _ => format!("{} passed", module.passed),
    }
}

/// One module's coverage row, including the unmeasured case where there is
/// no rate to draw.
fn print_module_row(
    audit: &CoverageAudit,
    module: &ModuleCoverage,
    width: usize,
    tests_width: usize,
    strict: bool,
) {
    let counts = format!("{:<tests_width$}", tests_text(module));
    let (icon, tests) = match &module.status {
        RunStatus::Failed => (
            style("✖").red().bold().to_string(),
            style(counts).red().to_string(),
        ),
        RunStatus::Unmeasured => (
            style("·").dim().to_string(),
            style(counts).dim().to_string(),
        ),
        _ if module.is_covered(audit.threshold) => (
            style("✔").green().bold().to_string(),
            style(counts).dim().to_string(),
        ),
        _ if strict => (
            style("✖").red().bold().to_string(),
            style(counts).dim().to_string(),
        ),
        _ => (
            style("⚠").yellow().bold().to_string(),
            style(counts).dim().to_string(),
        ),
    };

    // A suite replayed from the cache still reports the time it took when it
    // was measured, so the row says where the number came from — the same
    // marker `lint` and `build` draw.
    let timing = style(format_duration(module.duration_ms)).dim();
    let cached = if module.cached {
        style(" cached").dim().to_string()
    } else {
        String::new()
    };

    // A module bun measured nothing in carries no rate to draw — saying so
    // is truer than printing a 0% it never earned.
    if module.status == RunStatus::Unmeasured {
        // The bar and both rate columns, so the tests column stays aligned.
        let span = LOADER_WIDTH + 18;
        println!(
            "{icon} {}  {}  {tests}  {timing}{cached}",
            style(format!("{:<width$}", script_label(module))).bold(),
            style(format!("{:<span$}", "no code measured")).dim(),
        );
        return;
    }

    println!(
        "{icon} {}  {}  {}  {}  {tests}  {timing}{cached}",
        style(format!("{:<width$}", script_label(module))).bold(),
        bar(module.lines, audit.threshold),
        rate(module.lines, audit.threshold),
        rate(module.functions, audit.threshold),
    );
}

fn print_rows(audit: &CoverageAudit, rows: &[&ModuleCoverage], hidden: usize, strict: bool) {
    // Nothing to show is the good news, and the summary is where a compact
    // report says it — an empty table under a heading says it worse.
    if rows.is_empty() {
        return;
    }

    // The errored modules are drawn under the table against the same label
    // column, so they are measured for it too.
    let errored = || {
        audit
            .modules
            .iter()
            .filter(|module| matches!(module.status, RunStatus::Errored(_)))
    };
    let width = rows
        .iter()
        .copied()
        .chain(errored())
        .map(|module| script_label(module).chars().count())
        .max()
        .unwrap_or(0);

    let tests_width = rows
        .iter()
        .map(|module| tests_text(module).chars().count())
        .chain(std::iter::once("Tests".len()))
        .max()
        .unwrap_or(0);

    print_rows_header(width, tests_width);

    for module in rows {
        print_module_row(audit, module, width, tests_width, strict);
    }

    for module in errored() {
        let RunStatus::Errored(reason) = &module.status else {
            continue;
        };
        println!(
            "{} {}  {}",
            style("✖").red().bold(),
            style(format!("{:<width$}", script_label(module))).bold(),
            style(reason).red()
        );
    }

    if hidden > 0 {
        println!(
            "  {}",
            style(format!(
                "+{hidden} module{} clearing {}%",
                if hidden == 1 { "" } else { "s" },
                trim_percent(audit.threshold)
            ))
            .dim()
        );
    }
}

/// Under every module that misses the threshold, the files that put it there.
fn print_low_files(audit: &CoverageAudit, strict: bool) {
    let under = audit.under();
    if under.is_empty() {
        return;
    }

    let heading = style(format!("Under {}%", trim_percent(audit.threshold))).bold();
    println!();
    println!(
        "{}",
        if strict {
            heading.red()
        } else {
            heading.yellow()
        }
    );

    for module in under {
        let files = module.low_files(audit.threshold);
        println!();
        println!(
            "{}  {}",
            style(script_label(module)).bold().underlined(),
            style(format!(
                "{}% lines · {}% functions",
                trim_percent(module.lines),
                trim_percent(module.functions)
            ))
            .dim()
        );

        if files.is_empty() {
            println!(
                "  {}",
                style("every file clears the threshold — the module average does not").dim()
            );
            continue;
        }

        let width = files
            .iter()
            .take(MAX_LOW_FILES)
            .map(|file| file.path.chars().count())
            .max()
            .unwrap_or(0);

        for file in files.iter().take(MAX_LOW_FILES) {
            let mut line = format!(
                "  {}  {}  {}",
                style(format!("{:<width$}", file.path)).cyan(),
                rate(file.lines, audit.threshold),
                rate(file.functions, audit.threshold)
            );
            if !file.uncovered.is_empty() {
                line.push_str(&format!(
                    "  {}",
                    style(format!(
                        "uncovered {}",
                        truncate(&file.uncovered.join(", "), 60)
                    ))
                    .dim()
                ));
            }
            println!("{line}");
        }

        let hidden = files.len().saturating_sub(MAX_LOW_FILES);
        if hidden > 0 {
            println!(
                "  {}",
                style(format!(
                    "+{hidden} more file{}",
                    if hidden == 1 { "" } else { "s" }
                ))
                .dim()
            );
        }
    }
}

/// The suites that failed, with their output under `--logs`.
fn print_failures(audit: &CoverageAudit, logs: bool) {
    let broken = audit.broken();
    if broken.is_empty() {
        return;
    }

    println!();
    println!("{}", style("Failing suites").red().bold());
    for module in broken {
        let detail = match &module.status {
            RunStatus::Errored(reason) => reason.clone(),
            _ => format!(
                "{} failed, {} passed in {}",
                module.failed,
                module.passed,
                format_duration(module.duration_ms)
            ),
        };
        println!();
        println!(
            "{}  {}",
            style(script_label(module)).bold().underlined(),
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

fn print_summary(audit: &CoverageAudit, skipped: usize, strict: bool) {
    let measured = audit.measured().len();
    let unmeasured = audit.ran().len() - measured;
    let broken = audit.broken().len();
    let under = audit.under().len();

    // Averaging nothing gives 0%, which reads as "measured, and empty" — the
    // opposite of what a run where every suite fell over found.
    let mut parts = vec![if measured == 0 {
        "nothing measured".to_string()
    } else {
        format!(
            "{}% lines, {}% functions across {measured} module{}",
            trim_percent(audit.lines()),
            trim_percent(audit.functions()),
            if measured == 1 { "" } else { "s" }
        )
    }];
    if unmeasured > 0 {
        parts.push(format!("{unmeasured} with no code to measure"));
    }
    if skipped > 0 {
        parts.push(format!("{skipped} skipped"));
    }
    let cached = audit.cached();
    if cached > 0 {
        parts.push(format!("{cached} cached"));
    }
    let detail = parts.join(" · ");

    if broken == 0 && under == 0 {
        success(format!(
            "Every module clears {}% — {detail}",
            trim_percent(audit.threshold)
        ));
        return;
    }

    let mut issues: Vec<String> = Vec::new();
    if broken > 0 {
        issues.push(format!(
            "{broken} suite{} failing",
            if broken == 1 { "" } else { "s" }
        ));
    }
    if under > 0 {
        issues.push(format!(
            "{under} module{} under {}%",
            if under == 1 { "" } else { "s" },
            trim_percent(audit.threshold)
        ));
    }

    // A broken suite fails the run whatever was asked for; a module that only
    // stayed under the threshold fails it under `--strict` alone. The verdict
    // is drawn as the status the run will actually exit with.
    let message = format!("{} — {detail}", issues.join(", "));
    if broken == 0 && !strict {
        println!("{} {}", style("⚠").yellow().bold(), style(message).yellow());
        return;
    }

    println!("{} {}", style("✖").red().bold(), style(message).red());
}

/// `▰▰▰▰▰▰▰▰▰▱▱▱` — the same bar the loaders draw, coloured by how far the rate
/// is from the threshold.
pub fn bar(value: f64, threshold: f64) -> String {
    let filled = ((value / 100.0) * LOADER_WIDTH as f64).round() as usize;
    let filled = filled.min(LOADER_WIDTH);
    let drawn = BAR_FILLED.repeat(filled);
    let empty = style(BAR_EMPTY.repeat(LOADER_WIDTH - filled)).dim();
    let drawn = if value >= threshold {
        style(drawn).green()
    } else if value >= threshold - 15.0 {
        style(drawn).yellow()
    } else {
        style(drawn).red()
    };
    format!("{drawn}{empty}")
}

pub fn rate(value: f64, threshold: f64) -> String {
    let text = format!("{:>6}%", trim_percent(value));
    if value >= threshold {
        style(text).green().to_string()
    } else if value >= threshold - 15.0 {
        style(text).yellow().to_string()
    } else {
        style(text).red().to_string()
    }
}

/// `92.0` reads as noise next to `92`, so a whole percent is printed whole.
pub fn trim_percent(value: f64) -> String {
    if (value - value.round()).abs() < 0.05 {
        return format!("{}", value.round() as i64);
    }
    format!("{value:.1}")
}

pub fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let truncated: String = text.chars().take(max.saturating_sub(1)).collect();
    format!("{}…", truncated.trim_end())
}

pub fn tail(output: &str, lines: usize) -> Vec<&str> {
    let all: Vec<&str> = output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    let start = all.len().saturating_sub(lines);
    all[start..].to_vec()
}
