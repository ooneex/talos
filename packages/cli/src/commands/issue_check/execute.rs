//! Top-level run orchestration: collecting issues per owner, executing every
//! check, and rendering the console or JSON report.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use console::style;
use serde_json::json;

use crate::utils::{current_dir, error, info, success};

use super::checks::{
    check_dependency_cycles, check_duplicate_branches, check_duplicate_ids, check_issue,
};
use super::loading::{discover_owners, load_issue, read_module_type, relative_to};
use super::{CheckReport, Diagnostic, IssueCheckArgs, IssueOwner, LoadedIssue, Severity};

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/// Everything a run needs, kept separate from the clap args so `execute` can be
/// driven directly from tests.
#[derive(Debug, Default)]
pub struct CheckOptions {
    pub modules: Vec<String>,
    pub ids: Vec<String>,
}

/// A stray-file diagnostic for one issue owner: `rule`/`message` describe
/// what is wrong with `path`.
fn stray_diagnostic(
    root: &Path,
    owner: &IssueOwner,
    path: &Path,
    rule: &'static str,
    message: String,
) -> Diagnostic {
    Diagnostic {
        file: relative_to(root, path),
        module: owner.name.clone(),
        issue: String::new(),
        severity: Severity::Error,
        rule,
        line: None,
        message,
    }
}

/// Scans one owner's `issues/` directory, loading every `<ID>.yml` file and
/// reporting anything else found there as a stray diagnostic (only when the
/// module is in scope, so filtered-out modules stay quiet).
fn collect_owner_issues(
    root: &Path,
    owner: &IssueOwner,
    selected_module: bool,
) -> (Vec<LoadedIssue>, Vec<Diagnostic>) {
    let mut issues = Vec::new();
    let mut stray = Vec::new();

    let Ok(entries) = fs::read_dir(&owner.issues_dir) else {
        stray.push(stray_diagnostic(
            root,
            owner,
            &owner.issues_dir,
            "issue.directory.unreadable",
            "Cannot read the issues directory".to_string(),
        ));
        return (issues, stray);
    };

    let mut paths: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
    paths.sort();

    for path in paths {
        let name = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default();
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            if selected_module {
                stray.push(stray_diagnostic(
                    root,
                    owner,
                    &path,
                    "issue.directory.nested",
                    "Issue directories only hold `<ID>.yml` files".to_string(),
                ));
            }
            continue;
        }
        if path.extension().and_then(|ext| ext.to_str()) != Some("yml") {
            if selected_module {
                stray.push(stray_diagnostic(
                    root,
                    owner,
                    &path,
                    "issue.file.extension",
                    format!("`{name}` is not an issue file; expected `<ID>.yml`"),
                ));
            }
            continue;
        }
        issues.push(load_issue(root, &owner.name, &path));
    }

    (issues, stray)
}

pub fn normalize(values: &[String]) -> Vec<String> {
    values
        .iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect()
}

/// Check every issue file under `root`, honouring the module/id filters. The
/// whole project is always loaded so cross-file rules stay correct even when
/// only a subset is reported on.
pub fn execute(root: &Path, options: &CheckOptions) -> CheckReport {
    let owners = discover_owners(root);
    let module_filter = normalize(&options.modules);
    let id_filter = normalize(&options.ids);

    let mut issues: Vec<LoadedIssue> = Vec::new();
    let mut stray: Vec<Diagnostic> = Vec::new();
    let mut module_types: HashMap<String, String> = HashMap::new();
    let mut checked_modules: BTreeSet<String> = BTreeSet::new();

    for owner in &owners {
        let selected_module = module_filter.is_empty() || module_filter.contains(&owner.name);
        module_types.insert(
            owner.name.clone(),
            read_module_type(&owner.dir, &owner.name).unwrap_or_else(|| "module".to_string()),
        );

        let (mut owner_issues, owner_stray) = collect_owner_issues(root, owner, selected_module);
        issues.append(&mut owner_issues);
        stray.extend(owner_stray);
    }

    let index: HashMap<String, Vec<String>> =
        issues.iter().fold(HashMap::new(), |mut index, issue| {
            if let Some(id) = issue.id.as_deref() {
                index
                    .entry(id.to_string())
                    .or_default()
                    .push(issue.relative.clone());
            }
            index
        });

    let selected: HashSet<String> = issues
        .iter()
        .filter(|issue| {
            (module_filter.is_empty() || module_filter.contains(&issue.module))
                && (id_filter.is_empty()
                    || id_filter.iter().any(|id| {
                        *id == issue.stem || issue.id.as_deref().is_some_and(|value| value == id)
                    }))
        })
        .map(|issue| issue.relative.clone())
        .collect();

    let mut diagnostics: Vec<Diagnostic> = stray;
    for issue in &issues {
        if !selected.contains(&issue.relative) {
            continue;
        }
        checked_modules.insert(issue.module.clone());
        diagnostics.extend(issue.fatal.iter().cloned());
        let module_type = module_types
            .get(&issue.module)
            .map(String::as_str)
            .unwrap_or("module");
        diagnostics.extend(check_issue(issue, module_type, &index));
    }

    diagnostics.extend(check_duplicate_ids(&issues, &selected));
    diagnostics.extend(check_duplicate_branches(&issues, &selected));
    diagnostics.extend(check_dependency_cycles(&issues, &selected));

    diagnostics.sort_by(|left, right| {
        left.file
            .cmp(&right.file)
            .then(left.line.cmp(&right.line))
            .then(right.severity.cmp(&left.severity))
            .then(left.rule.cmp(right.rule))
    });

    CheckReport {
        diagnostics,
        files: selected.len(),
        modules: checked_modules.len(),
    }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

fn print_report(report: &CheckReport) {
    println!(
        "{}{}",
        style("▸ Issue check").magenta().bold(),
        style(format!(
            "  {} issue{} · {} module{}",
            report.files,
            if report.files == 1 { "" } else { "s" },
            report.modules,
            if report.modules == 1 { "" } else { "s" }
        ))
        .dim()
    );

    let mut current_file: Option<&str> = None;
    for diagnostic in &report.diagnostics {
        if current_file != Some(diagnostic.file.as_str()) {
            println!();
            println!("{}", style(&diagnostic.file).bold().underlined());
            current_file = Some(diagnostic.file.as_str());
        }
        let location = diagnostic
            .line
            .map(|line| format!("{line}:"))
            .unwrap_or_default();
        println!(
            "  {} {}{}  {}",
            diagnostic.severity.styled(),
            style(&location).dim(),
            style(diagnostic.rule).cyan(),
            diagnostic.message
        );
    }

    println!();
    let errors = report.errors();
    let warnings = report.warnings();
    if errors == 0 && warnings == 0 {
        success(format!(
            "{} issue{} checked — no problems found",
            report.files,
            if report.files == 1 { "" } else { "s" }
        ));
        return;
    }

    let summary = format!(
        "{errors} error{} · {warnings} warning{}",
        if errors == 1 { "" } else { "s" },
        if warnings == 1 { "" } else { "s" }
    );
    if errors > 0 {
        // The summary goes to stderr; flush stdout so a piped report stays ordered.
        let _ = std::io::stdout().flush();
        error(summary);
    } else {
        println!("{} {}", style("⚠").yellow().bold(), style(summary).yellow());
    }
}

fn print_json(report: &CheckReport) {
    let payload = json!({
        "files": report.files,
        "modules": report.modules,
        "errors": report.errors(),
        "warnings": report.warnings(),
        "diagnostics": report
            .diagnostics
            .iter()
            .map(|diagnostic| json!({
                "file": diagnostic.file,
                "module": diagnostic.module,
                "issue": diagnostic.issue,
                "severity": diagnostic.severity.label(),
                "rule": diagnostic.rule,
                "line": diagnostic.line,
                "message": diagnostic.message,
            }))
            .collect::<Vec<_>>(),
    });
    match serde_json::to_string_pretty(&payload) {
        Ok(json) => println!("{json}"),
        Err(err) => error(format!("Failed to serialize the report: {err}")),
    }
}

pub fn run(args: &IssueCheckArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);

    let options = CheckOptions {
        modules: args.module.clone(),
        ids: args.id.clone(),
    };
    let report = execute(&cwd, &options);

    if report.files == 0 && report.diagnostics.is_empty() {
        if !args.module.is_empty() || !args.id.is_empty() {
            error("No issue matched the requested --module/--id filter");
            std::process::exit(1);
        }
        info("No issue files found");
        return;
    }

    if args.json {
        print_json(&report);
    } else {
        print_report(&report);
    }

    if report.errors() > 0 || (args.strict && report.warnings() > 0) {
        std::process::exit(1);
    }
}
