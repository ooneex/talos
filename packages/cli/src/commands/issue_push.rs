use std::path::{Path, PathBuf};

use clap::Args;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::utils::github;
use crate::utils::linear::LinearClient;
use crate::utils::{Provider, current_dir, resolve_provider_client};

#[derive(Default, Deserialize, Serialize, Clone, Debug)]
pub struct IssueComment {
    pub author: Option<String>,
    pub message: String,
}

#[derive(Default, Deserialize, Serialize, Clone, Debug)]
pub struct ParsedIssue {
    pub id: Option<String>,
    pub module: Option<String>,
    pub title: Option<String>,
    pub state: Option<String>,
    pub priority: Option<String>,
    /// Where the issue belongs in the tracker: the team that owns it, and
    /// optionally a project and a milestone inside that project. Linear only —
    /// GitHub has no equivalent and ignores them.
    pub team: Option<String>,
    pub project: Option<String>,
    pub milestone: Option<String>,
    pub context: Option<String>,
    pub goal: Option<String>,
    pub dod: Option<String>,
    pub testing: Option<String>,
    #[serde(default)]
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub comments: Vec<IssueComment>,
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

/// Locate a local issue file by id across every module, preferring the
/// requested module when provided, so the push can update it in place.
pub fn find_issue_file(
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

pub fn build_description(issue: &ParsedIssue, module: &str) -> String {
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

pub fn priority_value(priority: Option<&str>) -> Option<i64> {
    match priority?.to_lowercase().as_str() {
        "no priority" => Some(0),
        "urgent" => Some(1),
        "high" => Some(2),
        "medium" | "normal" => Some(3),
        "low" => Some(4),
        _ => None,
    }
}

/// The workflow state named `state_name`, looked up inside the owning team.
///
/// States are per-team in Linear, and several teams have a "Todo": taking the
/// first match across the whole workspace picks a state the issue's team does
/// not own, which the API then rejects. The workspace-wide query stays as the
/// fallback for when the team is not known yet.
fn resolve_state(client: &LinearClient, team_id: Option<&str>, state_name: &str) -> Option<String> {
    let (query, variables) = match team_id {
        Some(team_id) => (
            r#"query($teamId: String!) { team(id: $teamId) { states { nodes { id name } } } }"#,
            json!({ "teamId": team_id }),
        ),
        None => (
            r#"query { workflowStates { nodes { id name } } }"#,
            json!({}),
        ),
    };
    let data = client.request(query, variables)?;
    let nodes = match team_id {
        Some(_) => data.get("team")?.get("states")?,
        None => data.get("workflowStates")?,
    };
    named_id(nodes.get("nodes")?.as_array()?, &["name"], state_name)
}

/// The id of the node whose `fields` carry `wanted`, compared case-insensitively.
fn named_id(nodes: &[Value], fields: &[&str], wanted: &str) -> Option<String> {
    nodes
        .iter()
        .find(|node| {
            fields.iter().any(|field| {
                node.get(field)
                    .and_then(Value::as_str)
                    .is_some_and(|value| value.eq_ignore_ascii_case(wanted))
            })
        })
        .and_then(|node| node.get("id").and_then(Value::as_str).map(str::to_string))
}

/// The names a lookup could have matched, for the error message that follows a
/// miss — a typo in a team key is otherwise indistinguishable from an empty
/// workspace.
fn names(nodes: &[Value], field: &str) -> String {
    let mut names: Vec<&str> = nodes
        .iter()
        .filter_map(|node| node.get(field).and_then(Value::as_str))
        .collect();
    names.sort_unstable();
    if names.is_empty() {
        "none".to_string()
    } else {
        names.join(", ")
    }
}

fn resolve_label_ids(client: &LinearClient, label_names: &[String]) -> Vec<String> {
    if label_names.is_empty() {
        return Vec::new();
    }
    let query = r#"query { issueLabels { nodes { id name } } }"#;
    let data = client.request(query, json!({})).unwrap_or_default();
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
        if let Some(data) = client.request(query, json!({"name": name}))
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

/// Team the issue belongs to, matched on its key (`ENG`) or its name.
///
/// `wanted` is the `team:` an issue file declares; without one the fallback is
/// the "General" team, which is where every issue landed before issue files
/// could name their own.
fn find_team(client: &LinearClient, wanted: Option<&str>) -> Option<String> {
    let query = r#"query { teams { nodes { id name key } } }"#;
    let data = client.request(query, json!({}))?;
    let nodes = data.get("teams")?.get("nodes")?.as_array()?;
    let wanted = wanted.unwrap_or("general");
    match named_id(nodes, &["key", "name"], wanted) {
        Some(id) => Some(id),
        None => {
            crate::utils::error(format!(
                "No \"{wanted}\" team in Linear (teams: {})",
                names(nodes, "key")
            ));
            None
        }
    }
}

/// Project named `wanted` inside `team_id`.
///
/// Scoped to the team because project names repeat across teams, and an issue
/// filed against a project its team does not own is rejected by the API.
fn find_project(client: &LinearClient, team_id: &str, wanted: &str) -> Option<String> {
    let query =
        r#"query($teamId: String!) { team(id: $teamId) { projects { nodes { id name } } } }"#;
    let data = client.request(query, json!({ "teamId": team_id }))?;
    let nodes = data
        .get("team")?
        .get("projects")?
        .get("nodes")?
        .as_array()?;
    match named_id(nodes, &["name"], wanted) {
        Some(id) => Some(id),
        None => {
            crate::utils::error(format!(
                "No \"{wanted}\" project in that team (projects: {})",
                names(nodes, "name")
            ));
            None
        }
    }
}

/// Milestone named `wanted` inside `project_id`.
fn find_milestone(client: &LinearClient, project_id: &str, wanted: &str) -> Option<String> {
    let query =
        r#"query($id: String!) { project(id: $id) { projectMilestones { nodes { id name } } } }"#;
    let data = client.request(query, json!({ "id": project_id }))?;
    let nodes = data
        .get("project")?
        .get("projectMilestones")?
        .get("nodes")?
        .as_array()?;
    match named_id(nodes, &["name"], wanted) {
        Some(id) => Some(id),
        None => {
            crate::utils::error(format!(
                "No \"{wanted}\" milestone in that project (milestones: {})",
                names(nodes, "name")
            ));
            None
        }
    }
}

/// Where an issue goes in Linear, resolved from the `team`, `project` and
/// `milestone` its file declares.
struct Target {
    team_id: String,
    /// Whether the team came from the issue file rather than the fallback. An
    /// update only re-points an issue the file actually asked to move, so a
    /// re-push never drags an issue filed under `ENG` back into `General`.
    declared: bool,
    project_id: Option<String>,
    milestone_id: Option<String>,
}

/// The declared value of a field, ignoring one left blank.
fn declared(value: Option<&String>) -> Option<&str> {
    value
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
}

/// Resolve the issue's destination, or `None` when a name it declares does not
/// exist — better a named failure than an issue silently filed in the wrong
/// place, which is only noticed once someone goes looking for it.
fn resolve_target(client: &LinearClient, parsed: &ParsedIssue) -> Option<Target> {
    let team = declared(parsed.team.as_ref());
    let team_id = find_team(client, team)?;

    let project_id = match declared(parsed.project.as_ref()) {
        Some(project) => Some(find_project(client, &team_id, project)?),
        None => None,
    };

    let milestone_id = match declared(parsed.milestone.as_ref()) {
        Some(milestone) => {
            let Some(project_id) = project_id.as_deref() else {
                crate::utils::error(
                    "`milestone` needs a `project`: Linear milestones belong to a project",
                );
                return None;
            };
            Some(find_milestone(client, project_id, milestone)?)
        }
        None => None,
    };

    Some(Target {
        team_id,
        declared: team.is_some(),
        project_id,
        milestone_id,
    })
}

fn get_issue(client: &LinearClient, id: &str) -> Option<Value> {
    let query =
        r#"query($id: String!) { issue(id: $id) { id identifier comments { nodes { body } } } }"#;
    // A `null` issue means Linear does not hold it yet, which is what sends the
    // push down the create path — so it has to read as absent, not as present
    // and empty.
    client
        .request(query, json!({"id": id}))
        .and_then(|data| data.get("issue").cloned())
        .filter(|issue| !issue.is_null())
}

fn sync_comments(
    client: &LinearClient,
    issue_id: &str,
    parsed: &ParsedIssue,
    existing: Option<&Value>,
) {
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
        let _ = client.request(query, json!({"issueId": issue_id, "body": comment.message}));
    }
}

#[path = "issue_push/rename.rs"]
mod rename;
pub use rename::{adopt_issue_id, repoint_dependencies, set_issue_id};

pub fn push_issue(
    client: &LinearClient,
    module: &str,
    issues_dir: &Path,
    file_path: &Path,
    id: &str,
) -> bool {
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
        .and_then(|value| get_issue(client, value));
    let description = build_description(&parsed, module);
    let Some(target) = resolve_target(client, &parsed) else {
        crate::utils::error(format!("Cannot place issue {id} in Linear"));
        return false;
    };
    let state_id = parsed
        .state
        .as_deref()
        .and_then(|state| resolve_state(client, Some(&target.team_id), state));
    let label_ids = resolve_label_ids(client, &parsed.labels);
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
        // Only a file that names its own team asks to be moved; without one the
        // issue keeps the placement it already has in Linear.
        if target.declared {
            input["teamId"] = json!(target.team_id);
        }
        if let Some(project_id) = target.project_id.as_deref() {
            input["projectId"] = json!(project_id);
        }
        if let Some(milestone_id) = target.milestone_id.as_deref() {
            input["projectMilestoneId"] = json!(milestone_id);
        }
        if client
            .request(query, json!({"id": issue_id, "input": input}))
            .is_none()
        {
            crate::utils::error(format!("Failed to update issue {id} in Linear"));
            return false;
        }
        sync_comments(client, issue_id, &parsed, Some(&existing));
        let identifier = existing
            .get("identifier")
            .and_then(Value::as_str)
            .unwrap_or(id);
        adopt_issue_id(module, issues_dir, file_path, id, identifier);
        crate::utils::success(format!("Issue {identifier} updated in Linear"));
        return true;
    }

    let Some(title) = parsed.title.as_deref() else {
        crate::utils::error(format!("Issue {id} has no title; cannot create in Linear"));
        return false;
    };
    let query = r#"mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id identifier } } }"#;
    let mut input = json!({
        "teamId": target.team_id,
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
    if let Some(project_id) = target.project_id.as_deref() {
        input["projectId"] = json!(project_id);
    }
    if let Some(milestone_id) = target.milestone_id.as_deref() {
        input["projectMilestoneId"] = json!(milestone_id);
    }
    let Some(data) = client.request(query, json!({"input": input})) else {
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
    sync_comments(client, issue_id, &parsed, None);

    let identifier = created
        .get("identifier")
        .and_then(Value::as_str)
        .unwrap_or(id);
    adopt_issue_id(module, issues_dir, file_path, id, identifier);
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
    // GitHub issues have no team, project or milestone of the shape Linear
    // gives them, so say the placement is dropped rather than drop it quietly.
    for (field, value) in [
        ("team", &parsed.team),
        ("project", &parsed.project),
        ("milestone", &parsed.milestone),
    ] {
        if declared(value.as_ref()).is_some() {
            crate::utils::warn(format!(
                "Issue {id}: `{field}` is Linear-only and was ignored"
            ));
        }
    }

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
        adopt_issue_id(module, issues_dir, file_path, id, &number);
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

    adopt_issue_id(module, issues_dir, file_path, id, &number);
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

    let client = resolve_provider_client(args.provider);

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
        let pushed = match &client {
            Some(client) => push_issue(client, &module, &issues_dir, &file_path, id),
            None => push_issue_github(&module, &issues_dir, &file_path, id),
        };
        if !pushed {
            failures += 1;
        }
    }

    if failures > 0 {
        std::process::exit(1);
    }
}
