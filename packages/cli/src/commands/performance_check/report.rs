//! Rendering the performance audit as a console report — one row per module,
//! the symbols that drag it down named under it with what each of them costs,
//! and the closing summary line.

use console::style;

use crate::commands::coverage::{bar, rate, trim_percent, truncate};
use crate::utils::{format_duration, success, warn};

use super::rules::{Finding, Severity};
use super::{
    MAX_FINDINGS, MAX_HOTSPOTS, ModulePerformance, PerformanceAudit, ScanStatus, SymbolPerformance,
};

/// How much of a rule's `cost` line is shown before it is cut.
const MAX_COST: usize = 62;

/// How many lines a rule names before the rest are counted.
const MAX_LINE_NUMBERS: usize = 6;

/// How many modules the hotspot listing covers before the rest are counted.
const MAX_MODULES: usize = 10;

/// The same two budgets inside a report embedded in a larger one, where the
/// listing is a pointer at the worst of it rather than the answer itself.
const MAX_COMPACT_MODULES: usize = 3;
const MAX_COMPACT_HOTSPOTS: usize = 3;

/// Print the scored modules.
///
/// `compact` drops the modules that are already where they should be, for a
/// report embedded in a larger one: sixty rows of `100%` bury the five that
/// need work. The command's own report keeps every row, because there the
/// table *is* the answer.
pub fn print_report(
    audit: &PerformanceAudit,
    logs: bool,
    strict: bool,
    elapsed_ms: u64,
    compact: bool,
) {
    let scanned = audit.scanned();
    let skipped = audit.skipped();

    let symbols = audit.symbols();
    let scope = [
        format!(
            "{} module{}",
            scanned.len(),
            if scanned.len() == 1 { "" } else { "s" }
        ),
        format!("{symbols} symbol{}", if symbols == 1 { "" } else { "s" }),
        format!("threshold {}", trim_percent(audit.threshold)),
        format_duration(elapsed_ms),
    ]
    .join(" · ");

    println!();
    println!(
        "{}{}",
        style("▸ Performance report").magenta().bold(),
        style(format!("  {scope}")).dim()
    );

    if scanned.is_empty() {
        println!();
        warn(format!(
            "Nothing was scored — {skipped} module{} no source to read",
            if skipped == 1 { " carries" } else { "s carry" }
        ));
        return;
    }

    let (rows, hidden): (Vec<&ModulePerformance>, usize) = if compact {
        (
            scanned
                .iter()
                .copied()
                .filter(|module| module.score() < audit.threshold)
                .collect(),
            scanned
                .iter()
                .filter(|module| module.score() >= audit.threshold)
                .count(),
        )
    } else {
        (scanned.clone(), 0)
    };

    print_rows(audit, &rows, hidden, strict);
    print_hotspots(audit, logs, strict, compact);
    println!();
    print_summary(audit, skipped, strict);
}

/// How a module is named in a report line — `name:performance`, matching what
/// was asked for rather than the `label`'s `group/name`, the same way `lint`
/// names its rows `name:lint`.
fn script_label(module: &ModulePerformance) -> String {
    format!("{}:performance", module.name)
}

fn print_rows_header(width: usize, count_width: usize) {
    println!();
    println!(
        "  {}  {}  {}  {}  {}  {}",
        style(format!("{:<width$}", "Module")).dim(),
        style(format!("{:<16}", "")).dim(),
        style(format!("{:>7}", "Score")).dim(),
        style(format!("{:>7}", "Symbols")).dim(),
        style(format!("{:>count_width$}", "Hotspots")).dim(),
        style("Time").dim()
    );
}

fn print_rows(audit: &PerformanceAudit, rows: &[&ModulePerformance], hidden: usize, strict: bool) {
    if rows.is_empty() {
        return;
    }

    let width = rows
        .iter()
        .map(|module| script_label(module).chars().count())
        .max()
        .unwrap_or(0);
    let count_width = "Hotspots".len();

    print_rows_header(width, count_width);

    for module in rows {
        let score = module.score();
        let hotspots = module.hotspots(audit.threshold).len();
        let icon = if score >= audit.threshold {
            style("✔").green().bold().to_string()
        } else if strict {
            style("✖").red().bold().to_string()
        } else {
            style("⚠").yellow().bold().to_string()
        };
        let counted = format!("{hotspots:>count_width$}");
        let counted = if hotspots == 0 {
            style(counted).dim().to_string()
        } else {
            style(counted).yellow().to_string()
        };

        println!(
            "{icon} {}  {}  {}  {}  {counted}  {}",
            style(format!("{:<width$}", script_label(module))).bold(),
            bar(score, audit.threshold),
            rate(score, audit.threshold),
            style(format!("{:>7}", module.leaves().count())).dim(),
            style(format_duration(module.duration_ms)).dim(),
        );
    }

    for module in audit.modules.iter() {
        let ScanStatus::Skipped(reason) = &module.status else {
            continue;
        };
        println!(
            "{} {}  {}",
            style("·").dim(),
            style(format!("{:<width$}", script_label(module))).dim(),
            style(reason).dim()
        );
    }

    if hidden > 0 {
        println!(
            "  {}",
            style(format!(
                "+{hidden} module{} clearing {}",
                if hidden == 1 { "" } else { "s" },
                trim_percent(audit.threshold)
            ))
            .dim()
        );
    }
}

/// How many entries a listing shows: all of them under `--logs`, a pointer at
/// the worst of them inside a larger report, and the standard budget
/// otherwise.
fn shown(total: usize, logs: bool, compact: bool, full: usize, embedded: usize) -> usize {
    match (logs, compact) {
        (true, _) => total,
        (false, true) => embedded,
        (false, false) => full,
    }
}

/// The symbols that miss the threshold, module by module, with what each of
/// them costs.
///
/// This is keyed on the symbols rather than on the modules that fail: a
/// module's score is the mean of everything it declares, so a design system
/// of twenty thousand icons averages a comfortable pass while still holding
/// the slowest function in the workspace. The table above says which modules
/// are in trouble; this says which functions to open.
fn print_hotspots(audit: &PerformanceAudit, logs: bool, strict: bool, compact: bool) {
    let modules: Vec<&ModulePerformance> = audit
        .scanned()
        .into_iter()
        .filter(|module| !module.hotspots(audit.threshold).is_empty())
        .collect();
    if modules.is_empty() {
        return;
    }

    let heading = style(format!("Under {}", trim_percent(audit.threshold))).bold();
    println!();
    println!(
        "{}",
        if strict && !audit.under().is_empty() {
            heading.red()
        } else {
            heading.yellow()
        }
    );

    let listed = shown(
        modules.len(),
        logs,
        compact,
        MAX_MODULES,
        MAX_COMPACT_MODULES,
    );
    for module in modules.iter().take(listed) {
        let hotspots = module.hotspots(audit.threshold);
        println!();
        println!(
            "{}  {}",
            style(script_label(module)).bold().underlined(),
            style(format!(
                "{}% · {} hotspot{}",
                trim_percent(module.score()),
                hotspots.len(),
                if hotspots.len() == 1 { "" } else { "s" }
            ))
            .dim()
        );

        let listed = shown(
            hotspots.len(),
            logs,
            compact,
            MAX_HOTSPOTS,
            MAX_COMPACT_HOTSPOTS,
        );
        let width = hotspots
            .iter()
            .take(listed)
            .map(|symbol| symbol.name.chars().count())
            .max()
            .unwrap_or(0);

        for symbol in hotspots.iter().take(listed) {
            print_hotspot(audit, symbol, width, logs);
        }

        let remaining = hotspots.len().saturating_sub(listed);
        if remaining > 0 {
            println!(
                "  {}",
                style(format!(
                    "+{remaining} more symbol{} under {} — re-run with --logs",
                    if remaining == 1 { "" } else { "s" },
                    trim_percent(audit.threshold)
                ))
                .dim()
            );
        }
    }

    let remaining = modules.len().saturating_sub(listed);
    if remaining > 0 {
        println!();
        println!(
            "  {}",
            style(format!(
                "+{remaining} more module{} with hotspots — re-run with --logs",
                if remaining == 1 { "" } else { "s" }
            ))
            .dim()
        );
    }
}

fn print_hotspot(audit: &PerformanceAudit, symbol: &SymbolPerformance, width: usize, logs: bool) {
    println!(
        "  {}  {}  {}  {}",
        style(format!("{:<width$}", symbol.name)).cyan(),
        style(format!("{}:{}", symbol.file, symbol.line)).dim(),
        rate(symbol.score, audit.threshold),
        style(symbol.kind.label()).dim(),
    );

    let grouped = group(&symbol.findings);
    let shown = if logs { grouped.len() } else { MAX_FINDINGS };
    let cost_width = MAX_COST;
    let rule_width = grouped
        .iter()
        .take(shown)
        .map(|(rule, _)| rule.id.chars().count())
        .max()
        .unwrap_or(0);

    for (rule, lines) in grouped.iter().take(shown) {
        let named: Vec<String> = lines
            .iter()
            .take(MAX_LINE_NUMBERS)
            .map(usize::to_string)
            .collect();
        let more = lines.len().saturating_sub(named.len());
        let mut where_at = format!(
            "line{} {}",
            if lines.len() == 1 { "" } else { "s" },
            named.join(", ")
        );
        if more > 0 {
            where_at.push_str(&format!(" +{more}"));
        }

        println!(
            "    {} {}  {}  {}",
            rule.severity.glyph(),
            rule.severity.styled(format!("{:<rule_width$}", rule.id)),
            style(format!("{:<cost_width$}", truncate(rule.cost, MAX_COST))).dim(),
            style(where_at).dim(),
        );
        if logs {
            println!("      {}", style(rule.hint).dim());
        }
    }

    let remaining = grouped.len().saturating_sub(shown);
    if remaining > 0 {
        println!(
            "    {}",
            style(format!(
                "+{remaining} more rule{}",
                if remaining == 1 { "" } else { "s" }
            ))
            .dim()
        );
    }
}

/// One entry per rule the symbol tripped, worst first, each carrying the lines
/// it fired on — the same rule on eight lines is one problem, not eight.
pub fn group(findings: &[Finding]) -> Vec<(super::rules::Rule, Vec<usize>)> {
    let mut grouped: Vec<(super::rules::Rule, Vec<usize>)> = Vec::new();

    for finding in findings {
        match grouped
            .iter_mut()
            .find(|(rule, _)| rule.id == finding.rule.id)
        {
            Some((_, lines)) => lines.push(finding.line),
            None => grouped.push((finding.rule, vec![finding.line])),
        }
    }

    for (_, lines) in grouped.iter_mut() {
        lines.sort_unstable();
        lines.dedup();
    }
    grouped.sort_by(|(left, left_lines), (right, right_lines)| {
        right
            .severity
            .cmp(&left.severity)
            .then_with(|| right_lines.len().cmp(&left_lines.len()))
            .then_with(|| left.id.cmp(right.id))
    });

    grouped
}

fn print_summary(audit: &PerformanceAudit, skipped: usize, strict: bool) {
    let scanned = audit.scanned().len();
    let under = audit.under().len();
    let findings = audit.findings();

    let mut parts = vec![format!(
        "{}% across {scanned} module{}",
        trim_percent(audit.score()),
        if scanned == 1 { "" } else { "s" }
    )];
    if findings > 0 {
        parts.push(severities(audit));
    }
    if skipped > 0 {
        parts.push(format!("{skipped} skipped"));
    }
    let detail = parts.join(" · ");

    if under == 0 {
        success(format!(
            "Every module clears {} — {detail}",
            trim_percent(audit.threshold)
        ));
        return;
    }

    let message = format!(
        "{under} module{} under {} — {detail}",
        if under == 1 { "" } else { "s" },
        trim_percent(audit.threshold)
    );
    if strict {
        println!("{} {}", style("✖").red().bold(), style(message).red());
        return;
    }
    println!("{} {}", style("⚠").yellow().bold(), style(message).yellow());
}

/// `3 critical, 9 high, 12 moderate` — the severities that actually fired.
fn severities(audit: &PerformanceAudit) -> String {
    [
        Severity::Critical,
        Severity::High,
        Severity::Moderate,
        Severity::Low,
    ]
    .into_iter()
    .filter_map(|severity| {
        let count = audit.count(severity);
        (count > 0).then(|| format!("{count} {}", severity.label()))
    })
    .collect::<Vec<String>>()
    .join(", ")
}

#[cfg(test)]
mod tests {
    use super::super::rules::{RULES, Rule};
    use super::super::symbols::SymbolKind;
    use super::*;
    use std::path::PathBuf;

    fn rule(id: &str) -> Rule {
        *RULES.iter().find(|rule| rule.id == id).expect("declared")
    }

    fn symbol(name: &str, score: f64, findings: Vec<Finding>) -> SymbolPerformance {
        SymbolPerformance {
            kind: SymbolKind::Method,
            name: name.to_string(),
            file: "modules/user/src/user.service.ts".to_string(),
            line: 44,
            span: 20,
            findings,
            score,
        }
    }

    fn module(name: &str, symbols: Vec<SymbolPerformance>) -> ModulePerformance {
        ModulePerformance {
            name: name.to_string(),
            label: format!("modules/{name}"),
            dir: PathBuf::from("modules").join(name),
            status: ScanStatus::Scored,
            symbols,
            files: 2,
            duration_ms: 12,
        }
    }

    #[test]
    fn group_collapses_a_repeated_rule_and_orders_by_severity() {
        let findings = vec![
            Finding {
                rule: rule("perf.long-body"),
                line: 3,
            },
            Finding {
                rule: rule("perf.await-in-loop"),
                line: 9,
            },
            Finding {
                rule: rule("perf.await-in-loop"),
                line: 7,
            },
            Finding {
                rule: rule("perf.query-in-loop"),
                line: 7,
            },
        ];

        let grouped = group(&findings);

        assert_eq!(grouped.len(), 3);
        assert_eq!(grouped[0].0.id, "perf.query-in-loop");
        assert_eq!(grouped[1].0.id, "perf.await-in-loop");
        assert_eq!(grouped[1].1, vec![7, 9]);
        assert_eq!(grouped[2].0.id, "perf.long-body");
    }

    #[test]
    fn group_of_nothing_is_nothing() {
        assert!(group(&[]).is_empty());
    }

    #[test]
    fn a_listing_is_budgeted_by_where_the_report_is_being_read() {
        // `--logs` is the caller asking for everything, whatever else is set.
        assert_eq!(shown(50, true, false, 10, 3), 50);
        assert_eq!(shown(50, true, true, 10, 3), 50);
        // Embedded in a larger report, the listing points at the worst of it.
        assert_eq!(shown(50, false, true, 10, 3), 3);
        // On its own, the listing is the answer.
        assert_eq!(shown(50, false, false, 10, 3), 10);
    }

    #[test]
    fn print_report_handles_every_shape_of_audit_without_panicking() {
        let empty = PerformanceAudit {
            modules: Vec::new(),
            threshold: 90.0,
        };
        print_report(&empty, false, false, 10, false);

        let only_skipped = PerformanceAudit {
            modules: vec![ModulePerformance {
                status: ScanStatus::Skipped("no src/ directory".to_string()),
                ..module("color", Vec::new())
            }],
            threshold: 90.0,
        };
        print_report(&only_skipped, false, false, 10, false);

        let findings: Vec<Finding> = RULES
            .iter()
            .map(|rule| Finding {
                rule: *rule,
                line: 47,
            })
            .collect();
        let mixed = PerformanceAudit {
            modules: vec![
                module(
                    "user",
                    vec![
                        symbol("UserService.syncAll", 28.0, findings),
                        symbol("UserService.toDto", 100.0, Vec::new()),
                    ],
                ),
                module("billing", vec![symbol("charge", 100.0, Vec::new())]),
                ModulePerformance {
                    status: ScanStatus::Skipped("rust module".to_string()),
                    ..module("cli", Vec::new())
                },
            ],
            threshold: 90.0,
        };

        print_report(&mixed, false, false, 100, false);
        print_report(&mixed, true, true, 100, false);
        print_report(&mixed, false, false, 100, true);
    }
}
