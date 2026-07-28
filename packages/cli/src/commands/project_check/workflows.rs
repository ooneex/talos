//! Workflows check — the transitions a workflow will actually run.
//!
//! A transition is an independent class: writing one, decorating it and
//! exporting it produces something that compiles, is bound into the container
//! and never executes, because a workflow only runs the classes its
//! `getTransitions()` lists. The reverse costs more — a workflow listing a
//! class that no longer exists fails at the moment the process it drives is
//! already half-applied, with the earlier transitions' rollbacks as the only
//! way back.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::artifacts::{self, Artifact, is_backend};
use super::modules::{discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

fn identifier_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"[A-Za-z_$][A-Za-z0-9_$]*").expect("the identifier pattern is valid")
    })
}

/// The class names listed in a workflow's `getTransitions()`.
///
/// The list is read by balancing brackets rather than by regex so a transition
/// carrying a generic argument does not truncate it.
pub fn transitions_of(content: &str) -> Option<Vec<String>> {
    let declaration = content.find("getTransitions")?;
    // The return type is written `WorkflowTransitionClassType[]`, so the first
    // `[` after the name belongs to the annotation rather than to the list. The
    // list starts after whichever of `=>` or `return` actually opens the body.
    let start = content[declaration..]
        .find("=>")
        .or_else(|| content[declaration..].find("return"))
        .map(|offset| declaration + offset)
        .unwrap_or(declaration);
    let open = content[start..].find('[').map(|offset| start + offset)?;

    let mut depth = 0;
    let mut end = None;
    for (offset, character) in content[open..].char_indices() {
        match character {
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    end = Some(open + offset);
                    break;
                }
            }
            _ => {}
        }
    }

    let body = &content[open + 1..end?];
    Some(
        identifier_pattern()
            .find_iter(body)
            .map(|found| found.as_str().to_string())
            .collect(),
    )
}

/// One workflow, reduced to its name and the order it runs.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WorkflowDefinition {
    pub class: String,
    pub name: Option<String>,
    pub transitions: Vec<String>,
    pub file: String,
}

/// Read a workflow class.
pub fn parse(workflow: &Artifact) -> WorkflowDefinition {
    WorkflowDefinition {
        class: workflow.class.clone(),
        name: artifacts::returned_string(&workflow.content, "getName"),
        transitions: transitions_of(&workflow.content).unwrap_or_default(),
        file: workflow.file.clone(),
    }
}

/// Whether a transition can undo what it did.
pub fn is_reversible(transition: &Artifact) -> bool {
    artifacts::method_body(&transition.content, "rollback")
        .map(|body| !artifacts::is_empty_body(body))
        .unwrap_or(false)
}

/// Whether a transition does anything at all.
pub fn does_work(transition: &Artifact) -> bool {
    artifacts::method_body(&transition.content, "handler")
        .map(|body| {
            // The generated body hands the data straight back, which is the
            // shape of a transition nobody has filled in yet.
            !artifacts::is_empty_body(body) && body.trim() != "return data;"
        })
        .unwrap_or(false)
}

/// Compare the workflows against the transitions the workspace declares.
pub fn inspect(
    workflows: &[WorkflowDefinition],
    transitions: &[Artifact],
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let declared: BTreeMap<&str, &str> = transitions
        .iter()
        .map(|transition| (transition.class.as_str(), transition.file.as_str()))
        .collect();
    let mut listed: BTreeSet<&str> = BTreeSet::new();
    let mut names: BTreeMap<&str, &str> = BTreeMap::new();

    for workflow in workflows {
        let file = &workflow.file;

        match workflow.name.as_deref() {
            None => errors.push(format!(
                "{file}: `{}` returns no literal name from getName()",
                workflow.class
            )),
            Some(name) => match names.get(name) {
                Some(owner) => errors.push(format!(
                    "{file}: the workflow name \"{name}\" is already used by {owner}"
                )),
                None => {
                    names.insert(name, file);
                }
            },
        }

        if workflow.transitions.is_empty() {
            warnings.push(format!(
                "{file}: `{}` runs no transition — it does nothing",
                workflow.class
            ));
            continue;
        }

        for transition in &workflow.transitions {
            if declared.contains_key(transition.as_str()) {
                listed.insert(transition.as_str());
                continue;
            }
            errors.push(format!(
                "{file}: `{}` lists `{transition}`, which no @decorator.transition() class declares",
                workflow.class
            ));
        }
    }

    for transition in transitions {
        if listed.contains(transition.class.as_str()) {
            continue;
        }
        errors.push(format!(
            "{}: `{}` is in no workflow's getTransitions() — it never runs",
            transition.file, transition.class
        ));
    }

    for transition in transitions {
        if !does_work(transition) {
            warnings.push(format!(
                "{}: `{}`.handler returns its input untouched",
                transition.file, transition.class
            ));
            continue;
        }
        if !is_reversible(transition) {
            warnings.push(format!(
                "{}: `{}` does work with an empty rollback — a later failure cannot undo it",
                transition.file, transition.class
            ));
        }
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<_> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(is_backend)
    .collect();

    let workflows = artifacts::collect(root, &modules, &["workflow"]);
    let transitions = artifacts::collect(root, &modules, &["transition"]);

    if workflows.is_empty() && transitions.is_empty() {
        return CheckOutcome::new(
            CheckId::Workflows,
            CheckStatus::Skipped,
            "no workflow found",
        );
    }

    let definitions: Vec<WorkflowDefinition> = workflows.iter().map(parse).collect();
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    inspect(&definitions, &transitions, &mut errors, &mut warnings);

    let scope = format!(
        "{} workflow{} · {} transition{}",
        workflows.len(),
        if workflows.len() == 1 { "" } else { "s" },
        transitions.len(),
        if transitions.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Workflows,
        &scope,
        "every transition belongs to a workflow",
        errors,
        warnings,
    )
    .with_hint("List the class in the workflow's `getTransitions()`, in the order it must run")
}
