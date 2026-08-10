//! Performance check — every function and method the workspace declares,
//! scored on what it will cost when the data grows.
//!
//! The score is the one `performance:check` prints, taken through the same
//! [`workspace_check::score`] the gate asks for it with: same modules, same
//! symbols, same rules, same threshold. Nothing here reads a source file or
//! knows a rule, so the check and the command can never disagree.
//!
//! A rule there fires on a shape rather than on a measurement, so a module
//! under the threshold is a warning and never an error — `--strict` is the
//! caller asking for the threshold to be enforced anyway, and the run already
//! turns every warning into a failure under it.

use std::path::Path;

use super::outcome::static_outcome;
use super::types::CheckId;
use super::workspace::gate_args;
use super::{CheckOutcome, CheckStatus, ProjectCheckArgs};
use crate::commands::coverage::trim_percent;
use crate::commands::performance_check::{ModulePerformance, PerformanceAudit};
use crate::commands::workspace_check;

pub(super) fn check_performance(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    // Always quietly: the audit draws a loader of its own, and this check runs
    // beside the others under the loader the run already owns.
    let audit = match workspace_check::score(&gate_args(args, root), true) {
        Ok(audit) => audit,
        Err(message) => {
            return CheckOutcome::new(CheckId::Performance, CheckStatus::Skipped, message)
                .with_hint("Score one module with `talos performance:check --modules=<name>`");
        }
    };

    outcome(&audit)
}

/// The verdict a scored workspace earns.
///
/// Every module under the threshold is a warning and none of them an error:
/// see this module's docs.
fn outcome(audit: &PerformanceAudit) -> CheckOutcome {
    static_outcome(
        CheckId::Performance,
        &performance_scope(audit),
        &format!("every module clears {}%", trim_percent(audit.threshold)),
        Vec::new(),
        audit
            .under()
            .into_iter()
            .map(|module| under_scored(module, audit.threshold))
            .collect(),
    )
    .with_hint(performance_hint(audit))
}

/// What was scored, which is what every summary line is read against.
fn performance_scope(audit: &PerformanceAudit) -> String {
    let scanned = audit.scanned().len();
    if scanned == 0 {
        return "no source to score".to_string();
    }

    let symbols = audit.symbols();
    format!(
        "{scanned} module{} · {symbols} symbol{} · {}% mean",
        if scanned == 1 { "" } else { "s" },
        if symbols == 1 { "" } else { "s" },
        trim_percent(audit.score())
    )
}

/// The one command that takes the reader from the row to the whole story.
fn performance_hint(audit: &PerformanceAudit) -> String {
    let under = audit.under();
    if under.is_empty() {
        return "Inspect every module with `talos performance:check`".to_string();
    }

    format!(
        "Open the hotspots with `talos performance:check --modules={} --logs`",
        under
            .iter()
            .map(|module| module.name.as_str())
            .collect::<Vec<_>>()
            .join(",")
    )
}

/// A module under the threshold, named with the symbol that dragged it there —
/// a mean is only actionable next to the function that earned it.
fn under_scored(module: &ModulePerformance, threshold: f64) -> String {
    let hotspots = module.hotspots(threshold);
    let line = format!(
        "{} · {}% — under {}% · {} hotspot{}",
        module.label,
        trim_percent(module.score()),
        trim_percent(threshold),
        hotspots.len(),
        if hotspots.len() == 1 { "" } else { "s" }
    );

    match hotspots.first() {
        Some(worst) => format!(
            "{line} · worst {} at {}:{}",
            worst.name, worst.file, worst.line
        ),
        None => line,
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::commands::performance_check::rules::{Finding, RULES};
    use crate::commands::performance_check::symbols::SymbolKind;
    use crate::commands::performance_check::{ScanStatus, SymbolPerformance};

    fn symbol(name: &str, score: f64, findings: Vec<Finding>) -> SymbolPerformance {
        SymbolPerformance {
            kind: SymbolKind::Method,
            name: name.to_string(),
            file: "modules/user/src/user.service.ts".to_string(),
            line: 44,
            span: 30,
            findings,
            suppressed: 0,
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
            duration_ms: 7,
        }
    }

    fn audit(modules: Vec<ModulePerformance>) -> PerformanceAudit {
        PerformanceAudit {
            modules,
            threshold: 90.0,
        }
    }

    #[test]
    fn the_scope_reports_when_there_was_nothing_to_score() {
        let audit = audit(vec![ModulePerformance {
            status: ScanStatus::Skipped("rust module".to_string()),
            ..module("cli", Vec::new())
        }]);

        assert_eq!(performance_scope(&audit), "no source to score");
    }

    #[test]
    fn the_scope_summarises_what_was_scored() {
        let audit = audit(vec![
            module("user", vec![symbol("syncAll", 38.0, Vec::new())]),
            module("billing", vec![symbol("charge", 100.0, Vec::new())]),
        ]);

        assert_eq!(
            performance_scope(&audit),
            "2 modules · 2 symbols · 69% mean"
        );
    }

    #[test]
    fn a_module_under_the_threshold_warns_and_never_errors() {
        let outcome = outcome(&audit(vec![module(
            "user",
            vec![
                symbol("UserService.syncAll", 38.0, Vec::new()),
                symbol("UserService.toDto", 100.0, Vec::new()),
            ],
        )]));

        // A rule fires on a shape, not on a measurement, so nothing here fails
        // a run on its own — `--strict` is what hardens the warning.
        assert_eq!(outcome.status, CheckStatus::Warned);
        assert_eq!(outcome.details.len(), 1);
        assert!(outcome.details[0].starts_with(super::super::WARN_DETAIL));
    }

    #[test]
    fn a_workspace_that_clears_the_threshold_passes() {
        let outcome = outcome(&audit(vec![module(
            "user",
            vec![symbol("toDto", 96.0, Vec::new())],
        )]));

        assert_eq!(outcome.status, CheckStatus::Passed);
        assert_eq!(
            outcome.summary,
            "1 module · 1 symbol · 96% mean · every module clears 90%"
        );
    }

    #[test]
    fn an_under_scored_module_names_the_symbol_that_dragged_it_down() {
        let finding = Finding {
            rule: *RULES
                .iter()
                .find(|rule| rule.id == "perf.query-in-loop")
                .expect("declared"),
            line: 47,
        };
        let module = module(
            "user",
            vec![
                symbol("UserService.toDto", 100.0, Vec::new()),
                symbol("UserService.syncAll", 38.0, vec![finding]),
            ],
        );

        assert_eq!(
            under_scored(&module, 90.0),
            "modules/user · 69% — under 90% · 1 hotspot · worst UserService.syncAll at modules/user/src/user.service.ts:44"
        );
    }

    #[test]
    fn the_hint_names_the_modules_worth_opening() {
        assert_eq!(
            performance_hint(&audit(vec![module(
                "user",
                vec![symbol("toDto", 96.0, Vec::new())]
            )])),
            "Inspect every module with `talos performance:check`"
        );
        assert_eq!(
            performance_hint(&audit(vec![
                module("user", vec![symbol("syncAll", 38.0, Vec::new())]),
                module("billing", vec![symbol("charge", 40.0, Vec::new())]),
            ])),
            "Open the hotspots with `talos performance:check --modules=user,billing --logs`"
        );
    }
}
