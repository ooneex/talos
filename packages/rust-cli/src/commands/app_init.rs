use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use clap::Args;
use fs_extra::dir::{CopyOptions, copy as copy_dir};

use crate::utils::{
    Action, Spinner, ask_confirm, ask_multiselect, clone_skeleton, ensure_bin,
    resolve_name_and_destination, run_actions,
};

/// Coding assistants `agent:skills:create` can scaffold shared skills/config
/// for, mapped to the directory each one reads its configuration from — mirrors
/// the `AGENTS` list in `packages/cli/src/prompts/askAgentSkills.ts`. The third
/// field marks the assistants enabled by default. Passing these dirs explicitly
/// via `--agents` bypasses the subcommand's interactive multiselect, which would
/// otherwise hang when driven as a captured, non-interactive child process.
const AGENT_SKILLS: [(&str, &str, bool); 10] = [
    ("Claude", ".claude", true),
    ("Codex", ".codex", true),
    ("Cursor", ".cursor", false),
    ("Gemini", ".gemini", false),
    ("Windsurf", ".windsurf", false),
    ("Cline", ".cline", false),
    ("JetBrains Junie", ".junie", false),
    ("Roo Code", ".roo", false),
    ("Continue", ".continue", false),
    ("Zed", ".zed", false),
];

/// Rust port of `packages/cli/src/commands/AppInitCommand.ts`.
#[derive(Args, Debug)]
pub struct AppInitArgs {
    /// Application name.
    #[arg(long)]
    pub name: Option<String>,

    /// Destination path for the new application.
    #[arg(long)]
    pub destination: Option<String>,

    /// Suppress success/progress messages.
    #[arg(long, default_value_t = false)]
    pub silent: bool,

    /// Ignore the cached skeleton and re-download it.
    #[arg(long, default_value_t = false)]
    pub no_cache: bool,
}

/// Mirrors the `appType` option of `AppInitCommand`, which prunes the
/// scaffolded `modules/` directory for non-full-stack applications. Not
/// exposed as a CLI flag (it isn't in the TypeScript CLI either); it is only
/// used when another command (e.g. `app:create`) drives `app:init`
/// programmatically.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppType {
    #[allow(
        dead_code,
        reason = "kept for parity with AppInitCommand.ts; no caller uses it yet"
    )]
    Cli,
    Api,
}

/// Fully-resolved options for [`execute`], built either from CLI args
/// ([`AppInitArgs`]) or programmatically by another command.
pub struct AppInitOptions {
    pub name: String,
    pub destination: PathBuf,
    pub silent: bool,
    pub app_type: Option<AppType>,
    pub no_cache: bool,
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
    });
}

/// Runs the full init flow and returns the destination on success, so callers
/// like `app:create` can chain further scaffolding onto it.
pub fn execute(options: AppInitOptions) -> Option<PathBuf> {
    let AppInitOptions {
        name,
        destination,
        silent,
        app_type,
        no_cache,
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

    // Ask the one interactive question up front so the slow, dependency-free
    // steps below can run concurrently behind an animated spinner without a
    // prompt interrupting the live display.
    let install_hook = ask_confirm("Install the commit-msg hook?", true);

    // `oo` is probed once here (rather than inside the concurrent action) so a
    // "not found" warning never corrupts the live multi-line spinner.
    let oo_available = Command::new("oo")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);

    // Resolve which assistant config dirs to scaffold up front (like the hook
    // prompt above) so the answer is passed explicitly to `oo` via `--agents`.
    // Without it the subcommand falls back to an interactive multiselect, which
    // hangs forever when run as a captured child process with no usable stdin.
    let agent_dirs = if oo_available {
        resolve_agent_dirs(silent)
    } else {
        Vec::new()
    };

    // The three steps below have no ordering dependency on each other, so they
    // run in parallel instead of one after another — the dominant cost is the
    // network-bound `bun install`, which now overlaps with `git init` and the
    // `oo` agent-skills scaffold (itself a whole CLI boot).
    let mut actions = vec![
        Action::new("Installing dependencies", {
            let destination = destination.clone();
            move || run_captured(Command::new("bun").arg("install").current_dir(&destination))
        }),
        Action::new("Initializing git repository", {
            let destination = destination.clone();
            move || {
                run_captured(Command::new("git").arg("init").current_dir(&destination))?;
                if install_hook {
                    write_commitlint_hook(&destination)?;
                }
                Ok(())
            }
        }),
    ];
    if oo_available && !agent_dirs.is_empty() {
        actions.push(Action::new("Scaffolding agent skills", {
            let destination = destination.clone();
            let kebab_name = kebab_name.clone();
            move || run_agent_skills(&destination, &kebab_name, &agent_dirs, silent)
        }));
    }

    let failures = run_actions(actions);
    if !oo_available {
        crate::utils::warn("Skipping agent skills scaffolding: \"oo\" was not found on the PATH");
    }

    let mut fatal = false;
    for (label, message) in &failures {
        crate::utils::error(format!("{label} failed"));
        if !message.trim().is_empty() {
            eprintln!("{}", message.trim_end());
        }
        // Agent-skills scaffolding is best-effort (as in the TypeScript CLI);
        // only a failed install or git init aborts the flow.
        if label != "Scaffolding agent skills" {
            fatal = true;
        }
    }
    if fatal {
        return None;
    }

    if !silent {
        crate::utils::success(format!(
            "{kebab_name} initialized successfully at {}",
            destination.display()
        ));
    }

    Some(destination)
}

/// Runs `command` with its output captured, returning the combined
/// stdout/stderr as the error message on failure so callers (e.g. the parallel
/// action runner) can surface it without streaming into a live spinner.
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

/// Copies the skeleton into `destination` and rewrites the per-app files
/// (`.env.yml`, `README.md`), optionally pruning `modules/` per `app_type`.
/// `pub` so it is exercised directly by the integration tests in `tests/`.
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

    let env_example_path = destination.join(".env.example.yml");
    if let Ok(content) = fs::read_to_string(&env_example_path) {
        fs::write(destination.join(".env.yml"), content).map_err(|e| e.to_string())?;
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

    match app_type {
        Some(AppType::Cli) => {
            let modules_dir = destination.join("modules");
            fs::remove_dir_all(&modules_dir).map_err(|e| e.to_string())?;
            fs::create_dir_all(&modules_dir).map_err(|e| e.to_string())?;
            let _ = fs::remove_file(destination.join(".dockerignore"));
        }
        Some(AppType::Api) => {
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
        }
        None => {}
    }

    Ok(())
}

/// Installs the git `commit-msg` hook, mirroring `CommitlintInitCommand`.
/// `pub` so it is exercised directly by the integration tests in `tests/`.
pub fn install_commitlint_hook(destination: &Path) -> Result<(), String> {
    let hook_path = write_commitlint_hook(destination)?;
    crate::utils::success(format!("{} installed successfully", hook_path.display()));
    Ok(())
}

/// Writes the git `commit-msg` hook and returns its path, without printing —
/// the printing variant [`install_commitlint_hook`] wraps this, while the
/// concurrent `app:init` flow uses it directly so no success line corrupts the
/// live multi-line spinner.
fn write_commitlint_hook(destination: &Path) -> Result<PathBuf, String> {
    let repo = git2::Repository::open(destination)
        .map_err(|_| "commitlint:init must run inside a git repository".to_string())?;

    // Clear husky's redirection first so the hook lands in — and is later read
    // from — the standard hooks directory.
    let _ = repo
        .config()
        .and_then(|mut config| config.remove("core.hooksPath"));

    // Mirrors `git rev-parse --git-path hooks`: after the reset above, this is
    // always `<git-dir>/hooks`.
    let hooks_dir = repo.path().join("hooks");

    fs::create_dir_all(&hooks_dir).map_err(|e| e.to_string())?;

    let hook_path = hooks_dir.join("commit-msg");
    let hook_content = "#!/usr/bin/env sh\n\
# Talos commit-message linter — installed by `oo commitlint:init`.\n\
exec talos commitlint:check --file \"$1\"\n";
    fs::write(&hook_path, hook_content).map_err(|e| e.to_string())?;
    fs::set_permissions(&hook_path, fs::Permissions::from_mode(0o755))
        .map_err(|e| e.to_string())?;

    Ok(hook_path)
}

/// Delegates AGENTS.md/agent/skill scaffolding to the existing `@talosjs/cli`
/// `agent:skills:create` command (via the `oo` binary), which owns the full
/// per-assistant template system. This keeps the pure filesystem/git flow
/// above native while reusing the single source of truth for that logic.
/// Output is captured so it can run behind the concurrent action spinner; the
/// combined stdout/stderr is returned on failure.
/// Returns the assistant config dirs to scaffold. In silent/unattended mode
/// (e.g. when driven by `app:create`) it falls back to the default-enabled
/// assistants; otherwise the user picks from an interactive multiselect. The
/// dirs are passed to `oo agent:skills:create --agents` so the child process
/// never blocks on its own prompt.
fn resolve_agent_dirs(silent: bool) -> Vec<String> {
    let default_dirs = || {
        AGENT_SKILLS
            .iter()
            .filter(|(_, _, enabled)| *enabled)
            .map(|(_, dir, _)| (*dir).to_string())
            .collect::<Vec<_>>()
    };

    if silent {
        return default_dirs();
    }

    let labels: Vec<&str> = AGENT_SKILLS.iter().map(|(name, _, _)| *name).collect();
    let defaults: Vec<bool> = AGENT_SKILLS
        .iter()
        .map(|(_, _, enabled)| *enabled)
        .collect();

    match ask_multiselect("Add skills for which assistants?", &labels, &defaults) {
        Some(indices) => indices
            .into_iter()
            .filter_map(|index| {
                AGENT_SKILLS
                    .get(index)
                    .map(|(_, dir, _)| (*dir).to_string())
            })
            .collect(),
        // A cancelled prompt (e.g. Ctrl-C) falls back to the defaults rather
        // than silently scaffolding nothing.
        None => default_dirs(),
    }
}

fn run_agent_skills(
    destination: &Path,
    kebab_name: &str,
    agent_dirs: &[String],
    silent: bool,
) -> Result<(), String> {
    let mut command = Command::new("oo");
    command
        .arg("agent:skills:create")
        .arg("--name")
        .arg(kebab_name)
        .arg("--cwd")
        .arg(destination)
        .arg("--agents")
        .arg(agent_dirs.join(","));

    if silent {
        command.arg("--silent");
    }

    run_captured(&mut command)
}
