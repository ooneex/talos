//! Branches check — the issue files against the branches that exist.
//!
//! `issue:check` validates an issue's `branch` as a string: the right shape,
//! the right conventional type, not claimed twice. What it cannot see is git.
//! An issue in review pointing at a branch that was squashed away, a branch
//! nobody can trace back to an issue, and a `Done` issue whose branch is still
//! sitting there are all invisible to both halves on their own.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use serde_yaml::Value;

use super::modules::{discover_modules, filter_modules, relative, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Branches that are never an issue's work branch.
const BASE_BRANCHES: [&str; 4] = ["main", "master", "develop", "staging"];

/// States that mean the work is finished and the branch has served its purpose.
const CLOSED_STATES: [&str; 1] = ["Done"];

/// States that mean a branch must exist right now.
const OPEN_STATES: [&str; 3] = ["In Progress", "In Review", "To Merge"];

/// One issue, reduced to what git can be compared against.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Issue {
    pub id: String,
    pub state: String,
    pub branch: Option<String>,
    /// The file the issue lives in, for the report line.
    pub file: String,
}

/// Read an issue YAML.
pub fn parse(content: &str, file: &str) -> Option<Issue> {
    let document: Value = serde_yaml::from_str(content).ok()?;
    let read = |key: &str| {
        document
            .get(key)
            .and_then(Value::as_str)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    };

    Some(Issue {
        id: read("id")?,
        state: read("state").unwrap_or_else(|| "Todo".to_string()),
        branch: read("branch"),
        file: file.to_string(),
    })
}

/// Every issue of the selected modules.
pub fn collect(root: &Path, args: &ProjectCheckArgs) -> Vec<Issue> {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );

    modules
        .iter()
        .flat_map(|module| super::modules::collect_files(&module.dir.join("issues"), &["yml"], 2))
        .filter_map(|path| {
            let content = fs::read_to_string(&path).ok()?;
            parse(&content, &relative(root, &path))
        })
        .collect()
}

/// The branch names a repository holds, local and remote, with the remote
/// prefix stripped so `origin/feat/OON-1-x` and `feat/OON-1-x` are one branch.
pub fn branch_names(repo: &git2::Repository) -> BTreeSet<String> {
    let Ok(branches) = repo.branches(None) else {
        return BTreeSet::new();
    };

    branches
        .flatten()
        .filter_map(|(branch, kind)| {
            let name = branch.name().ok()??;
            Some(match kind {
                git2::BranchType::Remote => name.split_once('/').map(|(_, rest)| rest)?.to_string(),
                git2::BranchType::Local => name.to_string(),
            })
        })
        .filter(|name| name != "HEAD")
        .collect()
}

/// The issue id a branch name carries, from the `<type>/<ID>-<slug>` convention.
pub fn issue_of(branch: &str) -> Option<String> {
    let (_, rest) = branch.split_once('/')?;
    let mut segments = rest.split('-');
    let prefix = segments.next()?;
    let number = segments.next()?;
    // An id is `ABC-123456`: letters, a dash, digits.
    (!prefix.is_empty()
        && prefix
            .chars()
            .all(|character| character.is_ascii_alphabetic())
        && !number.is_empty()
        && number.chars().all(|character| character.is_ascii_digit()))
    .then(|| format!("{prefix}-{number}"))
}

/// Compare the issues against the branches.
pub fn inspect(
    issues: &[Issue],
    branches: &BTreeSet<String>,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let mut claimed: BTreeMap<&str, &Issue> = BTreeMap::new();

    for issue in issues {
        let Some(branch) = issue.branch.as_deref() else {
            continue;
        };
        claimed.insert(branch, issue);

        if branches.contains(branch) {
            if CLOSED_STATES.contains(&issue.state.as_str()) {
                warnings.push(format!(
                    "{}: `{issue}` is {state} but `{branch}` still exists — delete it",
                    issue.file,
                    issue = issue.id,
                    state = issue.state
                ));
            }
            continue;
        }

        if OPEN_STATES.contains(&issue.state.as_str()) {
            errors.push(format!(
                "{}: {} is `{}` but `{branch}` exists neither locally nor on a remote",
                issue.file, issue.id, issue.state
            ));
        }
    }

    let known: BTreeSet<&str> = issues.iter().map(|issue| issue.id.as_str()).collect();
    for branch in branches
        .iter()
        .filter(|branch| !BASE_BRANCHES.contains(&branch.as_str()))
        .filter(|branch| !claimed.contains_key(branch.as_str()))
    {
        match issue_of(branch) {
            // A branch naming an issue that no file declares is work whose
            // trail stops at the branch name.
            Some(id) if !known.contains(id.as_str()) => warnings.push(format!(
                "`{branch}` names issue {id}, which no issue file declares"
            )),
            Some(id) => warnings.push(format!("`{branch}` is not the branch issue {id} declares")),
            None => warnings.push(format!(
                "`{branch}` follows no `<type>/<ID>-<slug>` name — it cannot be traced to an issue"
            )),
        }
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let Some(repo) = crate::utils::discover_git_repo(root) else {
        return CheckOutcome::new(
            CheckId::Branches,
            CheckStatus::Skipped,
            "not a git repository",
        );
    };

    let issues = collect(root, args);
    if issues.is_empty() {
        return CheckOutcome::new(
            CheckId::Branches,
            CheckStatus::Skipped,
            "no issue file found",
        );
    }

    let branches = branch_names(&repo);
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    inspect(&issues, &branches, &mut errors, &mut warnings);

    let scope = format!(
        "{} issue{} · {} branch{}",
        issues.len(),
        if issues.len() == 1 { "" } else { "s" },
        branches.len(),
        if branches.len() == 1 { "" } else { "es" }
    );

    static_outcome(
        CheckId::Branches,
        &scope,
        "every branch traces back to an issue",
        errors,
        warnings,
    )
    .with_hint("`pr-merge` deletes the branch and moves the issue to Done in one step")
}
