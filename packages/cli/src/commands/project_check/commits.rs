//! Commit check: lints unpushed commits against the conventional-commit
//! rules the `commit` skill enforces, so a branch never accumulates commits
//! `project:check` would have caught.

use std::path::Path;

use crate::utils::{get_valid_scopes, lint_commit_message};

use super::types::CheckId;
use super::{COMMIT_HISTORY_LIMIT, CheckOutcome, CheckStatus};

// ---------------------------------------------------------------------------
// Commits — conventional commit messages
// ---------------------------------------------------------------------------

/// A commit message and the conventions it breaks.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommitProblem {
    pub id: String,
    pub header: String,
    pub errors: Vec<String>,
}

/// Lint already-recorded commit messages. Kept separate from git so it is
/// testable without a repository.
pub fn lint_commits(commits: &[(String, String)], scopes: &[String]) -> Vec<CommitProblem> {
    commits
        .iter()
        .filter_map(|(id, message)| {
            let errors = lint_commit_message(message, scopes);
            if errors.is_empty() {
                return None;
            }
            Some(CommitProblem {
                id: id.clone(),
                header: message.lines().next().unwrap_or_default().to_string(),
                errors,
            })
        })
        .collect()
}

/// Commits that are not on the upstream branch yet, or the latest `limit`
/// commits when no upstream is configured. Merge commits are ignored.
fn recent_commits(root: &Path, limit: usize) -> Option<Vec<(String, String)>> {
    let repo = crate::utils::discover_git_repo(root)?;
    let mut walk = repo.revwalk().ok()?;
    walk.push_head().ok()?;

    if let Ok(head) = repo.head()
        && let Ok(name) = head.shorthand()
        && let Ok(branch) = repo.find_branch(name, git2::BranchType::Local)
        && let Ok(upstream) = branch.upstream()
        && let Some(oid) = upstream.get().target()
    {
        let _ = walk.hide(oid);
    }

    let mut commits = Vec::new();
    for oid in walk.flatten() {
        if commits.len() >= limit {
            break;
        }
        let Ok(commit) = repo.find_commit(oid) else {
            continue;
        };
        if commit.parent_count() > 1 {
            continue;
        }
        commits.push((
            oid.to_string().chars().take(7).collect::<String>(),
            commit.message().unwrap_or_default().to_string(),
        ));
    }
    Some(commits)
}

pub(super) fn check_commits(root: &Path) -> CheckOutcome {
    let Some(commits) = recent_commits(root, COMMIT_HISTORY_LIMIT) else {
        return CheckOutcome::new(
            CheckId::Commits,
            CheckStatus::Skipped,
            "not a git repository",
        );
    };
    if commits.is_empty() {
        return CheckOutcome::new(
            CheckId::Commits,
            CheckStatus::Skipped,
            "no commit to check — everything is pushed",
        );
    }

    let problems = lint_commits(&commits, &get_valid_scopes(root));
    let scope = format!(
        "{} commit{} checked",
        commits.len(),
        if commits.len() == 1 { "" } else { "s" }
    );

    if problems.is_empty() {
        return CheckOutcome::new(
            CheckId::Commits,
            CheckStatus::Passed,
            format!("{scope} · all conventional"),
        );
    }

    let details = problems
        .iter()
        .map(|problem| {
            format!(
                "{}  {}  →  {}",
                problem.id,
                problem.header,
                problem.errors.join(" ")
            )
        })
        .collect();

    CheckOutcome::new(
        CheckId::Commits,
        CheckStatus::Warned,
        format!(
            "{scope} · {} non-conventional message{}",
            problems.len(),
            if problems.len() == 1 { "" } else { "s" }
        ),
    )
    .with_details(details)
    .with_hint("Use the `commit` skill, or `git rebase -i` to reword unpushed commits")
}
