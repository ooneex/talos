//! Turning under-covered or failing modules into `Todo`/`Coverage`-labelled
//! issue YAML files, one per module.

use std::fs;

use crate::utils::{IssueYaml, error, generate_issue_id, issue_to_yaml, success};

use super::report::trim_percent;
use super::{CoverageAudit, MAX_LOW_FILES, ModuleCoverage, RunStatus};

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

pub(super) fn create_issues(audit: &CoverageAudit) {
    let mut targets = audit.broken();
    targets.extend(audit.under());

    if targets.is_empty() {
        success(format!(
            "Every module clears {}% — no issues created",
            trim_percent(audit.threshold)
        ));
        return;
    }

    let mut created = 0usize;
    for module in targets {
        let issues_dir = module.dir.join("issues");
        if let Err(err) = fs::create_dir_all(&issues_dir) {
            error(format!("Failed to create {}: {err}", issues_dir.display()));
            continue;
        }

        let id = generate_issue_id(Some(&issues_dir));
        let yaml = issue_to_yaml(&IssueYaml {
            id: Some(id.clone()),
            module: Some(module.name.clone()),
            title: Some(build_issue_title(module, audit.threshold)),
            state: Some("Todo".to_string()),
            priority: Some(priority(module, audit.threshold).to_string()),
            description: Some(build_issue_description(module, audit.threshold)),
            labels: Some(vec![label(module).to_string()]),
        });

        let file_path = issues_dir.join(format!("{id}.yml"));
        if let Err(err) = fs::write(&file_path, yaml) {
            error(format!("Failed to write {}: {err}", file_path.display()));
            continue;
        }
        created += 1;
        success(format!("{} created", file_path.display()));
    }

    println!();
    success(format!(
        "{created} coverage issue{} created",
        if created == 1 { "" } else { "s" }
    ));
}

/// The change-type label the work carries: a red suite is a bug, a thin one is
/// testing work.
pub fn label(module: &ModuleCoverage) -> &'static str {
    match &module.status {
        RunStatus::Failed | RunStatus::Errored(_) => "Bug",
        _ => "Testing",
    }
}

/// How urgent the gap is: a failing suite blocks every other fix, and the wider
/// the gap the sooner it has to close.
pub fn priority(module: &ModuleCoverage, threshold: f64) -> &'static str {
    match &module.status {
        RunStatus::Failed | RunStatus::Errored(_) => "Urgent",
        _ if module.lines < threshold - 25.0 => "High",
        _ => "Medium",
    }
}

pub fn build_issue_title(module: &ModuleCoverage, threshold: f64) -> String {
    match &module.status {
        RunStatus::Failed => format!(
            "Fix {} failing test{} in {}",
            module.failed,
            if module.failed == 1 { "" } else { "s" },
            module.name
        ),
        RunStatus::Errored(reason) => {
            format!("Fix the {} test suite ({reason})", module.name)
        }
        _ => format!(
            "Raise {} test coverage to {}% (currently {}% lines, {}% functions)",
            module.name,
            trim_percent(threshold),
            trim_percent(module.lines),
            trim_percent(module.functions)
        ),
    }
}

pub fn build_issue_description(module: &ModuleCoverage, threshold: f64) -> String {
    let mut lines: Vec<String> = Vec::new();

    match &module.status {
        RunStatus::Failed => lines.push(format!(
            "`bun test` reports {} failing test{} in {}.",
            module.failed,
            if module.failed == 1 { "" } else { "s" },
            module.label
        )),
        RunStatus::Errored(reason) => lines.push(format!(
            "`bun test --coverage` could not report coverage for {}: {reason}.",
            module.label
        )),
        _ => lines.push(format!(
            "{} covers {}% of its lines and {}% of its functions, under the {}% threshold.",
            module.label,
            trim_percent(module.lines),
            trim_percent(module.functions),
            trim_percent(threshold)
        )),
    }

    lines.push(String::new());
    lines.push(format!("- Module: {}", module.label));
    lines.push(format!("- Line coverage: {}%", trim_percent(module.lines)));
    lines.push(format!(
        "- Function coverage: {}%",
        trim_percent(module.functions)
    ));
    lines.push(format!("- Threshold: {}%", trim_percent(threshold)));
    lines.push(format!(
        "- Tests: {} passed, {} failed",
        module.passed, module.failed
    ));
    lines.push(format!(
        "- Command: `talos coverage --modules={}`",
        module.name
    ));

    let low = module.low_files(threshold);
    if !low.is_empty() {
        lines.push(String::new());
        lines.push("Least covered files:".to_string());
        for file in low.iter().take(MAX_LOW_FILES) {
            let mut entry = format!(
                "- `{}` — {}% lines, {}% functions",
                file.path,
                trim_percent(file.lines),
                trim_percent(file.functions)
            );
            if !file.uncovered.is_empty() {
                entry.push_str(&format!(" (uncovered {})", file.uncovered.join(", ")));
            }
            lines.push(entry);
        }
    }

    lines.join("\n")
}
