//! Per-issue check orchestration plus cross-issue duplicate-id, duplicate
//! branch, and dependency-cycle detection.

use std::collections::{BTreeMap, HashMap, HashSet};

use serde_yaml::{Mapping, Value};

use super::fields_a::{
    check_dod, check_goal, check_identity, check_labels, check_priority, check_state, check_title,
    required_text,
};
use super::fields_b::{
    check_branch, check_comments, check_dependencies, check_pr, check_spec, check_testing,
};
use super::loading::{as_str, field, value_kind};
use super::{Diagnostic, FileReport, KNOWN_FIELDS, LoadedIssue, PLANNED_STATES, Severity};

// ---------------------------------------------------------------------------
// Per-issue orchestration
// ---------------------------------------------------------------------------

/// Report any top-level key that isn't in the known schema, suggesting the
/// closest known field name as a hint when one looks like a typo.
fn check_unknown_fields(document: &Mapping, report: &mut FileReport) {
    for key in document.keys() {
        match key.as_str() {
            Some(name) if KNOWN_FIELDS.contains(&name) => {}
            Some(name) => {
                let hint = KNOWN_FIELDS
                    .iter()
                    .find(|known| known.eq_ignore_ascii_case(name))
                    .map(|known| format!(" (did you mean `{known}`?)"))
                    .unwrap_or_default();
                report.error(
                    "issue.field.unknown",
                    format!("Unknown field `{name}`{hint}"),
                );
            }
            None => report.error("issue.field.unknown", "Top-level keys must be strings"),
        }
    }
}

/// Validate the legacy `description` field: rejects it once an issue is
/// planned (in favor of `context`/`goal`/`dod`/`testing`), and warns when it
/// is redundant alongside a `goal`, or when neither is present.
fn check_description(document: &Mapping, state: &str, planned: bool, report: &mut FileReport) {
    if let Some(description) = field(document, "description") {
        if as_str(description).is_none() {
            report.error(
                "issue.description.type",
                format!(
                    "`description` must be a string, found {}",
                    value_kind(description)
                ),
            );
        } else if planned {
            report.error(
                "issue.description.legacy",
                format!(
                    "`description` is only allowed before planning; a `{state}` issue must use `context`/`goal`/`dod`/`testing`"
                ),
            );
        } else if field(document, "goal").is_some() {
            report.warn(
                "issue.description.redundant",
                "Both `description` and `goal` are set; keep only the planned structure",
            );
        }
    } else if !planned && field(document, "goal").is_none() && state != "Canceled" {
        report.warn(
            "issue.todo.no-content",
            format!("A `{state}` issue with neither `description` nor `goal` has nothing to plan"),
        );
    }
}

/// Run every schema, state and formatting rule against one parsed issue.
pub(super) fn check_issue(
    issue: &LoadedIssue,
    module_type: &str,
    index: &HashMap<String, Vec<String>>,
) -> Vec<Diagnostic> {
    let mut report = FileReport::new(&issue.relative, &issue.module, &issue.stem);
    let Some(document) = issue.document.as_ref() else {
        return report.diagnostics;
    };

    check_unknown_fields(document, &mut report);

    check_identity(document, issue, &mut report);
    check_title(document, &mut report);
    check_priority(document, &mut report);

    let state = check_state(document, &mut report);
    let state = state.as_deref().unwrap_or("Todo");
    let planned = PLANNED_STATES.contains(&state);
    let id = issue.id.clone().unwrap_or_else(|| issue.stem.clone());

    let change_types = check_labels(document, planned, &mut report);

    check_description(document, state, planned, &mut report);

    required_text(
        document,
        "context",
        "issue.context.missing",
        planned,
        &mut report,
    );

    if let Some(goal) = required_text(document, "goal", "issue.goal.missing", planned, &mut report)
    {
        check_goal(goal, module_type, &mut report);
    }
    if let Some(dod) = required_text(document, "dod", "issue.dod.missing", planned, &mut report) {
        check_dod(dod, state, &mut report);
    }
    if let Some(testing) = required_text(
        document,
        "testing",
        "issue.testing.missing",
        planned,
        &mut report,
    ) {
        check_testing(testing, state, &mut report);
    }

    check_dependencies(document, &id, planned, index, &mut report);
    check_branch(document, state, &id, &change_types, &mut report);
    check_pr(document, state, &mut report);
    check_comments(document, &mut report);
    check_spec(document, &mut report);
    check_resources(document, &mut report);

    report.diagnostics
}

// ---------------------------------------------------------------------------
// Cross-file guards
// ---------------------------------------------------------------------------

/// Report ids claimed by more than one file — they break every id-based lookup.
pub(super) fn check_duplicate_ids(
    issues: &[LoadedIssue],
    selected: &HashSet<String>,
) -> Vec<Diagnostic> {
    let mut by_id: BTreeMap<&str, Vec<&LoadedIssue>> = BTreeMap::new();
    for issue in issues {
        if let Some(id) = issue.id.as_deref() {
            by_id.entry(id).or_default().push(issue);
        }
    }

    let mut diagnostics = Vec::new();
    for (id, owners) in by_id {
        if owners.len() < 2 {
            continue;
        }
        diagnostics.extend(report_duplicate_owners(
            &owners,
            selected,
            Severity::Error,
            "issue.id.duplicate",
            |others| format!("Id \"{id}\" is also used by {}", others.join(", ")),
        ));
    }
    diagnostics
}

/// Reports every issue in `owners` (a group sharing the same id/branch/etc.) that is
/// part of the current `selected` batch, naming the other issues it collides with.
/// Shared by `check_duplicate_ids` and `check_duplicate_branches`.
fn report_duplicate_owners(
    owners: &[&LoadedIssue],
    selected: &HashSet<String>,
    severity: Severity,
    rule: &'static str,
    message: impl Fn(&[&str]) -> String,
) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    for issue in owners {
        if !selected.contains(&issue.relative) {
            continue;
        }
        let others: Vec<&str> = owners
            .iter()
            .filter(|other| other.relative != issue.relative)
            .map(|other| other.relative.as_str())
            .collect();
        diagnostics.push(Diagnostic {
            file: issue.relative.clone(),
            module: issue.module.clone(),
            issue: issue.stem.clone(),
            severity,
            rule,
            line: None,
            message: message(&others),
        });
    }
    diagnostics
}

/// Report two issues pointing at the same branch, which makes `issue-fix`
/// implement both on one branch and open conflicting pull requests.
pub(super) fn check_duplicate_branches(
    issues: &[LoadedIssue],
    selected: &HashSet<String>,
) -> Vec<Diagnostic> {
    let mut by_branch: BTreeMap<String, Vec<&LoadedIssue>> = BTreeMap::new();
    for issue in issues {
        let Some(branch) = issue
            .document
            .as_ref()
            .and_then(|document| field(document, "branch"))
            .and_then(as_str)
        else {
            continue;
        };
        by_branch.entry(branch.to_string()).or_default().push(issue);
    }

    let mut diagnostics = Vec::new();
    for (branch, owners) in by_branch {
        if owners.len() < 2 {
            continue;
        }
        diagnostics.extend(report_duplicate_owners(
            &owners,
            selected,
            Severity::Warning,
            "issue.branch.duplicate",
            |others| {
                format!(
                    "Branch \"{branch}\" is also claimed by {}",
                    others.join(", ")
                )
            },
        ));
    }
    diagnostics
}

/// Marker used by `find_dependency_cycle`'s depth-first traversal to detect
/// back-edges (a node still on the stack) versus already-cleared subtrees.
#[derive(Clone, Copy, PartialEq)]
enum DependencyMark {
    Visiting,
    Done,
}

/// Visits `node` depth-first, returning the cycle found (if any) as the path
/// from its first occurrence back to itself.
fn visit_dependency(
    node: &str,
    graph: &HashMap<String, Vec<String>>,
    marks: &mut HashMap<String, DependencyMark>,
    stack: &mut Vec<String>,
) -> Option<Vec<String>> {
    marks.insert(node.to_string(), DependencyMark::Visiting);
    stack.push(node.to_string());

    for next in graph.get(node).into_iter().flatten() {
        match marks.get(next.as_str()) {
            Some(DependencyMark::Done) => continue,
            Some(DependencyMark::Visiting) => {
                let start = stack.iter().position(|entry| entry == next).unwrap_or(0);
                let mut cycle = stack[start..].to_vec();
                cycle.push(next.clone());
                return Some(cycle);
            }
            None => {
                if !graph.contains_key(next.as_str()) {
                    continue;
                }
                if let Some(cycle) = visit_dependency(next, graph, marks, stack) {
                    return Some(cycle);
                }
            }
        }
    }

    stack.pop();
    marks.insert(node.to_string(), DependencyMark::Done);
    None
}

/// Depth-first cycle detection over the dependency graph. A cycle deadlocks
/// `issue-fix`, which orders a batch by dependency before implementing it.
pub fn find_dependency_cycle(graph: &HashMap<String, Vec<String>>) -> Option<Vec<String>> {
    let mut marks: HashMap<String, DependencyMark> = HashMap::new();
    let mut nodes: Vec<&String> = graph.keys().collect();
    nodes.sort();
    for node in nodes {
        if marks.contains_key(node.as_str()) {
            continue;
        }
        let mut stack = Vec::new();
        if let Some(cycle) = visit_dependency(node, graph, &mut marks, &mut stack) {
            return Some(cycle);
        }
    }
    None
}

pub(super) fn check_dependency_cycles(
    issues: &[LoadedIssue],
    selected: &HashSet<String>,
) -> Vec<Diagnostic> {
    let mut graph: HashMap<String, Vec<String>> = HashMap::new();
    let mut owners: HashMap<String, &LoadedIssue> = HashMap::new();
    for issue in issues {
        let Some(id) = issue.id.as_deref() else {
            continue;
        };
        graph
            .entry(id.to_string())
            .or_default()
            .extend(issue.dependencies.iter().cloned());
        owners.entry(id.to_string()).or_insert(issue);
    }

    let mut diagnostics = Vec::new();
    let mut reported: HashSet<String> = HashSet::new();
    let mut remaining = graph.clone();

    while let Some(cycle) = find_dependency_cycle(&remaining) {
        let path = cycle.join(" → ");
        for id in &cycle {
            if !reported.insert(id.clone()) {
                continue;
            }
            remaining.remove(id);
            let Some(issue) = owners.get(id) else {
                continue;
            };
            if !selected.contains(&issue.relative) {
                continue;
            }
            diagnostics.push(Diagnostic {
                file: issue.relative.clone(),
                module: issue.module.clone(),
                issue: issue.stem.clone(),
                severity: Severity::Error,
                rule: "issue.dependencies.cycle",
                line: None,
                message: format!("Dependency cycle: {path}"),
            });
        }
    }
    diagnostics
}

pub(super) fn check_resources(document: &Mapping, report: &mut FileReport) {
    let Some(value) = field(document, "resources") else {
        return;
    };
    let Some(resources) = value.as_mapping() else {
        report.error(
            "issue.resources.type",
            format!("`resources` must be a mapping, found {}", value_kind(value)),
        );
        return;
    };
    for (key, entry) in resources {
        let Some(name) = key.as_str() else {
            report.error("issue.resources.type", "`resources` keys must be strings");
            continue;
        };
        let valid = match entry {
            Value::String(_) => true,
            Value::Sequence(entries) => entries.iter().all(|entry| entry.as_str().is_some()),
            _ => false,
        };
        if !valid {
            report.error(
                "issue.resources.type",
                format!("`resources.{name}` must be a string or a sequence of strings"),
            );
        }
    }
}
