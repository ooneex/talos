use clap::Args;

use crate::utils::{IssueYaml, current_dir, ensure_module, generate_issue_id, issue_to_yaml};

#[derive(Args, Debug)]
pub struct IssueCreateArgs {
    #[arg(long)]
    pub title: Option<String>,

    #[arg(long)]
    pub priority: Option<String>,

    #[arg(long)]
    pub description: Option<String>,

    #[arg(long = "label")]
    pub labels: Vec<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &IssueCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let module = args.module.clone().unwrap_or_else(|| "shared".to_string());
    let priority = args
        .priority
        .clone()
        .unwrap_or_else(|| "Medium".to_string());
    let title = args.title.clone().unwrap_or_default();
    let description = args.description.clone().unwrap_or_default();

    ensure_module(&module, &cwd);

    let base = cwd.join("modules").join(&module);
    let issues_dir = base.join("issues");
    let _ = std::fs::create_dir_all(&issues_dir);

    let resolved_id = generate_issue_id(Some(&issues_dir));
    let yaml = issue_to_yaml(&IssueYaml {
        id: Some(resolved_id.clone()),
        module: Some(module.clone()),
        title: Some(title.trim().to_string()),
        state: Some("Todo".to_string()),
        priority: Some(priority.trim().to_string()),
        description: Some(description.trim().to_string()),
        labels: Some(args.labels.clone()),
    });

    let file_path = issues_dir.join(format!("{resolved_id}.yml"));
    if let Err(error) = std::fs::write(&file_path, yaml) {
        crate::utils::error(format!("Failed to write {}: {error}", file_path.display()));
        return;
    }

    crate::utils::success(format!("{} created successfully", file_path.display()));
}
