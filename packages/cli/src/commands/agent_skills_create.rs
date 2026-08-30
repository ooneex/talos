use std::fs;
use std::path::{Path, PathBuf};

use clap::Args;

use crate::templates::llm::assistants::{
    NativeCodexInput, ScaffoldInput, SkillInput, default_config_dirs, resolve_adapter,
};
use crate::utils::{clone_skeleton, current_dir};

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

    #[arg(
        long,
        default_value_t = false,
        help = "Bypass the skeleton template cache and re-download templates (auto-refreshes after 24h); does not update the installed talos CLI binary itself — rerun the install script for that"
    )]
    pub no_cache: bool,
}

/// Read one assistant's agent files into `(name, content)` pairs sorted by file
/// name.
fn read_agents(repo_dir: &Path, config_dir: &str, extension: &str) -> Vec<(String, String)> {
    let agents_dir = repo_dir.join(config_dir).join("agents");
    let Ok(entries) = fs::read_dir(&agents_dir) else {
        return Vec::new();
    };

    let mut agents: Vec<(String, String)> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some(extension) {
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

/// Read one assistant's `skills/*/SKILL.md` folders into `(name, skill)` pairs
/// sorted by directory name.
fn read_skills(repo_dir: &Path, config_dir: &str) -> Vec<(String, SkillInput)> {
    let skills_dir = repo_dir.join(config_dir).join("skills");
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
    let codex_dir = repo_dir.join(".codex");
    let native_codex = codex_dir.is_dir().then(|| NativeCodexInput {
        agents: read_agents(repo_dir, ".codex", "toml"),
        skills: read_skills(repo_dir, ".codex"),
    });

    ScaffoldInput {
        agents_md,
        agents: read_agents(repo_dir, ".claude", "md"),
        skills: read_skills(repo_dir, ".claude"),
        native_codex,
    }
}

/// Codex discovers repository skills through `.agents/skills`. Keep the
/// canonical generated files under `.codex/skills` and expose them through one
/// relative directory symlink, without replacing an existing user-owned path.
fn ensure_codex_skill_discovery(cwd: &Path) {
    let source = cwd.join(".codex").join("skills");
    let link = cwd.join(".agents").join("skills");
    if !source.is_dir() || fs::symlink_metadata(&link).is_ok() {
        return;
    }

    let Some(parent) = link.parent() else {
        return;
    };
    if fs::create_dir_all(parent).is_err() {
        return;
    }

    #[cfg(unix)]
    let _ = std::os::unix::fs::symlink(Path::new("../.codex/skills"), &link);

    #[cfg(windows)]
    let _ = std::os::windows::fs::symlink_dir(Path::new("../.codex/skills"), &link);
}

pub fn run(args: &AgentSkillsCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let agent_dirs: Vec<String> = if args.agents.is_empty() {
        default_config_dirs()
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
        let mut written = 0usize;
        for file in adapter(&input, config_dir) {
            let dest = cwd.join(&file.path);
            if let Some(parent) = dest.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if fs::write(&dest, &file.content).is_ok() {
                written += 1;
            }
        }
        if written > 0 && !args.silent {
            let label = if written == 1 { "file" } else { "files" };
            crate::utils::success(format!(
                "{config_dir} created successfully ({written} {label})"
            ));
        }
    }

    if agent_dirs.iter().any(|dir| dir == ".codex") {
        ensure_codex_skill_discovery(&cwd);
    }
}
