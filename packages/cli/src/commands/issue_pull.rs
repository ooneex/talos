use std::path::{Path, PathBuf};

use clap::Args;

use crate::utils::linear::{LinearClient, LinearIssue};
use crate::utils::{IssueYaml, current_dir, ensure_module, generate_issue_id, issue_to_yaml};

#[derive(Args, Debug)]
pub struct IssuePullArgs {
    /// Comma-separated list of Linear issue ids, e.g. `--id=ABC-1,ABC-2`.
    #[arg(long, value_delimiter = ',', num_args = 1..)]
    pub id: Vec<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,
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

fn issue_to_yaml_file(issue: &LinearIssue, module: &str, issues_dir: &Path) -> String {
    let id = issue
        .identifier
        .clone()
        .unwrap_or_else(|| generate_issue_id(Some(issues_dir)));

    issue_to_yaml(&IssueYaml {
        id: Some(id),
        module: Some(module.to_string()),
        title: Some(issue.title.clone().unwrap_or_default().trim().to_string()),
        state: issue.state.clone().or_else(|| Some("Todo".to_string())),
        priority: issue.priority.clone(),
        description: Some(
            issue
                .description
                .clone()
                .unwrap_or_default()
                .trim()
                .to_string(),
        ),
        labels: Some(issue.labels.clone()),
    })
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

    let Some(client) = LinearClient::from_credentials() else {
        crate::utils::error("No Linear credentials found. Run `talos linear:credentials:create`");
        std::process::exit(1);
    };

    let mut failures = 0;
    for id in &ids {
        let Some(issue) = client.get_issue(id) else {
            crate::utils::error(format!("Failed to pull issue from Linear: {id}"));
            failures += 1;
            continue;
        };

        let identifier = issue.identifier.clone().unwrap_or_else(|| id.clone());

        // Update the issue in place when it already exists locally (in any
        // module); otherwise create it under the requested module.
        let (target_module, issues_dir) = match find_existing_issue(&modules_dir, &identifier) {
            Some((existing_module, existing_path)) => {
                let issues_dir = existing_path
                    .parent()
                    .map(Path::to_path_buf)
                    .unwrap_or_else(|| modules_dir.join(&existing_module).join("issues"));
                (existing_module, issues_dir)
            }
            None => {
                ensure_module(&module, &cwd);
                let issues_dir = modules_dir.join(&module).join("issues");
                let _ = std::fs::create_dir_all(&issues_dir);
                (module.clone(), issues_dir)
            }
        };

        let yaml = issue_to_yaml_file(&issue, &target_module, &issues_dir);
        let file_path = issues_dir.join(format!("{identifier}.yml"));
        let existed = file_path.exists();

        if let Err(error) = std::fs::write(&file_path, yaml) {
            crate::utils::error(format!("Failed to write {}: {error}", file_path.display()));
            failures += 1;
            continue;
        }

        crate::utils::success(format!(
            "modules/{target_module}/issues/{identifier}.yml {} successfully",
            if existed { "updated" } else { "created" }
        ));
    }

    if failures > 0 {
        std::process::exit(1);
    }
}
