use std::path::{Path, PathBuf};

use clap::Args;

use crate::utils::github::{self, GithubIssue};
use crate::utils::linear::LinearIssue;
use crate::utils::{
    IssueYaml, Provider, current_dir, ensure_module, generate_issue_id, issue_to_yaml,
    resolve_provider_client,
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
    team: Option<String>,
    project: Option<String>,
    milestone: Option<String>,
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
            team: issue.team.clone(),
            project: issue.project.clone(),
            milestone: issue.milestone.clone(),
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
            team: None,
            project: None,
            milestone: None,
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
            team: self.team.clone(),
            project: self.project.clone(),
            milestone: self.milestone.clone(),
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

    let client = resolve_provider_client(args.provider);

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

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::{PulledIssue, find_existing_issue, resolve_target, write_pulled};
    use crate::utils::github::GithubIssue;
    use crate::utils::linear::LinearIssue;

    #[test]
    fn pulled_issue_from_linear_trims_and_defaults_values() {
        let issue = LinearIssue {
            identifier: None,
            title: Some("  Add tests  ".to_string()),
            description: Some("  Cover more lines  ".to_string()),
            priority: Some("High".to_string()),
            state: None,
            team: Some("ENG".to_string()),
            project: Some("v3".to_string()),
            milestone: Some("Homepage".to_string()),
            labels: vec!["coverage".to_string()],
            comments: Vec::new(),
        };

        let pulled = PulledIssue::from_linear(&issue, "ABC-123");

        assert_eq!(pulled.identifier, "ABC-123");
        assert_eq!(pulled.title, "Add tests");
        assert_eq!(pulled.description, "Cover more lines");
        assert_eq!(pulled.state.as_deref(), Some("Todo"));
        assert_eq!(pulled.priority.as_deref(), Some("High"));
        assert_eq!(pulled.labels, vec!["coverage".to_string()]);
        assert_eq!(pulled.team.as_deref(), Some("ENG"));
        assert_eq!(pulled.project.as_deref(), Some("v3"));
        assert_eq!(pulled.milestone.as_deref(), Some("Homepage"));
    }

    #[test]
    fn pulled_issue_from_github_trims_and_normalizes_identifier() {
        let issue = GithubIssue {
            identifier: None,
            title: Some("  Fix bug  ".to_string()),
            description: Some("  Repro steps  ".to_string()),
            state: None,
            labels: vec!["bug".to_string()],
            comments: Vec::new(),
        };

        let pulled = PulledIssue::from_github(&issue, "#42");

        assert_eq!(pulled.identifier, "42");
        assert_eq!(pulled.title, "Fix bug");
        assert_eq!(pulled.description, "Repro steps");
        assert_eq!(pulled.state.as_deref(), Some("Todo"));
        assert_eq!(pulled.priority, None);
        assert_eq!(pulled.labels, vec!["bug".to_string()]);
        assert_eq!(pulled.team, None);
    }

    #[test]
    fn to_yaml_uses_existing_identifier_and_module() {
        let root = tempdir().expect("tempdir");
        let issues_dir = root.path().join("modules/shared/issues");
        fs::create_dir_all(&issues_dir).expect("issues dir");

        let yaml = PulledIssue {
            identifier: "ABC-123".to_string(),
            title: "Add tests".to_string(),
            state: Some("Todo".to_string()),
            priority: Some("Medium".to_string()),
            team: Some("ENG".to_string()),
            project: Some("v3".to_string()),
            milestone: Some("Homepage".to_string()),
            description: "Details".to_string(),
            labels: vec!["coverage".to_string()],
        }
        .to_yaml("shared", &issues_dir);

        assert!(yaml.contains("id: \"ABC-123\""));
        assert!(yaml.contains("module: \"shared\""));
        assert!(yaml.contains("title: \"Add tests\""));
        assert!(yaml.contains("priority: \"Medium\""));
        // Placement survives the round trip, so pushing a pulled issue back
        // leaves it where it was instead of moving it to the fallback team.
        assert!(yaml.contains("team: \"ENG\""));
        assert!(yaml.contains("project: \"v3\""));
        assert!(yaml.contains("milestone: \"Homepage\""));
    }

    #[test]
    fn find_existing_issue_and_resolve_target_prefer_existing_module() {
        let root = tempdir().expect("tempdir");
        let modules_dir = root.path().join("modules");
        let existing_dir = modules_dir.join("billing/issues");
        fs::create_dir_all(&existing_dir).expect("existing issues dir");
        let existing_file = existing_dir.join("ABC-123.yml");
        fs::write(&existing_file, "id: \"ABC-123\"\n").expect("issue file");

        let found = find_existing_issue(&modules_dir, "ABC-123").expect("existing issue");
        assert_eq!(found.0, "billing");
        assert_eq!(found.1, existing_file);

        let resolved = resolve_target(&modules_dir, "shared", root.path(), "ABC-123");
        assert_eq!(resolved.0, "billing");
        assert_eq!(resolved.1, existing_dir);
    }

    #[test]
    fn resolve_target_creates_default_module_issues_dir() {
        let root = tempdir().expect("tempdir");
        let modules_dir = root.path().join("modules");
        fs::create_dir_all(root.path().join("modules/shared")).expect("shared module");
        fs::write(
            root.path().join("modules/shared/package.json"),
            "{ \"name\": \"shared\" }\n",
        )
        .expect("package");
        fs::write(
            root.path().join("modules/shared/shared.yml"),
            "name: \"shared\"\ntype: \"library\"\n",
        )
        .expect("module yml");

        let resolved = resolve_target(&modules_dir, "shared", root.path(), "NEW-1");

        assert_eq!(resolved.0, "shared");
        assert_eq!(resolved.1, root.path().join("modules/shared/issues"));
        assert!(resolved.1.is_dir());
    }

    #[test]
    fn write_pulled_creates_and_updates_issue_file() {
        let root = tempdir().expect("tempdir");
        let modules_dir = root.path().join("modules");
        let shared_dir = root.path().join("modules/shared");
        fs::create_dir_all(&shared_dir).expect("shared module");
        fs::write(
            shared_dir.join("package.json"),
            "{ \"name\": \"shared\" }\n",
        )
        .expect("package");
        fs::write(
            shared_dir.join("shared.yml"),
            "name: \"shared\"\ntype: \"library\"\n",
        )
        .expect("module yml");

        let pulled = PulledIssue {
            identifier: "ABC-123".to_string(),
            title: "Add tests".to_string(),
            state: Some("Todo".to_string()),
            priority: Some("High".to_string()),
            team: None,
            project: None,
            milestone: None,
            description: "Initial body".to_string(),
            labels: vec!["coverage".to_string()],
        };

        assert!(write_pulled(&modules_dir, "shared", root.path(), &pulled));

        let file_path = root.path().join("modules/shared/issues/ABC-123.yml");
        let created = fs::read_to_string(&file_path).expect("created issue");
        assert!(created.contains("title: \"Add tests\""));

        let updated = PulledIssue {
            description: "Updated body".to_string(),
            ..pulled
        };
        assert!(write_pulled(&modules_dir, "shared", root.path(), &updated));
        let updated_contents = fs::read_to_string(&file_path).expect("updated issue");
        assert!(updated_contents.contains("Updated body"));
    }
}
