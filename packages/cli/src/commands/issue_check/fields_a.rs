//! Field-level checks for identity, title, state, priority, labels, goal, and
//! definition-of-done sections of an issue document.

use std::collections::HashSet;

use serde_yaml::{Mapping, Value};

use super::loading::{Checkbox, as_str, expected_goal_section, field, parse_checkbox, value_kind};
use super::{
    AREA_LABELS, CHANGE_TYPE_LABELS, FileReport, GOAL_SECTIONS, IMPLEMENTATION_MARKERS,
    IMPLEMENTED_STATES, LoadedIssue, MODIFIER_LABELS, PRIORITIES, STATES, is_valid_issue_id,
    quote_list,
};

// ---------------------------------------------------------------------------
// Field checks
// ---------------------------------------------------------------------------

/// Validate a required block-scalar field, returning its content when usable.
pub(super) fn required_text<'a>(
    document: &'a Mapping,
    key: &'static str,
    rule: &'static str,
    required: bool,
    report: &mut FileReport,
) -> Option<&'a str> {
    match field(document, key) {
        None => {
            if required {
                report.error(
                    rule,
                    format!("`{key}` is required once the issue is planned"),
                );
            }
            None
        }
        Some(value) => match as_str(value) {
            Some(text) if !text.trim().is_empty() => Some(text),
            Some(_) => {
                report.error(rule, format!("`{key}` is empty"));
                None
            }
            None => {
                report.error(
                    rule,
                    format!("`{key}` must be a string, found {}", value_kind(value)),
                );
                None
            }
        },
    }
}

pub(super) fn check_identity(document: &Mapping, issue: &LoadedIssue, report: &mut FileReport) {
    match field(document, "id") {
        None => report.error("issue.id.missing", "`id` is required"),
        Some(value) => match as_str(value) {
            None => report.error(
                "issue.id.type",
                format!("`id` must be a string, found {}", value_kind(value)),
            ),
            Some(id) => {
                if !is_valid_issue_id(id) {
                    report.error(
                        "issue.id.format",
                        format!(
                            "`id` \"{id}\" is not a valid identifier (expected `ABC-123456` or a tracker id such as `ENG-45`)"
                        ),
                    );
                }
                if id != issue.stem {
                    report.error(
                        "issue.id.filename-mismatch",
                        format!(
                            "`id` is \"{id}\" but the file is named \"{}.yml\"; they must match",
                            issue.stem
                        ),
                    );
                }
            }
        },
    }

    match field(document, "module") {
        None => report.error("issue.module.missing", "`module` is required"),
        Some(value) => match as_str(value) {
            None => report.error(
                "issue.module.type",
                format!("`module` must be a string, found {}", value_kind(value)),
            ),
            Some(module) if module != issue.module => report.error(
                "issue.module.mismatch",
                format!(
                    "`module` is \"{module}\" but the file lives in \"{}\"",
                    issue.module
                ),
            ),
            Some(_) => {}
        },
    }
}

pub(super) fn check_title(document: &Mapping, report: &mut FileReport) {
    let Some(value) = field(document, "title") else {
        report.error("issue.title.missing", "`title` is required");
        return;
    };
    let Some(title) = as_str(value) else {
        report.error(
            "issue.title.type",
            format!("`title` must be a string, found {}", value_kind(value)),
        );
        return;
    };
    if title.trim().is_empty() {
        report.error("issue.title.empty", "`title` is empty");
        return;
    }
    if title.contains('\n') {
        report.error("issue.title.multiline", "`title` must be a single line");
    }
    if title != title.trim() {
        report.warn(
            "issue.title.whitespace",
            "`title` has leading or trailing whitespace",
        );
    }
    let trimmed = title.trim();
    if trimmed.chars().count() > 100 {
        report.warn(
            "issue.title.length",
            format!(
                "`title` is {} characters; keep it under 100",
                trimmed.chars().count()
            ),
        );
    }
    if trimmed.ends_with('.') {
        report.warn(
            "issue.title.punctuation",
            "`title` must not end with a period",
        );
    }
    if trimmed.starts_with(|c: char| c.is_lowercase()) {
        report.warn(
            "issue.title.capitalization",
            "`title` should start with a capital letter",
        );
    }
}

/// Validate `state` and return it when it is part of the known vocabulary.
pub(super) fn check_state(document: &Mapping, report: &mut FileReport) -> Option<String> {
    let Some(value) = field(document, "state") else {
        report.error("issue.state.missing", "`state` is required");
        return None;
    };
    let Some(state) = as_str(value) else {
        report.error(
            "issue.state.type",
            format!("`state` must be a string, found {}", value_kind(value)),
        );
        return None;
    };
    if STATES.contains(&state) {
        return Some(state.to_string());
    }
    let hint = STATES
        .iter()
        .find(|known| known.eq_ignore_ascii_case(state))
        .map(|known| format!(" (did you mean `{known}`?)"))
        .unwrap_or_default();
    report.error(
        "issue.state.invalid",
        format!(
            "`state` \"{state}\" is not valid{hint}; expected one of {}",
            quote_list(STATES)
        ),
    );
    None
}

pub(super) fn check_priority(document: &Mapping, report: &mut FileReport) {
    let Some(value) = field(document, "priority") else {
        report.error("issue.priority.missing", "`priority` is required");
        return;
    };
    let Some(priority) = as_str(value) else {
        report.error(
            "issue.priority.type",
            format!("`priority` must be a string, found {}", value_kind(value)),
        );
        return;
    };
    if PRIORITIES.contains(&priority) {
        return;
    }
    let hint = PRIORITIES
        .iter()
        .find(|known| known.eq_ignore_ascii_case(priority))
        .map(|known| format!(" (did you mean `{known}`?)"))
        .unwrap_or_default();
    report.error(
        "issue.priority.invalid",
        format!(
            "`priority` \"{priority}\" is not valid{hint}; expected one of {}",
            quote_list(PRIORITIES)
        ),
    );
}

/// Validate `team`, `project` and `milestone` — the optional tracker
/// placement. They are free text (a Linear team key, a project name), so the
/// only thing to check is that a declared one carries a value: a blank field
/// reads as "filed here" while pushing to the fallback team instead.
pub(super) fn check_placement(document: &Mapping, report: &mut FileReport) {
    const PLACEMENT: [(&str, &str, &str); 3] = [
        ("team", "issue.team.type", "issue.team.empty"),
        ("project", "issue.project.type", "issue.project.empty"),
        ("milestone", "issue.milestone.type", "issue.milestone.empty"),
    ];
    for (name, type_rule, empty_rule) in PLACEMENT {
        let Some(value) = field(document, name) else {
            continue;
        };
        let Some(text) = as_str(value) else {
            report.error(
                type_rule,
                format!("`{name}` must be a string, found {}", value_kind(value)),
            );
            continue;
        };
        if text.trim().is_empty() {
            report.error(
                empty_rule,
                format!("`{name}` must not be empty; drop the key instead"),
            );
        }
    }
    if field(document, "milestone").is_some() && field(document, "project").is_none() {
        report.error(
            "issue.milestone.orphan",
            "`milestone` needs a `project`: Linear milestones belong to a project",
        );
    }
}

/// Validate `labels` and return the change-type labels it declares.
pub(super) fn check_labels(
    document: &Mapping,
    planned: bool,
    report: &mut FileReport,
) -> Vec<String> {
    let Some(value) = field(document, "labels") else {
        if planned {
            report.error(
                "issue.labels.missing",
                "`labels` is required once the issue is planned",
            );
        }
        return Vec::new();
    };

    let Some(entries) = value.as_sequence() else {
        report.error(
            "issue.labels.type",
            format!("`labels` must be a sequence, found {}", value_kind(value)),
        );
        return Vec::new();
    };

    if entries.is_empty() {
        if planned {
            report.error(
                "issue.labels.empty",
                "`labels` must contain at least one change-type label once planned",
            );
        }
        return Vec::new();
    }

    let labels = validate_label_entries(entries, report);
    check_change_type_labels(&labels, planned, report)
}

/// Validates every `labels` entry (string, non-empty, unique, in the known
/// vocabulary), returning the ones that pass.
fn validate_label_entries(entries: &[Value], report: &mut FileReport) -> Vec<String> {
    let mut labels: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for entry in entries {
        let Some(label) = as_str(entry) else {
            report.error(
                "issue.labels.type",
                format!("Every label must be a string, found {}", value_kind(entry)),
            );
            continue;
        };
        if label.trim().is_empty() {
            report.error("issue.labels.empty-entry", "Labels must not be empty");
            continue;
        }
        if !seen.insert(label.to_string()) {
            report.error(
                "issue.labels.duplicate",
                format!("Label \"{label}\" is listed more than once"),
            );
            continue;
        }
        let known = CHANGE_TYPE_LABELS.contains(&label)
            || AREA_LABELS.contains(&label)
            || MODIFIER_LABELS.contains(&label);
        if !known {
            let hint = CHANGE_TYPE_LABELS
                .iter()
                .chain(AREA_LABELS.iter())
                .chain(MODIFIER_LABELS.iter())
                .find(|known| known.eq_ignore_ascii_case(label))
                .map(|known| format!(" (did you mean `{known}`?)"))
                .unwrap_or_default();
            report.error(
                "issue.labels.unknown",
                format!("Label \"{label}\" is not in the label vocabulary{hint}"),
            );
            continue;
        }
        labels.push(label.to_string());
    }
    labels
}

/// Checks that at least one change-type label is present (required once
/// planned, otherwise a warning) and that it comes first. Returns the
/// change-type labels found.
fn check_change_type_labels(
    labels: &[String],
    planned: bool,
    report: &mut FileReport,
) -> Vec<String> {
    let change_types: Vec<String> = labels
        .iter()
        .filter(|label| CHANGE_TYPE_LABELS.contains(&label.as_str()))
        .cloned()
        .collect();

    if change_types.is_empty() {
        let message = format!(
            "`labels` needs at least one change-type label ({})",
            quote_list(CHANGE_TYPE_LABELS)
        );
        if planned {
            report.error("issue.labels.change-type-missing", message);
        } else {
            report.warn("issue.labels.change-type-missing", message);
        }
    } else if labels
        .first()
        .is_some_and(|first| !CHANGE_TYPE_LABELS.contains(&first.as_str()))
    {
        report.error(
            "issue.labels.change-type-first",
            format!(
                "The change-type label must be listed first, found \"{}\"",
                labels.first().map(String::as_str).unwrap_or_default()
            ),
        );
    }

    change_types
}

pub(super) fn check_goal(goal: &str, module_type: &str, report: &mut FileReport) {
    for line in goal.lines() {
        let trimmed = line.trim_end();
        if let Some(heading) = trimmed.strip_prefix("### ") {
            let heading = format!("### {heading}");
            if !GOAL_SECTIONS.contains(&heading.as_str()) {
                report.warn(
                    "issue.goal.unknown-section",
                    format!(
                        "`goal` uses the section \"{heading}\"; expected one of {}",
                        quote_list(GOAL_SECTIONS)
                    ),
                );
                continue;
            }
            if let Some(expected) = expected_goal_section(module_type)
                && heading != expected
            {
                report.warn(
                    "issue.goal.section-mismatch",
                    format!(
                        "`goal` uses \"{heading}\" but a `{module_type}` module documents its structure under \"{expected}\""
                    ),
                );
            }
        } else if trimmed.starts_with("## ") && trimmed != "## Technical Notes" {
            report.warn(
                "issue.goal.unknown-section",
                format!("`goal` uses the section \"{trimmed}\"; expected \"## Technical Notes\""),
            );
        }
    }
}

pub(super) fn check_dod(dod: &str, state: &str, report: &mut FileReport) {
    let mut boxes = 0usize;
    let mut unchecked = 0usize;
    let mut checked = 0usize;
    let implemented = IMPLEMENTED_STATES.contains(&state);

    for (index, line) in dod.lines().enumerate() {
        let line = line.trim_end();
        if line.trim().is_empty() {
            continue;
        }
        let number = index + 1;
        let Some(checkbox) = parse_checkbox(line) else {
            report.error_at(
                "issue.dod.format",
                number,
                format!(
                    "`dod` line must be a checkbox (`- [ ] …`), found \"{}\"",
                    line.trim()
                ),
            );
            continue;
        };
        boxes += 1;
        if checkbox.checked {
            checked += 1;
        } else {
            unchecked += 1;
        }
        check_dod_line(line, number, &checkbox, report);
    }

    if boxes == 0 {
        report.error("issue.dod.empty", "`dod` contains no checkbox item");
        return;
    }
    if implemented && unchecked > 0 {
        report.error(
            "issue.dod.unchecked",
            format!(
                "State is `{state}` but {unchecked} of {boxes} `dod` item{} still unchecked",
                if unchecked == 1 { " is" } else { "s are" }
            ),
        );
    }
    if state == "Planned" && checked == boxes {
        report.warn(
            "issue.dod.premature-check",
            "Every `dod` item is checked while the issue is still `Planned`",
        );
    }
}

/// Checks one non-empty `dod` checkbox line: indentation, case, leaked
/// implementation detail, and a backticked id-like suffix.
fn check_dod_line(line: &str, number: usize, checkbox: &Checkbox, report: &mut FileReport) {
    if checkbox.indent % 2 != 0 {
        report.error_at(
            "issue.dod.indentation",
            number,
            "`dod` sub-items must be indented by a multiple of two spaces",
        );
    }
    if checkbox.uppercase {
        report.warn_at(
            "issue.dod.checkbox-case",
            number,
            "Use a lowercase `- [x]` for a checked item",
        );
    }
    for marker in IMPLEMENTATION_MARKERS {
        if line.contains(marker) {
            report.warn_at(
                "issue.dod.implementation-detail",
                number,
                format!(
                    "`dod` items describe outcomes in plain English; move `{marker}` into the `goal` technical section"
                ),
            );
            break;
        }
    }
    if let Some(name) = backticked_id_suffix(line) {
        report.warn_at(
            "issue.dod.id-suffix",
            number,
            format!("Use the entity name instead of `{name}` in a `dod` item"),
        );
    }
}

/// Find a `` `somethingId` `` reference, which `issue-plan` forbids in a `dod`.
pub fn backticked_id_suffix(line: &str) -> Option<String> {
    line.split('`').skip(1).step_by(2).find_map(|token| {
        let candidate = token.trim();
        (candidate.len() > 2
            && candidate.ends_with("Id")
            && candidate
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_'))
        .then(|| candidate.to_string())
    })
}
