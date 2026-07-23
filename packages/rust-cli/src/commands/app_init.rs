use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use clap::Args;
use fs_extra::dir::{CopyOptions, copy as copy_dir};

use crate::utils::{
    ask_confirm, clone_skeleton, ensure_bin, resolve_name_and_destination, run_step,
};

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
    } = options;
    let kebab_name = crate::utils::to_kebab_case(&name);

    if !ensure_bin("git") {
        return None;
    }

    let skeleton_dir = clone_skeleton(silent)?;
    let skeleton_repo_dir = skeleton_dir.path().join("repo");

    if let Err(error) =
        scaffold_destination(&skeleton_repo_dir, &destination, &kebab_name, app_type)
    {
        eprintln!("✖ {error}");
        return None;
    }
    // `skeleton_dir` is a TempDir; it is removed automatically when dropped here.
    drop(skeleton_dir);

    if !run_step(
        silent,
        "Installing dependencies...",
        Command::new("bun").arg("install").current_dir(&destination),
    ) {
        return None;
    }

    if !run_step(
        silent,
        "Initializing git repository...",
        Command::new("git").arg("init").current_dir(&destination),
    ) {
        return None;
    }

    let install_hook = ask_confirm("Install the commit-msg hook?", true);

    if install_hook && let Err(error) = install_commitlint_hook(&destination) {
        eprintln!("✖ {error}");
    }

    scaffold_agent_skills(&destination, &kebab_name, silent);

    if !silent {
        println!(
            "✔ {kebab_name} initialized successfully at {}",
            destination.display()
        );
    }

    Some(destination)
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

    println!("✔ {} installed successfully", hook_path.display());
    Ok(())
}

/// Delegates AGENTS.md/agent/skill scaffolding to the existing `@talosjs/cli`
/// `agent:skills:create` command (via the `oo` binary), which owns the full
/// per-assistant template system. This keeps the pure filesystem/git flow
/// above native while reusing the single source of truth for that logic.
fn scaffold_agent_skills(destination: &Path, kebab_name: &str, silent: bool) {
    let oo_available = Command::new("oo")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);

    if !oo_available {
        eprintln!("⚠ Skipping agent skills scaffolding: \"oo\" was not found on the PATH");
        return;
    }

    let mut command = Command::new("oo");
    command
        .arg("agent:skills:create")
        .arg("--name")
        .arg(kebab_name)
        .arg("--cwd")
        .arg(destination);

    if silent {
        command.arg("--silent");
    }

    if let Err(error) = command.status() {
        eprintln!("✖ Failed to scaffold agent skills: {error}");
    }
}
