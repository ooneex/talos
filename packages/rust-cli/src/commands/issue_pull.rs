use std::path::PathBuf;

use clap::Args;
use serde_json::{Value, json};

use crate::utils::{current_dir, ensure_module, generate_issue_id, read_credentials};

#[derive(Default)]
struct ParsedDescription {
    module: Option<String>,
    context: Option<String>,
    goal: Option<String>,
    dod: Option<String>,
    dependencies: Vec<String>,
}

/// Rust port of `packages/cli/src/commands/IssuePullCommand.ts`.
#[derive(Args, Debug)]
pub struct IssuePullArgs {
    /// Linear issue identifier.
    #[arg(long)]
    pub id: Option<String>,

    /// Destination module (defaults to "shared").
    #[arg(long)]
    pub module: Option<String>,

    /// Working directory (defaults to the current directory).
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
        .set("Authorization", token)
        .set("Content-Type", "application/json")
        .send_json(body)
        .ok()?
        .into_json()
        .ok()?;
    if response.get("errors").is_some() {
        return None;
    }
    response.get("data").cloned()
}

fn priority_name(priority: Option<i64>) -> Option<String> {
    match priority? {
        0 => Some("No priority".to_string()),
        1 => Some("Urgent".to_string()),
        2 => Some("High".to_string()),
        3 => Some("Medium".to_string()),
        4 => Some("Low".to_string()),
        value => Some(value.to_string()),
    }
}

fn parse_description(description: Option<&str>) -> ParsedDescription {
    let Some(description) = description else {
        return ParsedDescription::default();
    };
    let mut result = ParsedDescription::default();
    let mut current: Option<&str> = None;
    let mut preamble = Vec::new();
    let mut sections: std::collections::BTreeMap<String, Vec<String>> =
        std::collections::BTreeMap::new();
    for line in description.lines() {
        if let Some(module) = line
            .trim()
            .strip_prefix("**Module:** `")
            .and_then(|v| v.strip_suffix('`'))
        {
            if result.module.is_none() {
                result.module = Some(module.to_string());
            }
            continue;
        }
        if let Some(title) = line.trim().strip_prefix("## ") {
            current = match title.trim().to_lowercase().as_str() {
                "context" => Some("context"),
                "goal" => Some("goal"),
                "definition of done" => Some("dod"),
                "dependencies" => Some("dependencies"),
                _ => current,
            };
            if let Some(key) = current {
                sections.entry(key.to_string()).or_default();
            }
            continue;
        }
        if let Some(key) = current {
            sections
                .entry(key.to_string())
                .or_default()
                .push(line.to_string());
        } else {
            preamble.push(line.to_string());
        }
    }
    let trim_block = |lines: Vec<String>| {
        let text = lines.join("\n").trim().to_string();
        (!text.is_empty()).then_some(text)
    };
    result.context = trim_block(sections.remove("context").unwrap_or(preamble));
    result.goal = trim_block(sections.remove("goal").unwrap_or_default());
    result.dod = trim_block(sections.remove("dod").unwrap_or_default());
    result.dependencies = sections
        .remove("dependencies")
        .unwrap_or_default()
        .into_iter()
        .map(|line| line.trim().trim_start_matches('-').trim().to_string())
        .filter(|v| !v.is_empty())
        .collect();
    result
}

fn yaml_quote(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn yaml_block(lines: &str) -> String {
    format!(
        "|\n{}",
        lines
            .split('\n')
            .map(|line| if line.is_empty() {
                String::new()
            } else {
                format!("  {line}")
            })
            .collect::<Vec<_>>()
            .join("\n")
    )
}

fn linear_issue_to_yaml(issue: &Value, module: &str, issues_dir: &std::path::Path) -> String {
    let parsed = parse_description(issue.get("description").and_then(Value::as_str));
    let mut lines = Vec::new();
    let identifier = issue
        .get("identifier")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| generate_issue_id(Some(issues_dir)));
    lines.push(format!("id: {}", yaml_quote(&identifier)));
    lines.push(format!(
        "module: {}",
        yaml_quote(parsed.module.as_deref().unwrap_or(module))
    ));
    lines.push(format!(
        "title: {}",
        yaml_quote(
            issue
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or_default()
        )
    ));
    if let Some(state) = issue
        .get("state")
        .and_then(|v| v.get("name"))
        .and_then(Value::as_str)
    {
        lines.push(format!("state: {}", yaml_quote(state)));
    }
    if let Some(priority) = priority_name(issue.get("priority").and_then(Value::as_i64)) {
        lines.push(format!("priority: {}", yaml_quote(&priority)));
    }
    let labels: Vec<String> = issue
        .get("labels")
        .and_then(|v| v.get("nodes"))
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(|v| v.get("name").and_then(Value::as_str).map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    if labels.is_empty() {
        lines.push("labels: []".to_string());
    } else {
        lines.push("labels:".to_string());
        for label in labels {
            lines.push(format!("  - {}", yaml_quote(&label)));
        }
    }
    for (key, value) in [
        ("context", parsed.context),
        ("goal", parsed.goal),
        ("dod", parsed.dod),
    ] {
        if let Some(value) = value {
            lines.push(format!("{key}: {}", yaml_block(&value)));
        }
    }
    if parsed.dependencies.is_empty() {
        lines.push("dependencies: []".to_string());
    } else {
        lines.push("dependencies:".to_string());
        for dep in parsed.dependencies {
            lines.push(format!("  - {}", yaml_quote(&dep)));
        }
    }
    let comments: Vec<(Option<String>, String)> = issue
        .get("comments")
        .and_then(|v| v.get("nodes"))
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(|c| {
                    Some((
                        c.get("user")
                            .and_then(|u| u.get("name"))
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        c.get("body")?.as_str()?.to_string(),
                    ))
                })
                .collect()
        })
        .unwrap_or_default();
    if comments.is_empty() {
        lines.push("comments: []".to_string());
    } else {
        lines.push("comments:".to_string());
        for (author, message) in comments {
            lines.push("  -".to_string());
            lines.push(format!(
                "    author: {}",
                author
                    .as_deref()
                    .map(yaml_quote)
                    .unwrap_or_else(|| "null".to_string())
            ));
            lines.push(format!(
                "    message: {}",
                yaml_block(&message).replace('\n', "\n    ")
            ));
        }
    }
    format!("{}\n", lines.join("\n"))
}

pub fn run(args: &IssuePullArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let module = args.module.clone().unwrap_or_else(|| "shared".to_string());
    let id = match args.id.clone() {
        Some(id) => id,
        None => generate_issue_id(None),
    };
    let token = match read_linear_token() {
        Some(token) => token,
        None => {
            crate::utils::error(
                "No Linear credentials found. Run `talos linear:credentials:create`",
            );
            std::process::exit(1);
        }
    };
    ensure_module(&module, &cwd);
    let issues_dir = cwd.join("modules").join(&module).join("issues");
    let _ = std::fs::create_dir_all(&issues_dir);
    let query = r#"query($id: String!) { issue(id: $id) { identifier title description priority state { name } labels { nodes { name } } comments { nodes { body user { name } } } } }"#;
    let Some(data) = linear_request(&token, query, json!({"id": id})) else {
        crate::utils::error("Failed to pull issue from Linear");
        std::process::exit(1);
    };
    let Some(issue) = data.get("issue") else {
        crate::utils::error("Issue not found in Linear");
        std::process::exit(1);
    };
    let yaml = linear_issue_to_yaml(issue, &module, &issues_dir);
    let identifier = issue
        .get("identifier")
        .and_then(Value::as_str)
        .unwrap_or("issue");
    let file_path = issues_dir.join(format!("{identifier}.yml"));
    let existed = file_path.exists();
    let _ = std::fs::write(&file_path, yaml);
    crate::utils::success(format!(
        "modules/{module}/issues/{identifier}.yml {} successfully",
        if existed { "updated" } else { "created" }
    ));
}
