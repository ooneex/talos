//! Writing the format run's results to `var/outputs/talos_fmt.{md,json}` —
//! the same report the terminal draws, in the shape an agent is handed to fix
//! what it lists.
//!
//! See [`crate::utils::AgentReport`] for the shape every command's report
//! shares.

use crate::utils::{
    AgentReport, ReportEntry, ReportSection, ReportStatus, SummaryRow, Task, TaskStatus,
    report_logs,
};

use super::FmtArgs;

/// How the file is named, before `--output` picks its extension.
pub const FILE_STEM: &str = "talos_fmt";

/// Rebuild the command that produced this report, so the file can tell the
/// agent how to check its own work.
///
/// `--output` is deliberately dropped: the agent re-runs the format to see
/// whether it is green, not to overwrite the file it is reading.
pub fn command_line(args: &FmtArgs) -> String {
    let mut parts = vec!["talos fmt".to_string()];
    if let Some(packages) = &args.packages {
        parts.push(format!("--packages={packages}"));
    }
    if let Some(modules) = &args.modules {
        parts.push(format!("--modules={modules}"));
    }
    if args.logs {
        parts.push("--logs".to_string());
    }
    if args.no_cache {
        parts.push("--no-cache".to_string());
    }
    parts.join(" ")
}

/// Gather what the format run found into the report an agent works from.
pub fn report(args: &FmtArgs, tasks: &[Task], elapsed_ms: u64) -> AgentReport {
    let broken: Vec<&Task> = tasks
        .iter()
        .filter(|task| matches!(task.status, TaskStatus::Failed | TaskStatus::CachedFailure))
        .collect();
    let ran = tasks
        .iter()
        .filter(|task| task.status == TaskStatus::Success)
        .count();
    let cached = tasks
        .iter()
        .filter(|task| matches!(task.status, TaskStatus::Cached | TaskStatus::CachedFailure))
        .count();

    AgentReport {
        tool: "talos fmt".to_string(),
        stem: FILE_STEM.to_string(),
        command: command_line(args),
        elapsed_ms,
        passed: broken.is_empty(),
        summary: vec![SummaryRow {
            label: "Fmt".to_string(),
            key: "fmt".to_string(),
            status: if broken.is_empty() {
                ReportStatus::Pass
            } else {
                ReportStatus::Fail
            },
            found: format!(
                "{ran} target{} formatted · {cached} cached · {} failing",
                if ran == 1 { "" } else { "s" },
                broken.len()
            ),
        }],
        sections: vec![ReportSection {
            title: "Fmt failures".to_string(),
            key: "fmtFailures".to_string(),
            blurb: "each target below could not be formatted — biome reported a file it \
                    cannot parse, or the script itself fell over"
                .to_string(),
            entries: broken.iter().map(|task| entry(task)).collect(),
        }],
    }
}

/// `modules/user` → `user`, the name a selector needs.
fn target_name(task: &Task) -> String {
    task.label
        .rsplit_once(':')
        .map(|(name, _)| name.to_string())
        .unwrap_or_else(|| task.label.clone())
}

/// `--packages=color` for a target under `packages/`, `--modules=user`
/// otherwise — a task with no target at all is re-run by the whole command.
fn selector(task: &Task) -> String {
    let name = target_name(task);
    match task.target_key.as_deref() {
        Some(key) if key.starts_with("packages/") => format!("--packages={name}"),
        Some(_) => format!("--modules={name}"),
        None => String::new(),
    }
}

fn entry(task: &Task) -> ReportEntry {
    let reason = match task.exit_code {
        Some(code) => format!("the fmt script exited {code} — the output below says why"),
        None => "the fmt script could not be run — the output below says why".to_string(),
    };
    let rerun = match selector(task) {
        selector if selector.is_empty() => "talos fmt --logs".to_string(),
        selector => format!("talos fmt {selector} --logs"),
    };

    ReportEntry {
        name: target_name(task),
        path: task.target_key.clone().unwrap_or_else(|| task.key.clone()),
        reason,
        rerun,
        details: Vec::new(),
        logs: report_logs(&task.output),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn task(label: &str, target_key: Option<&str>, status: TaskStatus) -> Task {
        Task {
            key: format!("{}#fmt", target_key.unwrap_or("root")),
            label: label.to_string(),
            target_key: target_key.map(str::to_string),
            command: "fmt".to_string(),
            cwd: PathBuf::from("."),
            argv: vec!["bun".to_string(), "run".to_string(), "fmt".to_string()],
            cacheable: true,
            deps: Vec::new(),
            status,
            output: "boom".to_string(),
            exit_code: Some(1),
            duration_ms: 5,
            hash: None,
        }
    }

    #[test]
    fn a_failing_package_is_re_run_by_its_own_selector() {
        let failing = task("color:fmt", Some("packages/color"), TaskStatus::Failed);
        let entry = entry(&failing);

        assert_eq!(entry.name, "color");
        assert_eq!(entry.path, "packages/color");
        assert_eq!(entry.rerun, "talos fmt --packages=color --logs");
        assert_eq!(entry.logs, "boom");
    }

    #[test]
    fn a_failing_module_is_re_run_by_its_own_selector() {
        let failing = task("user:fmt", Some("modules/user"), TaskStatus::Failed);
        assert_eq!(entry(&failing).rerun, "talos fmt --modules=user --logs");
    }

    #[test]
    fn the_report_carries_only_the_failing_tasks() {
        let tasks = vec![
            task("color:fmt", Some("packages/color"), TaskStatus::Failed),
            task("user:fmt", Some("modules/user"), TaskStatus::Success),
            task("app:fmt", Some("modules/app"), TaskStatus::Cached),
        ];
        let args = FmtArgs {
            packages: None,
            modules: None,
            logs: false,
            no_cache: false,
            output: None,
            cwd: None,
        };

        let report = report(&args, &tasks, 40);

        assert!(!report.passed);
        assert_eq!(report.sections[0].entries.len(), 1);
        assert_eq!(report.sections[0].entries[0].name, "color");
        assert_eq!(
            report.summary[0].found,
            "1 target formatted · 1 cached · 1 failing"
        );
    }
}
