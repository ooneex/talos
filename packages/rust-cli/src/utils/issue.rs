use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const LETTERS: &[u8] = b"ABCDEF";

struct Rng(u64);

impl Rng {
    fn new() -> Self {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x2545F4914F6CDD1D);
        Self(nanos | 1)
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    fn gen_range(&mut self, max: u64) -> u64 {
        self.next_u64() % max
    }
}

pub fn generate_issue_id(issues_dir: Option<&Path>) -> String {
    let mut rng = Rng::new();
    loop {
        let prefix: String = (0..3)
            .map(|_| LETTERS[rng.gen_range(LETTERS.len() as u64) as usize] as char)
            .collect();
        let number = rng.gen_range(1_000_000);
        let id = format!("{prefix}-{number:06}");

        let collides = issues_dir.is_some_and(|dir| dir.join(format!("{id}.yml")).exists());
        if !collides {
            return id;
        }
    }
}

#[derive(Default)]
pub struct IssueYaml {
    pub id: Option<String>,
    pub module: Option<String>,
    pub title: Option<String>,
    pub state: Option<String>,
    pub priority: Option<String>,
    pub description: Option<String>,
    pub labels: Option<Vec<String>>,
}

fn quote_scalar(value: Option<&str>) -> String {
    match value {
        None => "null".to_string(),
        Some(value) => serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string()),
    }
}

fn yaml_literal(text: &str) -> String {
    let indented = text
        .split('\n')
        .map(|line| {
            if line.is_empty() {
                String::new()
            } else {
                format!("  {line}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!("|\n{indented}")
}

pub fn issue_to_yaml(issue: &IssueYaml) -> String {
    let mut lines: Vec<String> = Vec::new();

    if let Some(id) = &issue.id {
        lines.push(format!("id: {}", quote_scalar(Some(id))));
    }
    if let Some(module) = &issue.module {
        lines.push(format!("module: {}", quote_scalar(Some(module))));
    }
    if let Some(title) = &issue.title {
        lines.push(format!("title: {}", quote_scalar(Some(title))));
    }
    if let Some(state) = &issue.state {
        lines.push(format!("state: {}", quote_scalar(Some(state))));
    }
    if let Some(priority) = &issue.priority {
        lines.push(format!("priority: {}", quote_scalar(Some(priority))));
    }

    if let Some(description) = &issue.description {
        if description.is_empty() {
            lines.push("description: null".to_string());
        } else {
            lines.push(format!("description: {}", yaml_literal(description)));
        }
    }

    if let Some(labels) = &issue.labels {
        if labels.is_empty() {
            lines.push("labels: []".to_string());
        } else {
            lines.push("labels:".to_string());
            for label in labels {
                lines.push(format!("  - {}", quote_scalar(Some(label))));
            }
        }
    }

    format!("{}\n", lines.join("\n"))
}
