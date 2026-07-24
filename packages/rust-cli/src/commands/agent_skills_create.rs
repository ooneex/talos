use std::fs;
use std::path::{Path, PathBuf};

use clap::Args;

use crate::utils::{clone_skeleton, current_dir};

const DEFAULT_AGENTS: &[&str] = &[".claude", ".codex"];

#[derive(Args, Debug)]
pub struct AgentSkillsCreateArgs {
    #[arg(long = "agents")]
    pub agents: Vec<String>,

    #[arg(long)]
    pub name: Option<String>,

    #[arg(long = "source-dir")]
    pub source_dir: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,

    #[arg(long)]
    pub cwd: Option<String>,

    #[arg(long, default_value_t = false)]
    pub no_cache: bool,
}

fn visit_files_recursive(dir: &Path, callback: &mut impl FnMut(&Path, &Path)) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            visit_files_recursive(&path, callback);
        } else if path.is_file() {
            callback(dir, &path);
        }
    }
}

fn parse_front_matter(source: &str) -> (std::collections::BTreeMap<String, String>, String) {
    if let Some(rest) = source.strip_prefix("---\n")
        && let Some(index) = rest.find("\n---\n")
    {
        let front = &rest[..index];
        let body = rest[index + 5..].trim().to_string();
        let mut data = std::collections::BTreeMap::new();
        for line in front.lines() {
            if let Some((key, value)) = line.split_once(':') {
                data.insert(key.trim().to_string(), value.trim().to_string());
            }
        }
        return (data, body);
    }
    (std::collections::BTreeMap::new(), source.trim().to_string())
}

fn merge_description(data: &std::collections::BTreeMap<String, String>) -> String {
    [data.get("description"), data.get("when_to_use")]
        .into_iter()
        .flatten()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join(" ")
}

fn can_write_files(data: &std::collections::BTreeMap<String, String>) -> bool {
    data.get("tools")
        .is_some_and(|tools| tools.contains("Write") || tools.contains("Edit"))
}

fn to_title_case(name: &str) -> String {
    name.split(['-', '.'])
        .filter(|part| !part.is_empty())
        .map(|part| format!("{}{}", part[..1].to_uppercase(), &part[1..]))
        .collect::<Vec<_>>()
        .join(" ")
}

fn toml_basic_string(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn to_codex_agent(source: &str) -> String {
    let (data, body) = parse_front_matter(source);
    let mut lines = vec![
        format!(
            "name = {}",
            toml_basic_string(data.get("name").map(String::as_str).unwrap_or_default())
        ),
        format!(
            "description = {}",
            toml_basic_string(&merge_description(&data))
        ),
    ];
    if let Some(effort) = data.get("effort") {
        lines.push(format!(
            "model_reasoning_effort = {}",
            toml_basic_string(effort)
        ));
    }
    lines.push(format!(
        "sandbox_mode = {}",
        toml_basic_string(if can_write_files(&data) {
            "workspace-write"
        } else {
            "read-only"
        })
    ));
    lines.push(format!(
        "nickname_candidates = [{}]",
        toml_basic_string(&to_title_case(
            data.get("name").map(String::as_str).unwrap_or_default()
        ))
    ));
    lines.push("developer_instructions = '''".to_string());
    lines.push(body);
    lines.push("'''".to_string());
    format!("{}\n", lines.join("\n"))
}

fn to_codex_skill(source: &str) -> String {
    let (data, body) = parse_front_matter(source);
    format!(
        "---\nname: {}\ndescription: {}\n---\n\n{}\n",
        data.get("name").cloned().unwrap_or_default(),
        merge_description(&data),
        body
    )
}

fn copy_default_layout(source_root: &Path, config_dir: &str, cwd: &Path, silent: bool) {
    let assistants_root = source_root.join(".claude");
    for folder in ["agents", "skills"] {
        let source = assistants_root.join(folder);
        if !source.exists() {
            continue;
        }
        let mut copy_file = |base: &Path, file_path: &Path| {
            let relative = file_path.strip_prefix(base).unwrap_or(file_path);
            let dest = cwd.join(config_dir).join(folder).join(relative);
            if let Some(parent) = dest.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if let Ok(content) = fs::read_to_string(file_path) {
                let _ = fs::write(&dest, content);
                if !silent {
                    crate::utils::success(format!("{} created successfully", dest.display()));
                }
            }
        };
        visit_files_recursive(&source, &mut copy_file);
    }
}

fn copy_codex_layout(source_root: &Path, cwd: &Path, silent: bool) {
    let assistants_root = source_root.join(".claude");
    let agents_dir = assistants_root.join("agents");
    let skills_dir = assistants_root.join("skills");
    let mut copy_agent = |base: &Path, file_path: &Path| {
        let relative = file_path.strip_prefix(base).unwrap_or(file_path);
        let dest = cwd
            .join(".codex")
            .join("agents")
            .join(relative)
            .with_extension("toml");
        if let Some(parent) = dest.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(content) = fs::read_to_string(file_path) {
            let _ = fs::write(&dest, to_codex_agent(&content));
            if !silent {
                crate::utils::success(format!("{} created successfully", dest.display()));
            }
        }
    };
    visit_files_recursive(&agents_dir, &mut copy_agent);
    let mut copy_skill = |base: &Path, file_path: &Path| {
        let relative = file_path.strip_prefix(base).unwrap_or(file_path);
        let dest = cwd.join(".codex").join("skills").join(relative);
        if let Some(parent) = dest.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(content) = fs::read_to_string(file_path) {
            let final_content =
                if file_path.file_name().and_then(|n| n.to_str()) == Some("SKILL.md") {
                    to_codex_skill(&content)
                } else {
                    content
                };
            let _ = fs::write(&dest, final_content);
            if !silent {
                crate::utils::success(format!("{} created successfully", dest.display()));
            }
        }
    };
    visit_files_recursive(&skills_dir, &mut copy_skill);
}

pub fn run(args: &AgentSkillsCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let agent_dirs: Vec<String> = if args.agents.is_empty() {
        DEFAULT_AGENTS.iter().map(|v| (*v).to_string()).collect()
    } else {
        args.agents.clone()
    };
    let project_name = args.name.clone().unwrap_or_else(|| {
        cwd.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("app")
            .to_string()
    });

    let repo_dir = if let Some(source_dir) = &args.source_dir {
        PathBuf::from(source_dir)
    } else {
        match clone_skeleton(args.silent, !args.no_cache) {
            Some(path) => path,
            None => return,
        }
    };

    let agents_md_path = repo_dir.join("AGENTS.md");
    if let Ok(content) = fs::read_to_string(&agents_md_path) {
        let rendered = content.replace("{{NAME}}", &project_name);
        let dest = cwd.join("AGENTS.md");
        let _ = fs::write(&dest, rendered);
        if !args.silent {
            crate::utils::success(format!("{} created successfully", dest.display()));
        }
    }

    for config_dir in &agent_dirs {
        if config_dir == ".codex" {
            copy_codex_layout(&repo_dir, &cwd, args.silent);
        } else {
            copy_default_layout(&repo_dir, config_dir, &cwd, args.silent);
        }
    }
}
