//! Field-level checks for testing notes, branch name, pull request link,
//! dependencies, comments, and spec block sections.

use std::collections::{BTreeSet, HashMap, HashSet};

use serde_yaml::{Mapping, Value};

use crate::utils::COMMIT_TYPES;

use super::loading::{as_str, field, is_kebab_case, parse_numbered_checkbox, value_kind};
use super::{FileReport, IMPLEMENTED_STATES, LABEL_BRANCH_TYPES, is_valid_issue_id, quote_list};

pub(super) fn check_testing(testing: &str, state: &str, report: &mut FileReport) {
    let mut expected = 1usize;
    let mut unchecked = 0usize;
    let mut steps = 0usize;
    let implemented = IMPLEMENTED_STATES.contains(&state);

    for (index, line) in testing.lines().enumerate() {
        let line = line.trim_end();
        if line.trim().is_empty() {
            continue;
        }
        let number = index + 1;
        let Some(step) = parse_numbered_checkbox(line) else {
            // Indented text continues the previous step.
            if line.starts_with("   ") && steps > 0 {
                continue;
            }
            report.error_at(
                "issue.testing.format",
                number,
                format!(
                    "`testing` line must be a numbered checkbox (`1. [ ] …`), found \"{}\"",
                    line.trim()
                ),
            );
            continue;
        };
        if step.number != expected {
            report.error_at(
                "issue.testing.numbering",
                number,
                format!(
                    "`testing` steps must be numbered sequentially; expected {expected}, found {}",
                    step.number
                ),
            );
        }
        expected = step.number + 1;
        steps += 1;
        if !step.checked {
            unchecked += 1;
        }
    }

    if steps == 0 {
        report.error(
            "issue.testing.empty",
            "`testing` contains no verification step",
        );
        return;
    }
    if implemented && unchecked > 0 {
        report.error(
            "issue.testing.unchecked",
            format!(
                "State is `{state}` but {unchecked} of {steps} `testing` step{} still unchecked",
                if unchecked == 1 { " is" } else { "s are" }
            ),
        );
    }
}

/// Warn when a branch's conventional-commit type doesn't correspond to any of
/// the issue's change-type labels (e.g. a `fix/` branch on a `Feature` issue).
fn check_branch_type_matches_labels(
    branch_type: &str,
    change_types: &[String],
    report: &mut FileReport,
) {
    if change_types.is_empty() {
        return;
    }
    let allowed: BTreeSet<&str> = change_types
        .iter()
        .filter_map(|label| {
            LABEL_BRANCH_TYPES
                .iter()
                .find(|(name, _)| *name == label.as_str())
                .map(|(_, branch_type)| *branch_type)
        })
        .collect();
    if !allowed.is_empty() && !allowed.contains(branch_type) {
        report.warn(
            "issue.branch.type-mismatch",
            format!(
                "`branch` type \"{branch_type}\" does not match the change-type label{} ({})",
                if change_types.len() == 1 { "" } else { "s" },
                quote_list(&allowed.into_iter().collect::<Vec<_>>())
            ),
        );
    }
}

pub(super) fn check_branch(
    document: &Mapping,
    state: &str,
    id: &str,
    change_types: &[String],
    report: &mut FileReport,
) -> Option<String> {
    let Some(value) = field(document, "branch") else {
        if state == "In Review" || state == "To Merge" {
            report.error(
                "issue.branch.missing",
                format!("`branch` is required once the issue reaches `{state}`"),
            );
        } else if state == "Done" {
            report.warn(
                "issue.branch.missing",
                "`branch` is missing on a `Done` issue; keep it for traceability",
            );
        }
        return None;
    };

    let Some(branch) = as_str(value) else {
        report.error(
            "issue.branch.type",
            format!("`branch` must be a string, found {}", value_kind(value)),
        );
        return None;
    };

    let Some((branch_type, rest)) = branch.split_once('/') else {
        report.error(
            "issue.branch.format",
            format!("`branch` \"{branch}\" must follow `<type>/<ID>-<slug>`"),
        );
        return None;
    };

    if !COMMIT_TYPES.contains(&branch_type) {
        report.error(
            "issue.branch.type-invalid",
            format!(
                "`branch` type \"{branch_type}\" is not a conventional-commit type ({})",
                quote_list(COMMIT_TYPES)
            ),
        );
    } else {
        check_branch_type_matches_labels(branch_type, change_types, report);
    }

    match rest.strip_prefix(&format!("{id}-")) {
        None => report.error(
            "issue.branch.id-mismatch",
            format!("`branch` \"{branch}\" must be named `{branch_type}/{id}-<slug>`"),
        ),
        Some(slug) if !is_kebab_case(slug) => report.warn(
            "issue.branch.slug",
            format!("`branch` slug \"{slug}\" must be lower-case kebab-case"),
        ),
        Some(_) => {}
    }

    Some(branch.to_string())
}

pub(super) fn check_pr(document: &Mapping, state: &str, report: &mut FileReport) {
    let Some(value) = field(document, "pr") else {
        match state {
            "To Merge" => report.error(
                "issue.pr.missing",
                "`pr` is required once the issue reaches `To Merge`",
            ),
            "In Review" | "Done" => report.warn(
                "issue.pr.missing",
                format!("`pr` is missing on an issue in state `{state}`; link the pull request"),
            ),
            _ => {}
        }
        return;
    };

    let Some(url) = as_str(value) else {
        report.error(
            "issue.pr.type",
            format!("`pr` must be a string, found {}", value_kind(value)),
        );
        return;
    };

    let looks_like_pr = url.starts_with("https://")
        && ["/pull/", "/merge_requests/", "/pull-requests/"]
            .iter()
            .any(|segment| {
                url.split_once(segment).is_some_and(|(_, number)| {
                    !number.is_empty() && number.chars().all(|c| c.is_ascii_digit())
                })
            });
    if !looks_like_pr {
        report.error(
            "issue.pr.format",
            format!("`pr` \"{url}\" must be a pull-request URL such as `https://github.com/<org>/<repo>/pull/123`"),
        );
    }
}

pub(super) fn check_dependencies(
    document: &Mapping,
    id: &str,
    planned: bool,
    index: &HashMap<String, Vec<String>>,
    report: &mut FileReport,
) {
    let Some(value) = document.get(Value::from("dependencies")) else {
        if planned {
            report.warn(
                "issue.dependencies.missing",
                "`dependencies` should be declared explicitly (use `dependencies: []` when there are none)",
            );
        }
        return;
    };

    if value.is_null() {
        report.error(
            "issue.dependencies.type",
            "`dependencies` must be a sequence; use `[]` when there are none",
        );
        return;
    }

    let Some(entries) = value.as_sequence() else {
        report.error(
            "issue.dependencies.type",
            format!(
                "`dependencies` must be a sequence, found {}",
                value_kind(value)
            ),
        );
        return;
    };

    let mut seen: HashSet<&str> = HashSet::new();
    for entry in entries {
        let Some(dependency) = as_str(entry) else {
            report.error(
                "issue.dependencies.type",
                format!(
                    "Every dependency must be a string, found {}",
                    value_kind(entry)
                ),
            );
            continue;
        };
        if !is_valid_issue_id(dependency) {
            report.error(
                "issue.dependencies.format",
                format!("Dependency \"{dependency}\" is not a valid issue identifier"),
            );
            continue;
        }
        if dependency == id {
            report.error(
                "issue.dependencies.self",
                "An issue cannot depend on itself",
            );
            continue;
        }
        if !seen.insert(dependency) {
            report.error(
                "issue.dependencies.duplicate",
                format!("Dependency \"{dependency}\" is listed more than once"),
            );
            continue;
        }
        if !index.contains_key(dependency) {
            report.error(
                "issue.dependencies.unknown",
                format!("Dependency \"{dependency}\" does not match any issue in the project"),
            );
        }
    }
}

pub(super) fn check_comments(document: &Mapping, report: &mut FileReport) {
    let Some(value) = field(document, "comments") else {
        return;
    };
    let Some(entries) = value.as_sequence() else {
        report.error(
            "issue.comments.type",
            format!("`comments` must be a sequence, found {}", value_kind(value)),
        );
        return;
    };
    for entry in entries {
        let Some(comment) = entry.as_mapping() else {
            report.error(
                "issue.comments.type",
                format!(
                    "Every comment must be a mapping, found {}",
                    value_kind(entry)
                ),
            );
            continue;
        };
        for key in comment.keys() {
            match key.as_str() {
                Some("author") | Some("message") => {}
                Some(other) => report.error(
                    "issue.comments.unknown-field",
                    format!("Unknown comment field `{other}`; expected `author` or `message`"),
                ),
                None => report.error(
                    "issue.comments.unknown-field",
                    "Comment keys must be strings",
                ),
            }
        }
        match field(comment, "message").map(|value| (as_str(value), value_kind(value))) {
            None => report.error("issue.comments.message", "Every comment needs a `message`"),
            Some((Some(message), _)) if message.trim().is_empty() => {
                report.error("issue.comments.message", "Comment `message` is empty");
            }
            Some((Some(_), _)) => {}
            Some((None, kind)) => report.error(
                "issue.comments.message",
                format!("Comment `message` must be a string, found {kind}"),
            ),
        }
        if let Some(author) = field(comment, "author")
            && as_str(author).is_none()
        {
            report.error(
                "issue.comments.author",
                format!(
                    "Comment `author` must be a string, found {}",
                    value_kind(author)
                ),
            );
        }
    }
}

pub(super) fn check_spec(document: &Mapping, report: &mut FileReport) {
    let Some(value) = field(document, "spec") else {
        return;
    };
    let Some(spec) = value.as_mapping() else {
        report.error(
            "issue.spec.type",
            format!("`spec` must be a mapping, found {}", value_kind(value)),
        );
        return;
    };

    for key in spec.keys() {
        match key.as_str() {
            Some("name") | Some("entity") | Some("roles") | Some("permissions") => {}
            Some(other) => report.error(
                "issue.spec.unknown-field",
                format!(
                    "Unknown `spec` field `{other}`; expected `name`, `entity`, `roles` or `permissions`"
                ),
            ),
            None => report.error("issue.spec.unknown-field", "`spec` keys must be strings"),
        }
    }

    check_spec_name(spec, report);
    check_spec_entity(spec, report);
    check_spec_roles(spec, report);
    check_spec_permissions(spec, report);
}

/// `spec.name` must be `entity.action` dot notation.
fn check_spec_name(spec: &Mapping, report: &mut FileReport) {
    let Some(name) = field(spec, "name") else {
        return;
    };
    match as_str(name) {
        None => report.error(
            "issue.spec.name",
            format!("`spec.name` must be a string, found {}", value_kind(name)),
        ),
        Some(name) => {
            let valid = name.split_once('.').is_some_and(|(entity, action)| {
                !entity.is_empty()
                    && !action.is_empty()
                    && entity.chars().all(|c| c.is_ascii_alphanumeric())
                    && action.chars().all(|c| c.is_ascii_alphanumeric())
            });
            if !valid {
                report.warn(
                    "issue.spec.name",
                    format!(
                        "`spec.name` \"{name}\" should use dot notation, e.g. `organization.create`"
                    ),
                );
            }
        }
    }
}

/// `spec.entity`, when present, must be a non-empty string.
fn check_spec_entity(spec: &Mapping, report: &mut FileReport) {
    if let Some(entity) = field(spec, "entity")
        && as_str(entity).is_none_or(|entity| entity.trim().is_empty())
    {
        report.error(
            "issue.spec.entity",
            "`spec.entity` must be a non-empty string",
        );
    }
}

/// `spec.roles`, when present, must be a sequence of non-empty strings.
fn check_spec_roles(spec: &Mapping, report: &mut FileReport) {
    let Some(roles) = field(spec, "roles") else {
        return;
    };
    let Some(entries) = roles.as_sequence() else {
        report.error(
            "issue.spec.roles",
            format!(
                "`spec.roles` must be a sequence, found {}",
                value_kind(roles)
            ),
        );
        return;
    };
    for entry in entries {
        if as_str(entry).is_none_or(|role| role.trim().is_empty()) {
            report.error(
                "issue.spec.roles",
                "Every `spec.roles` entry must be a non-empty string",
            );
        }
    }
}

/// `spec.permissions`, when present, must be a sequence of mappings each
/// carrying an `entity:action` formatted `name`.
fn check_spec_permissions(spec: &Mapping, report: &mut FileReport) {
    let Some(permissions) = field(spec, "permissions") else {
        return;
    };
    let Some(entries) = permissions.as_sequence() else {
        report.error(
            "issue.spec.permissions",
            format!(
                "`spec.permissions` must be a sequence, found {}",
                value_kind(permissions)
            ),
        );
        return;
    };
    for entry in entries {
        check_spec_permission_entry(entry, report);
    }
}

/// Validates a single `spec.permissions` entry.
fn check_spec_permission_entry(entry: &Value, report: &mut FileReport) {
    let name = entry
        .as_mapping()
        .and_then(|permission| field(permission, "name"))
        .and_then(as_str);
    let Some(name) = name else {
        report.error(
            "issue.spec.permissions",
            "Every `spec.permissions` entry must be a mapping with a string `name`",
        );
        return;
    };
    let valid = name
        .split_once(':')
        .is_some_and(|(entity, action)| !entity.is_empty() && !action.is_empty());
    if !valid {
        report.warn(
            "issue.spec.permissions",
            format!("`spec.permissions` name \"{name}\" should use `entity:action` format"),
        );
    }
}
