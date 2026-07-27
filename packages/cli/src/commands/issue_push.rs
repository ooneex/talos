use std::path::{Path, PathBuf};

use clap::Args;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::utils::github;
use crate::utils::{Provider, current_dir, read_credentials};

#[derive(Default, Deserialize, Serialize, Clone)]
struct IssueComment {
    author: Option<String>,
    message: String,
}

#[derive(Default, Deserialize, Serialize, Clone)]
struct ParsedIssue {
    id: Option<String>,
    module: Option<String>,
    title: Option<String>,
    state: Option<String>,
    priority: Option<String>,
    context: Option<String>,
    goal: Option<String>,
    dod: Option<String>,
    testing: Option<String>,
    #[serde(default)]
    dependencies: Vec<String>,
    #[serde(default)]
    labels: Vec<String>,
    #[serde(default)]
    comments: Vec<IssueComment>,
}

#[derive(Args, Debug)]
pub struct IssuePushArgs {
    /// Comma-separated list of local issue ids, e.g. `--id=ABC-1,ABC-2`.
    #[arg(long, value_delimiter = ',', num_args = 1..)]
    pub id: Vec<String>,

    #[arg(long)]
    pub module: Option<String>,

    /// Issue tracker to push to.
    #[arg(long, value_enum, default_value_t = Provider::Linear)]
    pub provider: Provider,

    #[arg(long)]
    pub cwd: Option<String>,
}

fn read_linear_token() -> Option<String> {
    let profile = read_credentials("linear.yml")?;
    profile
        .into_iter()
        .find_map(|(key, value)| (key == "token").then_some(value))
}

fn linear_request(token: &str, query: &str, variables: Value) -> Option<Value> {
    let body = json!({"query": query, "variables": variables});
    let response: Value = ureq::post("https://api.linear.app/graphql")
        .header("Authorization", token)
        .header("Content-Type", "application/json")
        .send_json(body)
        .ok()?
        .into_body()
        .read_json()
        .ok()?;
    if response.get("errors").is_some() {
        return None;
    }
    response.get("data").cloned()
}

/// Locate a local issue file by id across every module, preferring the
/// requested module when provided, so the push can update it in place.
fn find_issue_file(
    modules_dir: &Path,
    module_hint: Option<&str>,
    id: &str,
) -> Option<(String, PathBuf)> {
    if let Some(module) = module_hint {
        let candidate = modules_dir
            .join(module)
            .join("issues")
            .join(format!("{id}.yml"));
        if candidate.exists() {
            return Some((module.to_string(), candidate));
        }
    }
    for entry in std::fs::read_dir(modules_dir).ok()?.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let candidate = path.join("issues").join(format!("{id}.yml"));
        if candidate.exists() {
            return Some((entry.file_name().to_string_lossy().to_string(), candidate));
        }
    }
    None
}

fn build_description(issue: &ParsedIssue, module: &str) -> String {
    let mut sections = vec![format!("**Module:** `{module}`")];
    if let Some(context) = issue.context.as_deref() {
        sections.push(format!("## Context\n\n{context}"));
    }
    if let Some(goal) = issue.goal.as_deref() {
        sections.push(format!("## Goal\n\n{goal}"));
    }
    if let Some(dod) = issue.dod.as_deref() {
        sections.push(format!("## Definition of Done\n\n{dod}"));
    }
    if let Some(testing) = issue.testing.as_deref() {
        sections.push(format!("## Testing\n\n{testing}"));
    }
    if !issue.dependencies.is_empty() {
        sections.push(format!(
            "## Dependencies\n\n{}",
            issue
                .dependencies
                .iter()
                .map(|dep| format!("- {dep}"))
                .collect::<Vec<_>>()
                .join("\n")
        ));
    }
    sections.join("\n\n")
}

fn priority_value(priority: Option<&str>) -> Option<i64> {
    match priority?.to_lowercase().as_str() {
        "no priority" => Some(0),
        "urgent" => Some(1),
        "high" => Some(2),
        "medium" | "normal" => Some(3),
        "low" => Some(4),
        _ => None,
    }
}

fn resolve_state(token: &str, state_name: &str) -> Option<String> {
    let query = r#"query { workflowStates { nodes { id name } } }"#;
    let data = linear_request(token, query, json!({}))?;
    data.get("workflowStates")?
        .get("nodes")?
        .as_array()?
        .iter()
        .find(|state| {
            state
                .get("name")
                .and_then(Value::as_str)
                .is_some_and(|name| name.eq_ignore_ascii_case(state_name))
        })
        .and_then(|state| state.get("id").and_then(Value::as_str).map(str::to_string))
}

fn resolve_label_ids(token: &str, label_names: &[String]) -> Vec<String> {
    if label_names.is_empty() {
        return Vec::new();
    }
    let query = r#"query { issueLabels { nodes { id name } } }"#;
    let data = linear_request(token, query, json!({})).unwrap_or_default();
    let existing = data
        .get("issueLabels")
        .and_then(|v| v.get("nodes"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut ids = Vec::new();
    for name in label_names {
        if let Some(id) = existing
            .iter()
            .find(|label| {
                label
                    .get("name")
                    .and_then(Value::as_str)
                    .is_some_and(|label_name| label_name.eq_ignore_ascii_case(name))
            })
            .and_then(|label| label.get("id").and_then(Value::as_str))
        {
            ids.push(id.to_string());
            continue;
        }
        let query = r#"mutation($name: String!) { issueLabelCreate(input: { name: $name }) { issueLabel { id } } }"#;
        if let Some(data) = linear_request(token, query, json!({"name": name}))
            && let Some(id) = data
                .get("issueLabelCreate")
                .and_then(|v| v.get("issueLabel"))
                .and_then(|v| v.get("id"))
                .and_then(Value::as_str)
        {
            ids.push(id.to_string());
        }
    }
    ids
}

fn find_team_general(token: &str) -> Option<String> {
    let query = r#"query { teams { nodes { id name key } } }"#;
    let data = linear_request(token, query, json!({}))?;
    data.get("teams")?
        .get("nodes")?
        .as_array()?
        .iter()
        .find(|team| {
            team.get("name")
                .and_then(Value::as_str)
                .is_some_and(|v| v.eq_ignore_ascii_case("general"))
                || team
                    .get("key")
                    .and_then(Value::as_str)
                    .is_some_and(|v| v.eq_ignore_ascii_case("general"))
        })
        .and_then(|team| team.get("id").and_then(Value::as_str).map(str::to_string))
}

fn get_issue(token: &str, id: &str) -> Option<Value> {
    let query =
        r#"query($id: String!) { issue(id: $id) { id identifier comments { nodes { body } } } }"#;
    linear_request(token, query, json!({"id": id})).and_then(|data| data.get("issue").cloned())
}

fn sync_comments(token: &str, issue_id: &str, parsed: &ParsedIssue, existing: Option<&Value>) {
    let existing_bodies: std::collections::BTreeSet<String> = existing
        .and_then(|existing| existing.get("comments"))
        .and_then(|v| v.get("nodes"))
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(|v| v.get("body").and_then(Value::as_str).map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    for comment in parsed.comments.iter().filter(|comment| {
        !comment.message.trim().is_empty() && !existing_bodies.contains(&comment.message)
    }) {
        let query = r#"mutation($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success } }"#;
        let _ = linear_request(
            token,
            query,
            json!({"issueId": issue_id, "body": comment.message}),
        );
    }
}

/// Push a single local issue file to Linear, creating it when it does not yet
/// exist there and updating its fields when it does. Returns `true` on success.
fn push_issue(token: &str, module: &str, issues_dir: &Path, file_path: &Path, id: &str) -> bool {
    let Ok(content) = std::fs::read_to_string(file_path) else {
        crate::utils::error(format!("Failed to read {}", file_path.display()));
        return false;
    };
    let parsed: ParsedIssue = serde_yaml::from_str(&content).unwrap_or_default();
    let module = parsed.module.as_deref().unwrap_or(module);
    let existing = parsed
        .id
        .as_deref()
        .or(Some(id))
        .and_then(|value| get_issue(token, value));
    let description = build_description(&parsed, module);
    let state_id = parsed
        .state
        .as_deref()
        .and_then(|state| resolve_state(token, state));
    let label_ids = resolve_label_ids(token, &parsed.labels);
    let priority = priority_value(parsed.priority.as_deref());

    if let Some(existing) = existing {
        let issue_id = existing
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let query = r#"mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }"#;
        let mut input = json!({"description": description, "labelIds": label_ids});
        if let Some(title) = parsed.title.as_deref() {
            input["title"] = json!(title);
        }
        if let Some(priority) = priority {
            input["priority"] = json!(priority);
        }
        if let Some(state_id) = state_id.as_deref() {
            input["stateId"] = json!(state_id);
        }
        if linear_request(token, query, json!({"id": issue_id, "input": input})).is_none() {
            crate::utils::error(format!("Failed to update issue {id} in Linear"));
            return false;
        }
        sync_comments(token, issue_id, &parsed, Some(&existing));
        crate::utils::success(format!(
            "Issue {} updated in Linear",
            existing
                .get("identifier")
                .and_then(Value::as_str)
                .unwrap_or(id)
        ));
        return true;
    }

    let Some(title) = parsed.title.as_deref() else {
        crate::utils::error(format!("Issue {id} has no title; cannot create in Linear"));
        return false;
    };
    let Some(team_id) = find_team_general(token) else {
        crate::utils::error("No \"General\" team found in Linear");
        return false;
    };
    let query = r#"mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id identifier } } }"#;
    let mut input = json!({
        "teamId": team_id,
        "title": title,
        "description": description,
        "labelIds": label_ids,
    });
    if let Some(priority) = priority {
        input["priority"] = json!(priority);
    }
    if let Some(state_id) = state_id.as_deref() {
        input["stateId"] = json!(state_id);
    }
    let Some(data) = linear_request(token, query, json!({"input": input})) else {
        crate::utils::error(format!("Failed to create issue {id} in Linear"));
        return false;
    };
    let created = data
        .get("issueCreate")
        .and_then(|v| v.get("issue"))
        .cloned()
        .unwrap_or_default();
    let issue_id = created
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default();
    sync_comments(token, issue_id, &parsed, None);

    let identifier = created
        .get("identifier")
        .and_then(Value::as_str)
        .unwrap_or(id);
    if identifier != id && !identifier.is_empty() {
        let new_file_path = issues_dir.join(format!("{identifier}.yml"));
        let mut updated = parsed.clone();
        updated.id = Some(identifier.to_string());
        if let Ok(yaml) = serde_yaml::to_string(&updated) {
            let _ = std::fs::write(&new_file_path, yaml);
            let _ = std::fs::remove_file(file_path);
            crate::utils::success(format!(
                "modules/{module}/issues/{id}.yml renamed to {identifier}.yml"
            ));
        }
    }
    crate::utils::success(format!("Issue {identifier} created in Linear"));
    true
}

/// Push a single local issue file to GitHub via the `gh` CLI, creating it when
/// it does not yet exist there and updating it in place when it does. Returns
/// `true` on success.
fn push_issue_github(module: &str, issues_dir: &Path, file_path: &Path, id: &str) -> bool {
    let Ok(content) = std::fs::read_to_string(file_path) else {
        crate::utils::error(format!("Failed to read {}", file_path.display()));
        return false;
    };
    let parsed: ParsedIssue = serde_yaml::from_str(&content).unwrap_or_default();
    let module = parsed.module.as_deref().unwrap_or(module);
    let description = build_description(&parsed, module);
    let labels = parsed.labels.clone();

    let existing_number = parsed
        .id
        .as_deref()
        .or(Some(id))
        .map(|value| value.trim().trim_start_matches('#').to_string())
        .filter(|value| !value.is_empty() && value.chars().all(|c| c.is_ascii_digit()))
        .filter(|value| github::issue_state(value).is_some());

    if let Some(number) = existing_number {
        if !github::update_issue(&number, parsed.title.as_deref(), &description, &labels) {
            crate::utils::error(format!("Failed to update issue #{number} in GitHub"));
            return false;
        }
        github::set_state(&number, parsed.state.as_deref());
        let existing = github::comment_bodies(&number);
        for comment in parsed.comments.iter().filter(|comment| {
            !comment.message.trim().is_empty() && !existing.contains(&comment.message)
        }) {
            github::add_comment(&number, &comment.message);
        }
        crate::utils::success(format!("Issue #{number} updated in GitHub"));
        return true;
    }

    let Some(title) = parsed.title.as_deref() else {
        crate::utils::error(format!("Issue {id} has no title; cannot create in GitHub"));
        return false;
    };
    let Some(number) = github::create_issue(title, &description, &labels) else {
        crate::utils::error(format!("Failed to create issue {id} in GitHub"));
        return false;
    };
    github::set_state(&number, parsed.state.as_deref());
    for comment in parsed
        .comments
        .iter()
        .filter(|comment| !comment.message.trim().is_empty())
    {
        github::add_comment(&number, &comment.message);
    }

    if number != id {
        let new_file_path = issues_dir.join(format!("{number}.yml"));
        let mut updated = parsed.clone();
        updated.id = Some(number.clone());
        if let Ok(yaml) = serde_yaml::to_string(&updated) {
            let _ = std::fs::write(&new_file_path, yaml);
            let _ = std::fs::remove_file(file_path);
            crate::utils::success(format!(
                "modules/{module}/issues/{id}.yml renamed to {number}.yml"
            ));
        }
    }
    crate::utils::success(format!("Issue #{number} created in GitHub"));
    true
}

pub fn run(args: &IssuePushArgs) {
    let ids: Vec<String> = args
        .id
        .iter()
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect();

    if ids.is_empty() {
        crate::utils::error(
            "Provide at least one issue id, e.g. `talos issue:push --id=ABC-1,ABC-2`",
        );
        std::process::exit(1);
    }

    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let modules_dir = cwd.join("modules");

    let token = match args.provider {
        Provider::Linear => match read_linear_token() {
            Some(token) => Some(token),
            None => {
                crate::utils::error(
                    "No Linear credentials found. Run `talos linear:credentials:create`",
                );
                std::process::exit(1);
            }
        },
        Provider::Github => {
            if !github::is_available() {
                crate::utils::error(
                    "GitHub CLI (`gh`) not found. Install it and run `gh auth login`",
                );
                std::process::exit(1);
            }
            None
        }
    };

    let mut failures = 0;
    for id in &ids {
        let Some((module, file_path)) = find_issue_file(&modules_dir, args.module.as_deref(), id)
        else {
            crate::utils::error(format!("Issue file not found for id: {id}"));
            failures += 1;
            continue;
        };
        let issues_dir = file_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| modules_dir.join(&module).join("issues"));
        let pushed = match args.provider {
            Provider::Linear => push_issue(
                token.as_deref().unwrap_or_default(),
                &module,
                &issues_dir,
                &file_path,
                id,
            ),
            Provider::Github => push_issue_github(&module, &issues_dir, &file_path, id),
        };
        if !pushed {
            failures += 1;
        }
    }

    if failures > 0 {
        std::process::exit(1);
    }
}
