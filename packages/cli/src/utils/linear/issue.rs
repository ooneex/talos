use serde_json::{Value, json};

use super::client::LinearClient;

const ISSUE_QUERY: &str = r#"query($id: String!) { issue(id: $id) { identifier title description priority state { name } team { key } project { name } projectMilestone { name } labels { nodes { name } } comments { nodes { body user { name } } } } }"#;

/// A single comment attached to a Linear issue.
pub struct LinearComment {
    pub author: Option<String>,
    pub body: String,
}

/// Subset of a Linear issue used by the CLI, mirroring `Issue`/`mapIssue`
/// from `@talosjs/linear`.
pub struct LinearIssue {
    pub identifier: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub priority: Option<String>,
    pub state: Option<String>,
    /// Team key (`ENG`), project name and milestone name — where the issue
    /// lives in Linear, so a pulled issue pushed back lands where it was
    /// rather than in the fallback team.
    pub team: Option<String>,
    pub project: Option<String>,
    pub milestone: Option<String>,
    pub labels: Vec<String>,
    pub comments: Vec<LinearComment>,
}

/// Map a Linear numeric priority to its label, matching the `PRIORITIES`
/// table in `LinearService`.
pub fn priority_name(priority: Option<i64>) -> Option<String> {
    match priority? {
        0 => Some("No priority".to_string()),
        1 => Some("Urgent".to_string()),
        2 => Some("High".to_string()),
        3 => Some("Medium".to_string()),
        4 => Some("Low".to_string()),
        value => Some(value.to_string()),
    }
}

impl LinearIssue {
    fn from_json(issue: &Value) -> Self {
        let string_field = |key: &str| issue.get(key).and_then(Value::as_str).map(str::to_string);

        let state = issue
            .get("state")
            .and_then(|state| state.get("name"))
            .and_then(Value::as_str)
            .map(str::to_string);

        let nested = |key: &str, field: &str| {
            issue
                .get(key)
                .and_then(|value| value.get(field))
                .and_then(Value::as_str)
                .map(str::to_string)
        };

        let labels = issue
            .get("labels")
            .and_then(|labels| labels.get("nodes"))
            .and_then(Value::as_array)
            .map(|nodes| {
                nodes
                    .iter()
                    .filter_map(|node| node.get("name").and_then(Value::as_str).map(str::to_string))
                    .collect()
            })
            .unwrap_or_default();

        let comments = issue
            .get("comments")
            .and_then(|comments| comments.get("nodes"))
            .and_then(Value::as_array)
            .map(|nodes| {
                nodes
                    .iter()
                    .filter_map(|node| {
                        Some(LinearComment {
                            author: node
                                .get("user")
                                .and_then(|user| user.get("name"))
                                .and_then(Value::as_str)
                                .map(str::to_string),
                            body: node.get("body")?.as_str()?.to_string(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Self {
            identifier: string_field("identifier"),
            title: string_field("title"),
            description: string_field("description"),
            priority: priority_name(issue.get("priority").and_then(Value::as_i64)),
            state,
            team: nested("team", "key"),
            project: nested("project", "name"),
            milestone: nested("projectMilestone", "name"),
            labels,
            comments,
        }
    }
}

impl LinearClient {
    /// Fetch a single issue by id or identifier (e.g. `ABC-123`).
    pub fn get_issue(&self, id: &str) -> Option<LinearIssue> {
        let data = self.request(ISSUE_QUERY, json!({ "id": id }))?;
        let issue = data.get("issue")?;
        if issue.is_null() {
            return None;
        }
        Some(LinearIssue::from_json(issue))
    }
}
