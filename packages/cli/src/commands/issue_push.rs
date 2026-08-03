use std::path::{Path, PathBuf};

use clap::Args;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::utils::github;
use crate::utils::linear::LinearClient;
use crate::utils::{Provider, current_dir};

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

fn resolve_state(client: &LinearClient, state_name: &str) -> Option<String> {
    let query = r#"query { workflowStates { nodes { id name } } }"#;
    let data = client.request(query, json!({}))?;
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

fn find_team_general(client: &LinearClient) -> Option<String> {
    let query = r#"query { teams { nodes { id name key } } }"#;
    let data = client.request(query, json!({}))?;
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

/// Roots holding the modules and packages that own an `issues/` directory.
const ISSUE_ROOTS: &[&str] = &["modules", "packages"];

/// The project root an `issues/` directory belongs to, i.e. the parent of the
/// `modules/` or `packages/` group holding its owner.
fn project_root(issues_dir: &Path) -> Option<&Path> {
    let group = issues_dir.parent()?.parent()?;
    let name = group.file_name()?.to_string_lossy().to_string();
    ISSUE_ROOTS
        .contains(&name.as_str())
        .then(|| group.parent())
        .flatten()
}

/// Every issue file in the project, across `modules/` and `packages/`.
fn project_issue_files(root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for group in ISSUE_ROOTS {
        let Ok(owners) = std::fs::read_dir(root.join(group)) else {
            continue;
        };
        for owner in owners.flatten() {
            let Ok(entries) = std::fs::read_dir(owner.path().join("issues")) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().is_some_and(|ext| ext == "yml") {
                    files.push(path);
                }
            }
        }
    }
    files.sort();
    files
}

/// True when `id` sits at `at` as a whole token rather than inside a longer
/// identifier, so `OON-1` never matches within `OON-12`.
fn is_token_at(line: &str, at: usize, id: &str) -> bool {
    let is_word = |c: char| c.is_ascii_alphanumeric() || c == '-' || c == '_';
    let before = line[..at].chars().next_back();
    let after = line[at + id.len()..].chars().next();
    !before.is_some_and(is_word) && !after.is_some_and(is_word)
}

/// Swap every whole-token occurrence of `old_id` in a single line.
fn replace_id_token(line: &str, old_id: &str, new_id: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut rest = 0;
    while let Some(found) = line[rest..].find(old_id) {
        let at = rest + found;
        out.push_str(&line[rest..at]);
        if is_token_at(line, at, old_id) {
            out.push_str(new_id);
        } else {
            out.push_str(old_id);
        }
        rest = at + old_id.len();
    }
    out.push_str(&line[rest..]);
    out
}

/// Rewrite the `dependencies` entries pointing at `old_id`, touching only the
/// lines of that block so the rest of the file keeps its formatting. Returns
/// `None` when the file does not depend on `old_id`.
pub fn repoint_dependencies(source: &str, old_id: &str, new_id: &str) -> Option<String> {
    let mut lines: Vec<String> = source.lines().map(str::to_string).collect();
    let mut in_block = false;
    let mut changed = false;
    for line in &mut lines {
        if let Some(inline) = line.strip_prefix("dependencies:") {
            // A value on the key line is a flow sequence (`[A, B]`), which ends
            // the block right away; an empty one opens an indented block.
            in_block = inline.trim().is_empty();
            let updated = replace_id_token(line, old_id, new_id);
            changed |= updated != *line;
            *line = updated;
            continue;
        }
        if !in_block {
            continue;
        }
        if !line.trim().is_empty() && !line.starts_with([' ', '\t']) {
            in_block = false;
            continue;
        }
        let updated = replace_id_token(line, old_id, new_id);
        changed |= updated != *line;
        *line = updated;
    }
    if !changed {
        return None;
    }
    let mut out = lines.join("\n");
    if source.ends_with('\n') {
        out.push('\n');
    }
    Some(out)
}

/// Set the top-level `id` of an issue file, adding it as the first key when the
/// file does not declare one yet.
pub fn set_issue_id(source: &str, new_id: &str) -> String {
    let entry = format!("id: \"{new_id}\"");
    if !source.lines().any(|line| line.starts_with("id:")) {
        return format!("{entry}\n{source}");
    }
    let mut out = source
        .lines()
        .map(|line| {
            if line.starts_with("id:") {
                entry.clone()
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    if source.ends_with('\n') {
        out.push('\n');
    }
    out
}

/// Adopt the id the tracker assigned: stamp it into the issue file, move the
/// file to `<new_id>.yml`, and repoint every issue in the project that depends
/// on the old id. A no-op when the tracker kept the local id.
fn adopt_issue_id(module: &str, issues_dir: &Path, file_path: &Path, old_id: &str, new_id: &str) {
    if new_id.is_empty() || new_id == old_id {
        return;
    }
    let Ok(source) = std::fs::read_to_string(file_path) else {
        crate::utils::error(format!("Failed to read {}", file_path.display()));
        return;
    };
    let new_file_path = issues_dir.join(format!("{new_id}.yml"));
    if let Err(error) = std::fs::write(&new_file_path, set_issue_id(&source, new_id)) {
        crate::utils::error(format!(
            "Failed to write {}: {error}",
            new_file_path.display()
        ));
        return;
    }
    if new_file_path != file_path {
        let _ = std::fs::remove_file(file_path);
    }
    let root = project_root(issues_dir);
    let renamed = root.map_or_else(
        || format!("modules/{module}/issues/{old_id}.yml"),
        |root| crate::commands::issue_check::relative_to(root, file_path),
    );
    crate::utils::success(format!("{renamed} renamed to {new_id}.yml"));

    let Some(root) = root else {
        return;
    };
    for path in project_issue_files(root) {
        if path == new_file_path {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Some(updated) = repoint_dependencies(&content, old_id, new_id) else {
            continue;
        };
        if std::fs::write(&path, updated).is_ok() {
            crate::utils::success(format!(
                "{} now depends on {new_id}",
                crate::commands::issue_check::relative_to(root, &path)
            ));
        }
    }
}

/// Push a single local issue file to Linear, creating it when it does not yet
/// exist there and updating its fields when it does. Returns `true` on success.
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
    let state_id = parsed
        .state
        .as_deref()
        .and_then(|state| resolve_state(client, state));
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
    let Some(team_id) = find_team_general(client) else {
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

    let client = match args.provider {
        Provider::Linear => match LinearClient::from_credentials() {
            Some(client) => Some(client),
            None => {
                crate::utils::error(
                    "No Linear credentials found. Run `talos credentials:create --provider=linear`",
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
