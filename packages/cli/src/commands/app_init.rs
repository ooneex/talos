use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use clap::Args;
use fs_extra::dir::{CopyOptions, copy as copy_dir};

use crate::commands::agent_skills_create::AgentSkillsCreateArgs;
use crate::templates::llm::assistants::ASSISTANTS;
use crate::utils::{
    Action, Spinner, ask_confirm, ask_multiselect, clone_skeleton, ensure_bin,
    resolve_name_and_destination, run_actions,
};

#[derive(Args, Debug)]
pub struct AppInitArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub destination: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,

    #[arg(
        long,
        default_value_t = false,
        help = "Bypass the skeleton cache and re-download templates (the cache otherwise auto-refreshes after 24h)"
    )]
    pub no_cache: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppType {
    #[allow(
        dead_code,
        reason = "kept for parity with AppInitCommand.ts; no caller uses it yet"
    )]
    Cli,
    Api,
}

pub struct AppInitOptions {
    pub name: String,
    pub destination: PathBuf,
    pub silent: bool,
    pub app_type: Option<AppType>,
    pub no_cache: bool,
    /// Whether `execute` prints its own "initialized successfully" message.
    /// Callers that print their own closing summary (e.g. `app_create`) set
    /// this to `false` to avoid a duplicate message, while still letting
    /// `silent` control prompt suppression independently.
    pub announce: bool,
}

pub fn run(args: &AppInitArgs) {
    let Some((name, _kebab_name, destination)) =
        resolve_name_and_destination(args.name.clone(), args.destination.clone())
    else {
        return;
    };

    execute(AppInitOptions {
        name,
        destination,
        silent: args.silent,
        app_type: None,
        no_cache: args.no_cache,
        announce: !args.silent,
    });
}

/// Builds the post-scaffold actions: dependency install, git init (with an
/// optional commit-msg hook), and — when any agent directories were chosen —
/// scaffolding their skill files.
fn build_init_actions(
    destination: &Path,
    kebab_name: &str,
    skeleton_repo_dir: &Path,
    install_hook: bool,
    agent_dirs: &[String],
    silent: bool,
) -> Vec<Action> {
    let mut actions = vec![
        Action::new("Installing dependencies", {
            let destination = destination.to_path_buf();
            move || run_captured(Command::new("bun").arg("install").current_dir(&destination))
        }),
        Action::new("Initializing git repository", {
            let destination = destination.to_path_buf();
            move || {
                run_captured(Command::new("git").arg("init").current_dir(&destination))?;
                if install_hook {
                    write_commitlint_hook(&destination)?;
                }
                Ok(())
            }
        }),
    ];
    if !agent_dirs.is_empty() {
        actions.push(Action::new("Scaffolding agent skills", {
            let destination = destination.to_path_buf();
            let kebab_name = kebab_name.to_string();
            let skeleton_repo_dir = skeleton_repo_dir.to_path_buf();
            let agent_dirs = agent_dirs.to_vec();
            move || {
                run_agent_skills(
                    &skeleton_repo_dir,
                    &destination,
                    &kebab_name,
                    &agent_dirs,
                    silent,
                )
            }
        }));
    }
    actions
}

/// Prints every failed action and reports whether any of them should abort
/// the init: only the agent-skills step is allowed to fail without one.
fn report_action_failures(failures: &[(String, String)]) -> bool {
    let mut fatal = false;
    for (label, message) in failures {
        crate::utils::error(format!("{label} failed"));
        if !message.trim().is_empty() {
            eprintln!("{}", message.trim_end());
        }
        if label != "Scaffolding agent skills" {
            fatal = true;
        }
    }
    fatal
}

pub fn execute(options: AppInitOptions) -> Option<PathBuf> {
    let AppInitOptions {
        name,
        destination,
        silent,
        app_type,
        no_cache,
        announce,
    } = options;
    let kebab_name = crate::utils::to_kebab_case(&name);

    if !ensure_bin("git") {
        return None;
    }

    let skeleton_spinner = Spinner::start("Downloading skeleton...");
    let skeleton_dir = clone_skeleton(true, !no_cache);
    skeleton_spinner.stop();
    let skeleton_repo_dir = skeleton_dir?;
    crate::utils::success("Skeleton downloaded");

    let scaffold_spinner = Spinner::start("Preparing project files...");
    let scaffolded = scaffold_destination(&skeleton_repo_dir, &destination, &kebab_name, app_type);
    scaffold_spinner.stop();
    if let Err(error) = scaffolded {
        crate::utils::error(&error);
        return None;
    }
    crate::utils::success("Project files prepared");

    let install_hook = ask_confirm("Install the commit-msg hook?", true);

    let agent_dirs = resolve_agent_dirs(silent);

    let actions = build_init_actions(
        &destination,
        &kebab_name,
        &skeleton_repo_dir,
        install_hook,
        &agent_dirs,
        silent,
    );

    let failures = run_actions(actions);

    if report_action_failures(&failures) {
        return None;
    }

    if announce {
        crate::utils::success(format!(
            "{kebab_name} initialized successfully at {}",
            destination.display()
        ));
    }

    Some(destination)
}

fn run_captured(command: &mut Command) -> Result<(), String> {
    match command.output() {
        Ok(output) if output.status.success() => Ok(()),
        Ok(output) => Err(format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        )),
        Err(error) => Err(error.to_string()),
    }
}

pub fn scaffold_destination(
    skeleton_dir: &Path,
    destination: &Path,
    kebab_name: &str,
    app_type: Option<AppType>,
) -> Result<(), String> {
    if let Some(parent) = destination.parent()
        && !parent.as_os_str().is_empty()
    {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let _ = fs::remove_dir_all(destination);
    fs::create_dir_all(destination).map_err(|e| e.to_string())?;

    let options = CopyOptions::new().content_only(true).overwrite(true);
    copy_dir(skeleton_dir, destination, &options).map_err(|e| e.to_string())?;

    let _ = fs::remove_dir_all(destination.join(".git"));
    let _ = fs::remove_file(destination.join("bun.lock"));

    let env_example_path = destination
        .join("modules")
        .join("app")
        .join(".env.example.yml");
    if let Ok(content) = fs::read_to_string(&env_example_path) {
        fs::write(
            destination.join("modules").join("app").join(".env.yml"),
            content,
        )
        .map_err(|e| e.to_string())?;
        let _ = fs::remove_file(&env_example_path);
    }

    let readme_path = destination.join("README.md");
    if let Ok(readme) = fs::read_to_string(&readme_path) {
        let mut replaced = false;
        let updated: Vec<String> = readme
            .lines()
            .map(|line| {
                if !replaced && line.starts_with("# ") {
                    replaced = true;
                    format!("# {kebab_name}")
                } else {
                    line.to_string()
                }
            })
            .collect();
        fs::write(&readme_path, updated.join("\n")).map_err(|e| e.to_string())?;
    }

    let package_json_path = destination.join("package.json");
    if let Ok(package_json) = fs::read_to_string(&package_json_path) {
        let updated = set_package_json_name(&package_json, kebab_name);
        fs::write(&package_json_path, updated).map_err(|e| e.to_string())?;
    }

    match app_type {
        Some(AppType::Cli) => {
            let modules_dir = destination.join("modules");
            fs::remove_dir_all(&modules_dir).map_err(|e| e.to_string())?;
            fs::create_dir_all(&modules_dir).map_err(|e| e.to_string())?;
            let _ = fs::remove_file(destination.join(".dockerignore"));
        }
        Some(AppType::Api) | None => {
            keep_only_app_and_shared_modules(destination)?;
        }
    }

    Ok(())
}

/// Replaces the value of the top-level `"name"` field in `package.json` with
/// `kebab_name`, leaving every other line untouched so formatting survives.
fn set_package_json_name(package_json: &str, kebab_name: &str) -> String {
    let mut replaced = false;
    package_json
        .lines()
        .map(|line| {
            let trimmed = line.trim_start();
            if !replaced && trimmed.starts_with("\"name\"") && line.contains(':') {
                let indent = &line[..line.len() - trimmed.len()];
                let trailing = if line.trim_end().ends_with(',') {
                    ","
                } else {
                    ""
                };
                replaced = true;
                return format!("{indent}\"name\": \"{kebab_name}\"{trailing}");
            }
            line.to_string()
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Removes every module under `modules/` except `app` and `shared`, which
/// every scaffolded project (init or create) keeps as its baseline.
fn keep_only_app_and_shared_modules(destination: &Path) -> Result<(), String> {
    let modules_dir = destination.join("modules");
    let kept_modules = ["app", "shared"];
    for entry in fs::read_dir(&modules_dir)
        .map_err(|e| e.to_string())?
        .flatten()
    {
        let is_kept_module = entry
            .file_name()
            .to_str()
            .is_some_and(|name| kept_modules.contains(&name));
        if entry.path().is_dir() && !is_kept_module {
            fs::remove_dir_all(entry.path()).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn install_commitlint_hook(destination: &Path) -> Result<(), String> {
    let hook_path = write_commitlint_hook(destination)?;
    crate::utils::success(format!("{} installed successfully", hook_path.display()));
    Ok(())
}

fn write_commitlint_hook(destination: &Path) -> Result<PathBuf, String> {
    let repo = git2::Repository::open(destination)
        .map_err(|_| "commitlint:init must run inside a git repository".to_string())?;

    let _ = repo
        .config()
        .and_then(|mut config| config.remove("core.hooksPath"));

    let hooks_dir = repo.path().join("hooks");

    fs::create_dir_all(&hooks_dir).map_err(|e| e.to_string())?;

    let hook_path = hooks_dir.join("commit-msg");
    let hook_content = "#!/usr/bin/env sh\n\
# Talos commit-message linter — installed by `talos commitlint:init`.\n\
exec talos commitlint:check --file \"$1\"\n";
    fs::write(&hook_path, hook_content).map_err(|e| e.to_string())?;
    fs::set_permissions(&hook_path, fs::Permissions::from_mode(0o755))
        .map_err(|e| e.to_string())?;

    Ok(hook_path)
}

fn resolve_agent_dirs(silent: bool) -> Vec<String> {
    let default_dirs = || {
        ASSISTANTS
            .iter()
            .filter(|(_, _, enabled)| *enabled)
            .map(|(_, dir, _)| (*dir).to_string())
            .collect::<Vec<_>>()
    };

    if silent {
        return default_dirs();
    }

    let labels: Vec<&str> = ASSISTANTS.iter().map(|(name, _, _)| *name).collect();
    let defaults: Vec<bool> = ASSISTANTS.iter().map(|(_, _, enabled)| *enabled).collect();

    match ask_multiselect("Add skills for which assistants?", &labels, &defaults) {
        Some(indices) => indices
            .into_iter()
            .filter_map(|index| ASSISTANTS.get(index).map(|(_, dir, _)| (*dir).to_string()))
            .collect(),
        None => default_dirs(),
    }
}

fn run_agent_skills(
    skeleton_repo_dir: &Path,
    destination: &Path,
    kebab_name: &str,
    agent_dirs: &[String],
    silent: bool,
) -> Result<(), String> {
    let args = AgentSkillsCreateArgs {
        agents: agent_dirs.to_vec(),
        name: Some(kebab_name.to_string()),
        source_dir: Some(skeleton_repo_dir.to_string_lossy().into_owned()),
        silent,
        cwd: Some(destination.to_string_lossy().into_owned()),
        no_cache: false,
    };

    crate::commands::agent_skills_create::run(&args);
    Ok(())
}
