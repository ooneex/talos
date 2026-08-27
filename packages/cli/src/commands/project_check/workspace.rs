//! Workspace, coverage and end-to-end checks — the `workspace:check` gate,
//! the suites it builds, measured straight after, and the opt-in browser
//! suite that boots the application.
//!
//! The score that gate runs beside its suites lives in [`super::performance`],
//! and is asked for with the very same [`gate_args`].

use std::path::Path;
use std::process::Command;
use std::time::Instant;

use super::modules;
use super::outcome::static_outcome;
use super::types::CheckId;
use super::{CheckOutcome, CheckStatus, E2E_COMMANDS, ERROR_DETAIL, ProjectCheckArgs};
use crate::commands::build::{self, BuildArgs};
use crate::commands::coverage::{self, CoverageAudit, ModuleCoverage, RunStatus, trim_percent};
use crate::commands::install::{self, InstallArgs};
use crate::commands::lint::{self, LintArgs};
use crate::commands::test::{self, TestArgs};
use crate::commands::workspace_check::{self, WorkspaceCheckArgs};
use crate::commands::workspace_run::{self, WorkspaceRunArgs};

// ---------------------------------------------------------------------------
// Workspace — the `workspace:check` gate: install, build, lint, test
// ---------------------------------------------------------------------------

/// The package scripts `project:check` runs before it measures the suites,
/// in order. `workspace:check` itself runs [`install`] and [`build`] the same
/// way, then [`coverage`] and [`lint`] at once instead of `lint` and
/// `test` in sequence — see this module's docs below.
const CHECK_COMMANDS: &str = "install,build,lint,test";

/// The package scripts `workspace:check` runs before it measures anything.
///
/// Every one of them graduated to its own standalone command and cache, so
/// each runs through that implementation directly — [`install`], [`build`],
/// [`lint`] and [`test`] — rather than the generic per-target scheduler in
/// [`workspace_run`], the same as `workspace:check` itself runs them. `test`
/// runs the suites [coverage](check_coverage) skips — a Rust module measures
/// its own coverage with `sh scripts/coverage.sh` rather than through
/// `bun test --coverage`, so `cargo test` here is the only place its suite
/// actually runs.
pub(super) fn check_workspace(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let scope = CHECK_COMMANDS.replace(',', ", ");

    match run_workspace_commands(args, root) {
        Ok(true) => CheckOutcome::new(CheckId::Workspace, CheckStatus::Passed, scope),
        Ok(false) => CheckOutcome::new(CheckId::Workspace, CheckStatus::Failed, scope)
            .with_details(vec![format!(
                "{ERROR_DETAIL}A workspace task failed — the failing task output is printed above"
            )])
            .with_hint("Re-run the failing step alone, e.g. `talos lint --modules=<name> --logs`"),
        Err(message) => CheckOutcome::new(CheckId::Workspace, CheckStatus::Failed, scope)
            .with_details(vec![format!("{ERROR_DETAIL}{message}")]),
    }
}

/// Runs [`CHECK_COMMANDS`] in order, each through its own standalone
/// command, stopping at the first that fails.
fn run_workspace_commands(args: &ProjectCheckArgs, root: &Path) -> Result<bool, String> {
    // In JSON mode the interactive runner would pollute stdout, so each
    // command runs as its own child process and its logs are captured
    // instead.
    if args.json {
        return run_workspace_commands_detached(args, root);
    }

    let cwd = Some(root.to_string_lossy().to_string());
    for command in CHECK_COMMANDS.split(',') {
        let ok = match command {
            "install" => install::execute(&InstallArgs {
                force: false,
                audit_level: None,
                skip_audit: false,
                no_cache: args.no_cache,
                cwd: cwd.clone(),
            }),
            "build" => build::execute(&BuildArgs {
                packages: args.packages.clone(),
                modules: args.modules.clone(),
                logs: args.logs,
                no_cache: args.no_cache,
                cwd: cwd.clone(),
            }),
            "lint" => lint::execute(&LintArgs {
                packages: args.packages.clone(),
                modules: args.modules.clone(),
                logs: args.logs,
                no_cache: args.no_cache,
                cwd: cwd.clone(),
            }),
            "test" => test::execute(&TestArgs {
                packages: args.packages.clone(),
                modules: args.modules.clone(),
                logs: args.logs,
                no_cache: args.no_cache,
                cwd: cwd.clone(),
            }),
            other => unreachable!("{other} is not part of CHECK_COMMANDS"),
        };
        if !ok {
            return Ok(false);
        }
    }
    Ok(true)
}

fn run_workspace_commands_detached(args: &ProjectCheckArgs, root: &Path) -> Result<bool, String> {
    let Ok(exe) = std::env::current_exe() else {
        return Err("Could not locate the talos executable to run the workspace tasks".to_string());
    };

    for command in CHECK_COMMANDS.split(',') {
        let mut cmd = Command::new(&exe);
        cmd.arg(command).arg("--logs").current_dir(root);
        if let Some(packages) = &args.packages {
            cmd.arg(format!("--packages={packages}"));
        }
        if let Some(modules) = &args.modules {
            cmd.arg(format!("--modules={modules}"));
        }
        if args.no_cache {
            cmd.arg("--no-cache");
        }

        match cmd.output() {
            Ok(output) if output.status.success() => continue,
            Ok(_) => return Ok(false),
            Err(err) => return Err(format!("Could not run \"talos {command}\": {err}")),
        }
    }
    Ok(true)
}

// ---------------------------------------------------------------------------
// Coverage — the suites, measured, straight after the gate that built them
// ---------------------------------------------------------------------------

/// Run every suite through `coverage` and report what it covers.
///
/// This is the second half of the `workspace:check` gate, and it runs where that
/// gate runs it: right after the package scripts, on the tree they just built.
/// The measured report is printed in full — ranked worst first, with the files
/// pulling a module down — because a rate is only actionable next to the file
/// that earned it; the row in the summary block then indexes it. Under `--json`
/// nothing is printed and the same findings travel as details.
/// This run's flags, as the gate that owns them reads them.
///
/// Coverage and the performance score are both halves of `workspace:check`,
/// and both are asked for through this: one place to translate the flags, so
/// the suites can never be measured under one set of options and the sources
/// scored under another.
pub(super) fn gate_args(args: &ProjectCheckArgs, root: &Path) -> WorkspaceCheckArgs {
    WorkspaceCheckArgs {
        packages: args.packages.clone(),
        modules: args.modules.clone(),
        logs: args.logs,
        no_cache: args.no_cache,
        threshold: args.threshold,
        concurrency: args.concurrency,
        strict: args.strict,
        // `project:check` owns its own report and never writes the gate's.
        output: None,
        cwd: Some(root.to_string_lossy().to_string()),
    }
}

pub(super) fn check_coverage(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let started_at = Instant::now();
    let audit = match workspace_check::measure(&gate_args(args, root), args.json) {
        Ok(audit) => audit,
        Err(message) => {
            return CheckOutcome::new(CheckId::Coverage, CheckStatus::Skipped, message)
                .with_hint("Scaffold a suite with `talos test:create --module=<name>`");
        }
    };

    if !args.json {
        coverage::print_report(
            &audit,
            args.logs,
            args.strict,
            started_at.elapsed().as_millis() as u64,
            // Only what needs work: the full table belongs to `coverage`,
            // where it is the whole point, not to a report of sixty checks.
            true,
        );
    }

    static_outcome(
        CheckId::Coverage,
        &coverage_scope(&audit),
        &format!("every module clears {}%", trim_percent(audit.threshold)),
        audit.broken().into_iter().map(broken_suite).collect(),
        audit
            .under()
            .into_iter()
            .map(|module| under_covered(module, audit.threshold))
            .collect(),
    )
    .with_hint(coverage_hint(&audit))
}

/// What was measured, which is what every summary line is read against.
fn coverage_scope(audit: &CoverageAudit) -> String {
    let ran = audit.ran().len();
    if ran == 0 {
        return "no suite to measure".to_string();
    }

    format!(
        "{ran} suite{} · {}% lines · {}% functions",
        if ran == 1 { "" } else { "s" },
        trim_percent(audit.lines()),
        trim_percent(audit.functions())
    )
}

/// The one command that takes the reader from the row to the whole story.
fn coverage_hint(audit: &CoverageAudit) -> String {
    let broken = audit.broken();
    if broken.is_empty() {
        return "Inspect every module with `talos coverage`".to_string();
    }

    format!(
        "Re-run the failing suite alone with `talos coverage --modules={} --logs`",
        broken
            .iter()
            .map(|module| module.name.as_str())
            .collect::<Vec<_>>()
            .join(",")
    )
}

fn broken_suite(module: &ModuleCoverage) -> String {
    match &module.status {
        RunStatus::Errored(reason) => format!("{} · {reason}", module.label),
        _ => format!(
            "{} · {} test{} failed",
            module.label,
            module.failed,
            if module.failed == 1 { "" } else { "s" }
        ),
    }
}

fn under_covered(module: &ModuleCoverage, threshold: f64) -> String {
    format!(
        "{} · {:.0}% lines, {:.0}% functions — under {threshold:.0}%",
        module.label, module.lines, module.functions
    )
}

/// Run workspace tasks, keeping stdout clean when the report is JSON.
fn run_tasks(args: &ProjectCheckArgs, root: &Path, commands: &str) -> Result<bool, String> {
    // In JSON mode the interactive runner would pollute stdout, so the very
    // same command runs as a child process and its logs are captured instead.
    if args.json {
        return run_tasks_detached(args, root, commands);
    }

    Ok(workspace_run::execute(&WorkspaceRunArgs {
        commands: Some(commands.to_string()),
        packages: args.packages.clone(),
        modules: args.modules.clone(),
        logs: args.logs,
        no_cache: args.no_cache,
        cwd: Some(root.to_string_lossy().to_string()),
    }))
}

fn run_tasks_detached(
    args: &ProjectCheckArgs,
    root: &Path,
    commands: &str,
) -> Result<bool, String> {
    let Ok(exe) = std::env::current_exe() else {
        return Err("Could not locate the talos executable to run the workspace tasks".to_string());
    };

    let mut command = Command::new(exe);
    command
        .arg("workspace:run")
        .arg(format!("--commands={commands}"))
        .arg("--logs")
        .current_dir(root);
    if let Some(packages) = &args.packages {
        command.arg(format!("--packages={packages}"));
    }
    if let Some(modules) = &args.modules {
        command.arg(format!("--modules={modules}"));
    }
    if args.no_cache {
        command.arg("--no-cache");
    }

    match command.output() {
        Ok(output) => Ok(output.status.success()),
        Err(err) => Err(format!("Could not run the workspace tasks: {err}")),
    }
}

// ---------------------------------------------------------------------------
// End-to-end — the browser suite, opt-in because it boots the application
// ---------------------------------------------------------------------------

/// Modules declaring an `e2e` script, which is what `workspace:run` would run.
pub fn modules_with_e2e(root: &Path) -> Vec<String> {
    modules::discover_modules(root)
        .into_iter()
        .filter(|module| {
            module
                .package_json()
                .and_then(|manifest| manifest.pointer("/scripts/e2e").cloned())
                .is_some()
        })
        .map(|module| module.label())
        .collect()
}

pub(super) fn check_e2e(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let runners = modules_with_e2e(root);
    if runners.is_empty() {
        return CheckOutcome::new(
            CheckId::E2e,
            CheckStatus::Skipped,
            "no module declares an `e2e` script",
        )
        .with_hint("Scaffold one with `talos e2e:create --module=<name>`");
    }

    let summary = format!(
        "{} suite{}",
        runners.len(),
        if runners.len() == 1 { "" } else { "s" }
    );

    match run_tasks(args, root, E2E_COMMANDS) {
        Ok(true) => CheckOutcome::new(CheckId::E2e, CheckStatus::Passed, summary),
        Ok(false) => CheckOutcome::new(CheckId::E2e, CheckStatus::Failed, summary)
            .with_details(runners)
            .with_hint("Re-run alone with `talos e2e:run --modules=<name> --logs`"),
        Err(message) => CheckOutcome::new(CheckId::E2e, CheckStatus::Failed, summary)
            .with_details(vec![message]),
    }
}

#[cfg(test)]
mod check_commands_tests {
    use super::*;

    /// The gate runs the package scripts in this order, plus `test` — the
    /// only place a Rust module's own suite runs, since [`check_coverage`]
    /// skips it.
    #[test]
    fn check_commands_runs_the_scripted_gate_in_order() {
        assert_eq!(CHECK_COMMANDS, "install,build,lint,test");
    }
}

#[cfg(test)]
mod coverage_helpers_tests {
    use std::path::PathBuf;

    use super::*;

    fn module(
        label: &str,
        status: RunStatus,
        lines: f64,
        functions: f64,
        failed: usize,
    ) -> ModuleCoverage {
        ModuleCoverage {
            name: label.rsplit('/').next().unwrap_or(label).to_string(),
            label: label.to_string(),
            dir: PathBuf::from(label),
            status,
            passed: 3,
            failed,
            lines,
            functions,
            files: Vec::new(),
            duration_ms: 0,
            output: String::new(),
            cached: false,
        }
    }

    #[test]
    fn coverage_scope_reports_when_no_suite_ran() {
        let audit = CoverageAudit {
            modules: vec![module(
                "modules/user",
                RunStatus::Errored("boom".to_string()),
                0.0,
                0.0,
                0,
            )],
            threshold: 90.0,
        };

        assert_eq!(coverage_scope(&audit), "no suite to measure");
    }

    #[test]
    fn coverage_scope_summarises_measured_suites() {
        let audit = CoverageAudit {
            modules: vec![
                module("modules/user", RunStatus::Passed, 91.4, 88.6, 0),
                module("packages/cli", RunStatus::Failed, 82.0, 84.0, 2),
            ],
            threshold: 90.0,
        };

        assert_eq!(
            coverage_scope(&audit),
            "2 suites · 86.7% lines · 86.3% functions"
        );
    }

    #[test]
    fn coverage_hint_prefers_the_full_report_when_nothing_broke() {
        let audit = CoverageAudit {
            modules: vec![module("modules/user", RunStatus::Passed, 91.4, 92.0, 0)],
            threshold: 90.0,
        };

        assert_eq!(
            coverage_hint(&audit),
            "Inspect every module with `talos coverage`"
        );
    }

    #[test]
    fn coverage_hint_lists_broken_suite_names() {
        let audit = CoverageAudit {
            modules: vec![
                module("modules/user", RunStatus::Failed, 70.0, 80.0, 2),
                module(
                    "packages/cli",
                    RunStatus::Errored("boom".to_string()),
                    0.0,
                    0.0,
                    0,
                ),
                module("modules/shared", RunStatus::Passed, 91.0, 91.0, 0),
            ],
            threshold: 90.0,
        };

        assert_eq!(
            coverage_hint(&audit),
            "Re-run the failing suite alone with `talos coverage --modules=user,cli --logs`"
        );
    }

    #[test]
    fn broken_suite_formats_errored_and_failed_runs() {
        assert_eq!(
            broken_suite(&module(
                "modules/user",
                RunStatus::Errored("boom".to_string()),
                0.0,
                0.0,
                0,
            )),
            "modules/user · boom"
        );
        assert_eq!(
            broken_suite(&module("packages/cli", RunStatus::Failed, 0.0, 0.0, 1)),
            "packages/cli · 1 test failed"
        );
        assert_eq!(
            broken_suite(&module("packages/sdk", RunStatus::Failed, 0.0, 0.0, 2)),
            "packages/sdk · 2 tests failed"
        );
    }

    #[test]
    fn under_covered_states_the_threshold_gap() {
        assert_eq!(
            under_covered(
                &module("modules/user", RunStatus::Passed, 84.4, 79.6, 0),
                90.0
            ),
            "modules/user · 84% lines, 80% functions — under 90%"
        );
    }
}
