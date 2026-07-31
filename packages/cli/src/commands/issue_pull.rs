use std::path::{Path, PathBuf};

use clap::Args;

use crate::utils::github::{self, GithubIssue};
use crate::utils::linear::{LinearClient, LinearIssue};
use crate::utils::{
    IssueYaml, Provider, current_dir, ensure_module, generate_issue_id, issue_to_yaml,
};

#[derive(Args, Debug)]
pub struct IssuePullArgs {
    /// Comma-separated list of issue ids, e.g. `--id=ABC-1,ABC-2`.
    #[arg(long, value_delimiter = ',', num_args = 1..)]
    pub id: Vec<String>,

    #[arg(long)]
    pub module: Option<String>,

    /// Issue tracker to pull from.
    #[arg(long, value_enum, default_value_t = Provider::Linear)]
    pub provider: Provider,

    #[arg(long)]
    pub cwd: Option<String>,
}

/// Provider-agnostic representation of a pulled issue, ready to be written to
/// a local YAML file.
struct PulledIssue {
    identifier: String,
    title: String,
    state: Option<String>,
    priority: Option<String>,
    description: String,
    labels: Vec<String>,
}

impl PulledIssue {
    fn from_linear(issue: &LinearIssue, fallback_id: &str) -> Self {
        Self {
            identifier: issue
                .identifier
                .clone()
                .unwrap_or_else(|| fallback_id.to_string()),
            title: issue.title.clone().unwrap_or_default().trim().to_string(),
            state: issue.state.clone().or_else(|| Some("Todo".to_string())),
            priority: issue.priority.clone(),
            description: issue
                .description
                .clone()
                .unwrap_or_default()
                .trim()
                .to_string(),
            labels: issue.labels.clone(),
        }
    }

    fn from_github(issue: &GithubIssue, fallback_id: &str) -> Self {
        Self {
            identifier: issue
                .identifier
                .clone()
                .unwrap_or_else(|| fallback_id.trim_start_matches('#').to_string()),
            title: issue.title.clone().unwrap_or_default().trim().to_string(),
            state: issue.state.clone().or_else(|| Some("Todo".to_string())),
            priority: None,
            description: issue
                .description
                .clone()
                .unwrap_or_default()
                .trim()
                .to_string(),
            labels: issue.labels.clone(),
        }
    }

    fn to_yaml(&self, module: &str, issues_dir: &Path) -> String {
        let id = if self.identifier.is_empty() {
            generate_issue_id(Some(issues_dir))
        } else {
            self.identifier.clone()
        };
        issue_to_yaml(&IssueYaml {
            id: Some(id),
            module: Some(module.to_string()),
            title: Some(self.title.clone()),
            state: self.state.clone(),
            priority: self.priority.clone(),
            description: Some(self.description.clone()),
            labels: Some(self.labels.clone()),
        })
    }
}

/// Locate an already-pulled issue file by identifier across every module,
/// returning its owning module and path so it can be updated in place.
fn find_existing_issue(modules_dir: &Path, identifier: &str) -> Option<(String, PathBuf)> {
    for entry in std::fs::read_dir(modules_dir).ok()?.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let candidate = path.join("issues").join(format!("{identifier}.yml"));
        if candidate.exists() {
            return Some((entry.file_name().to_string_lossy().to_string(), candidate));
        }
    }
    None
}

/// Resolve where a pulled issue should be written: in place when it already
/// exists locally, otherwise under the requested module.
fn resolve_target(
    modules_dir: &Path,
    default_module: &str,
    cwd: &Path,
    identifier: &str,
) -> (String, PathBuf) {
    match find_existing_issue(modules_dir, identifier) {
        Some((existing_module, existing_path)) => {
            let issues_dir = existing_path
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| modules_dir.join(&existing_module).join("issues"));
            (existing_module, issues_dir)
        }
        None => {
            ensure_module(default_module, cwd);
            let issues_dir = modules_dir.join(default_module).join("issues");
            let _ = std::fs::create_dir_all(&issues_dir);
            (default_module.to_string(), issues_dir)
        }
    }
}

/// Persist a pulled issue to disk and report the result. Returns `true` on
/// success.
fn write_pulled(
    modules_dir: &Path,
    default_module: &str,
    cwd: &Path,
    pulled: &PulledIssue,
) -> bool {
    let (target_module, issues_dir) =
        resolve_target(modules_dir, default_module, cwd, &pulled.identifier);
    let yaml = pulled.to_yaml(&target_module, &issues_dir);
    let file_path = issues_dir.join(format!("{}.yml", pulled.identifier));
    let existed = file_path.exists();

    if let Err(error) = std::fs::write(&file_path, yaml) {
        crate::utils::error(format!("Failed to write {}: {error}", file_path.display()));
        return false;
    }

    crate::utils::success(format!(
        "modules/{target_module}/issues/{}.yml {} successfully",
        pulled.identifier,
        if existed { "updated" } else { "created" }
    ));
    true
}

pub fn run(args: &IssuePullArgs) {
    let ids: Vec<String> = args
        .id
        .iter()
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect();

    if ids.is_empty() {
        crate::utils::error(
            "Provide at least one issue id, e.g. `talos issue:pull --id=ABC-1,ABC-2`",
        );
        std::process::exit(1);
    }

    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let module = args.module.clone().unwrap_or_else(|| "shared".to_string());
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
        let pulled = match args.provider {
            Provider::Linear => {
                let Some(issue) = client.as_ref().and_then(|client| client.get_issue(id)) else {
                    crate::utils::error(format!("Failed to pull issue from Linear: {id}"));
                    failures += 1;
                    continue;
                };
                PulledIssue::from_linear(&issue, id)
            }
            Provider::Github => {
                let Some(issue) = github::get_issue(id) else {
                    crate::utils::error(format!("Failed to pull issue from GitHub: {id}"));
                    failures += 1;
                    continue;
                };
                PulledIssue::from_github(&issue, id)
            }
        };

        if !write_pulled(&modules_dir, &module, &cwd, &pulled) {
            failures += 1;
        }
    }

    if failures > 0 {
        std::process::exit(1);
    }
}
