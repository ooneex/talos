use std::fs;
use std::path::{Path, PathBuf};

use clap::Args;

use crate::templates::llm::assistants::{ScaffoldInput, SkillInput, resolve_adapter};
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

/// Read the skeleton's `.claude/agents/*.md` files into `(name, content)` pairs
/// sorted by file name.
fn read_agents(repo_dir: &Path) -> Vec<(String, String)> {
    let agents_dir = repo_dir.join(".claude").join("agents");
    let Ok(entries) = fs::read_dir(&agents_dir) else {
        return Vec::new();
    };

    let mut agents: Vec<(String, String)> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("md") {
                return None;
            }
            let name = path.file_stem()?.to_str()?.to_string();
            let content = fs::read_to_string(&path).ok()?;
            Some((name, content))
        })
        .collect();

    agents.sort_by(|(left, _), (right, _)| left.cmp(right));
    agents
}

/// Read a skill's `references/*` files into `(name, content)` pairs sorted by
/// file name.
fn read_skill_references(skill_dir: &Path) -> Vec<(String, String)> {
    let references_dir = skill_dir.join("references");
    let Ok(entries) = fs::read_dir(&references_dir) else {
        return Vec::new();
    };

    let mut references: Vec<(String, String)> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_file() {
                return None;
            }
            let name = path.file_name()?.to_str()?.to_string();
            let content = fs::read_to_string(&path).ok()?;
            Some((name, content))
        })
        .collect();

    references.sort_by(|(left, _), (right, _)| left.cmp(right));
    references
}

/// Read the skeleton's `.claude/skills/*/SKILL.md` folders into `(name, skill)`
/// pairs sorted by directory name.
fn read_skills(repo_dir: &Path) -> Vec<(String, SkillInput)> {
    let skills_dir = repo_dir.join(".claude").join("skills");
    let Ok(entries) = fs::read_dir(&skills_dir) else {
        return Vec::new();
    };

    let mut skills: Vec<(String, SkillInput)> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_dir() {
                return None;
            }
            let name = path.file_name()?.to_str()?.to_string();
            let source = fs::read_to_string(path.join("SKILL.md")).ok()?;
            let references = read_skill_references(&path);
            Some((name, SkillInput { source, references }))
        })
        .collect();

    skills.sort_by(|(left, _), (right, _)| left.cmp(right));
    skills
}

/// Build the shared scaffold input from the cloned skeleton, rendering the
/// project name into `AGENTS.md`.
fn load_scaffold_input(repo_dir: &Path, project_name: &str) -> ScaffoldInput {
    let agents_md = fs::read_to_string(repo_dir.join("AGENTS.md"))
        .unwrap_or_default()
        .replace("{{NAME}}", project_name);

    ScaffoldInput {
        agents_md,
        agents: read_agents(repo_dir),
        skills: read_skills(repo_dir),
    }
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

    let input = load_scaffold_input(&repo_dir, &project_name);

    for config_dir in &agent_dirs {
        let adapter = resolve_adapter(config_dir);
        for file in adapter(&input, config_dir) {
            let dest = cwd.join(&file.path);
            if let Some(parent) = dest.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if fs::write(&dest, &file.content).is_ok() && !args.silent {
                crate::utils::success(format!("{} created successfully", dest.display()));
            }
        }
    }
}
