use std::process::{Command, Output};

use serde_json::Value;

/// A single comment attached to a GitHub issue.
pub struct GithubComment {
    pub author: Option<String>,
    pub body: String,
}

/// Subset of a GitHub issue used by the CLI, mirroring the generic issue
/// shape consumed by `issue:pull`.
pub struct GithubIssue {
    pub identifier: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub state: Option<String>,
    pub labels: Vec<String>,
    pub comments: Vec<GithubComment>,
}

fn run_gh(args: &[&str]) -> Option<Output> {
    Command::new("gh").args(args).output().ok()
}

fn run_gh_owned(args: &[String]) -> Option<Output> {
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    run_gh(&refs)
}

/// Whether the `gh` CLI is installed and callable.
pub fn is_available() -> bool {
    run_gh(&["--version"])
        .map(|output| output.status.success())
        .unwrap_or(false)
}

pub fn normalize_number(id: &str) -> String {
    id.trim().trim_start_matches('#').to_string()
}

/// Map a GitHub issue state (`OPEN`/`CLOSED`) to a local workflow state name.
pub fn map_state_to_yaml(state: &str) -> String {
    if state.eq_ignore_ascii_case("closed") {
        "Done".to_string()
    } else {
        "Todo".to_string()
    }
}

/// Fetch a single issue by number (e.g. `123` or `#123`) from the current repo.
pub fn get_issue(id: &str) -> Option<GithubIssue> {
    let number = normalize_number(id);
    let output = run_gh(&[
        "issue",
        "view",
        &number,
        "--json",
        "number,title,body,state,labels,comments",
    ])?;
    if !output.status.success() {
        return None;
    }
    let json: Value = serde_json::from_slice(&output.stdout).ok()?;

    let identifier = json
        .get("number")
        .and_then(Value::as_i64)
        .map(|number| number.to_string());
    let title = json
        .get("title")
        .and_then(Value::as_str)
        .map(str::to_string);
    let description = json.get("body").and_then(Value::as_str).map(str::to_string);
    let state = json
        .get("state")
        .and_then(Value::as_str)
        .map(map_state_to_yaml);
    let labels = json
        .get("labels")
        .and_then(Value::as_array)
        .map(|nodes| {
            nodes
                .iter()
                .filter_map(|node| node.get("name").and_then(Value::as_str).map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    let comments = json
        .get("comments")
        .and_then(Value::as_array)
        .map(|nodes| {
            nodes
                .iter()
                .filter_map(|node| {
                    Some(GithubComment {
                        author: node
                            .get("author")
                            .and_then(|author| author.get("login"))
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        body: node.get("body")?.as_str()?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Some(GithubIssue {
        identifier,
        title,
        description,
        state,
        labels,
        comments,
    })
}

/// Return the raw state (`OPEN`/`CLOSED`) of an issue, or `None` when it does
/// not exist in the current repository.
pub fn issue_state(number: &str) -> Option<String> {
    let number = normalize_number(number);
    let output = run_gh(&["issue", "view", &number, "--json", "state"])?;
    if !output.status.success() {
        return None;
    }
    let json: Value = serde_json::from_slice(&output.stdout).ok()?;
    json.get("state")
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// Existing comment bodies for an issue, used to deduplicate before posting.
pub fn comment_bodies(number: &str) -> Vec<String> {
    let number = normalize_number(number);
    let Some(output) = run_gh(&["issue", "view", &number, "--json", "comments"]) else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    let json: Value = serde_json::from_slice(&output.stdout).unwrap_or_default();
    json.get("comments")
        .and_then(Value::as_array)
        .map(|nodes| {
            nodes
                .iter()
                .filter_map(|node| node.get("body").and_then(Value::as_str).map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

/// Ensure every label exists in the repository (creation failures are ignored,
/// which is the case when the label already exists).
pub fn ensure_labels(labels: &[String]) {
    for label in labels {
        let _ = run_gh(&["label", "create", label]);
    }
}

/// Create a new issue and return its number, or `None` on failure.
pub fn create_issue(title: &str, body: &str, labels: &[String]) -> Option<String> {
    ensure_labels(labels);
    let mut args = vec![
        "issue".to_string(),
        "create".to_string(),
        "--title".to_string(),
        title.to_string(),
        "--body".to_string(),
        body.to_string(),
    ];
    if !labels.is_empty() {
        args.push("--label".to_string());
        args.push(labels.join(","));
    }
    let output = run_gh_owned(&args)?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let url = stdout.trim().lines().last()?.trim();
    let number = url.rsplit('/').next()?.trim();
    (!number.is_empty()).then(|| number.to_string())
}

/// Update an existing issue's title, body and labels.
pub fn update_issue(number: &str, title: Option<&str>, body: &str, labels: &[String]) -> bool {
    let number = normalize_number(number);
    ensure_labels(labels);
    let mut args = vec![
        "issue".to_string(),
        "edit".to_string(),
        number,
        "--body".to_string(),
        body.to_string(),
    ];
    if let Some(title) = title {
        args.push("--title".to_string());
        args.push(title.to_string());
    }
    if !labels.is_empty() {
        args.push("--add-label".to_string());
        args.push(labels.join(","));
    }
    run_gh_owned(&args)
        .map(|output| output.status.success())
        .unwrap_or(false)
}

/// Open or close the issue to match the requested local workflow state.
pub fn set_state(number: &str, state: Option<&str>) {
    let Some(state) = state else {
        return;
    };
    let number = normalize_number(number);
    let closed = matches!(
        state.to_lowercase().as_str(),
        "done" | "closed" | "canceled" | "cancelled"
    );
    let action = if closed { "close" } else { "reopen" };
    let _ = run_gh(&["issue", action, &number]);
}

/// Append a comment to an issue.
pub fn add_comment(number: &str, body: &str) -> bool {
    let number = normalize_number(number);
    run_gh(&["issue", "comment", &number, "--body", body])
        .map(|output| output.status.success())
        .unwrap_or(false)
}
