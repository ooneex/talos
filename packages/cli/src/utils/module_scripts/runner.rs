//! Module discovery and script execution — running one module's script and
//! turning its exit status into a [`super::ModuleScript`].

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

use super::super::Loader;
use super::stream::run_streamed;
use super::{ModuleScript, ModuleScriptsOptions, ScriptStatus};

// ---------------------------------------------------------------------------
// Module discovery
// ---------------------------------------------------------------------------

/// A module the run knows how to run the script for.
pub(super) struct Target {
    /// The package's declared `name`, or its directory name.
    pub(super) name: String,
    /// `modules/user` — how the module is named while it is running.
    pub(super) label: String,
    /// The module's directory name, which is also its cache directory.
    pub(super) dir_name: String,
    dir: PathBuf,
}

/// Every module under `modules/` that declares a `package.json` and carries
/// the script, in the order the run should walk them — narrowed to
/// `options.modules` when the selection is not empty.
pub(super) fn collect_targets(root: &Path, options: &ModuleScriptsOptions) -> Vec<Target> {
    let modules_dir = root.join("modules");
    let Ok(entries) = std::fs::read_dir(&modules_dir) else {
        return Vec::new();
    };

    let mut names: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect();
    names.sort();
    if options.reverse {
        names.reverse();
    }

    names
        .into_iter()
        .filter(|name| options.modules.is_empty() || options.modules.contains(name))
        .filter_map(|name| target(&modules_dir, name, options.bin_path))
        .collect()
}

/// The target a module directory holds, or `None` when it carries no
/// `package.json` or no script.
fn target(modules_dir: &Path, name: String, bin_path: &[&str]) -> Option<Target> {
    let dir = modules_dir.join(&name);
    let manifest = dir.join("package.json");
    if !manifest.exists() || !script_path(&dir, bin_path).exists() {
        return None;
    }

    let declared = std::fs::read_to_string(&manifest)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|json| {
            json.get("name")
                .and_then(|name| name.as_str())
                .map(str::to_string)
        });

    Some(Target {
        name: declared.unwrap_or_else(|| name.clone()),
        label: format!("modules/{name}"),
        dir_name: name,
        dir,
    })
}

/// Where one module keeps its "already ran" markers.
pub(super) fn cache_dir(root: &Path, options: &ModuleScriptsOptions, target: &Target) -> PathBuf {
    root.join(options.cache_dir).join(&target.dir_name)
}

fn script_path(dir: &Path, bin_path: &[&str]) -> PathBuf {
    bin_path
        .iter()
        .fold(dir.to_path_buf(), |path, part| path.join(part))
}

// ---------------------------------------------------------------------------
// Script execution
// ---------------------------------------------------------------------------

/// Run every module's script, one at a time, in the order they were
/// discovered.
///
/// Every script talks to the same database, and each one applies what it
/// transitively imports — importing another module's migration to declare a
/// dependency also registers it. Two modules running at once therefore race to
/// apply the same shared migration, and the loser dies on "relation already
/// exists".
///
/// `stream` prints each module's lines as they arrive; a caller that owns
/// stdout turns it off and reads them back off the audit instead.
pub(super) fn run_targets(
    targets: Vec<Target>,
    root: &Path,
    options: &ModuleScriptsOptions,
    loader: &Loader,
    stream: bool,
) -> Vec<ModuleScript> {
    let width = targets
        .iter()
        .map(|target| target.label.chars().count())
        .max()
        .unwrap_or(0);

    targets
        .iter()
        .enumerate()
        .map(|(index, target)| {
            loader.entered(0, target.label.clone());
            // `--drop` goes to the first module only: a later drop would wipe
            // everything the modules before it just applied.
            let drop = options.drop && index == 0;
            let logging = stream.then_some((width, loader));
            let script = run_script(target, root, options, drop, logging);
            loader.left(0, &target.label);
            script
        })
        .collect()
}

/// The `bun run <script> [flags...]` argument list for one module.
///
/// `drop` is decided per module rather than read from `options`: only the
/// first module of a run may drop the database.
fn script_args(
    target: &Target,
    root: &Path,
    options: &ModuleScriptsOptions,
    drop: bool,
) -> Vec<String> {
    let mut args = vec![
        "run".to_string(),
        script_path(&target.dir, options.bin_path)
            .to_string_lossy()
            .to_string(),
    ];
    if drop {
        args.push("--drop".to_string());
    }
    if let Some(version) = &options.version {
        args.push("--version".to_string());
        args.push(version.clone());
    }
    if options.no_cache {
        args.push("--no-cache".to_string());
    }
    args.push("--cache-dir".to_string());
    args.push(
        cache_dir(root, options, target)
            .to_string_lossy()
            .to_string(),
    );
    args
}

/// Run one module's script and turn its exit status into a [`ModuleScript`].
///
/// `logging` carries the column width and the loader to print each line
/// through; `None` keeps the output to the returned [`ModuleScript`].
fn run_script(
    target: &Target,
    root: &Path,
    options: &ModuleScriptsOptions,
    drop: bool,
    logging: Option<(usize, &Loader)>,
) -> ModuleScript {
    let started = Instant::now();

    let mut command = Command::new("bun");
    command
        .args(script_args(target, root, options, drop))
        .current_dir(&target.dir);
    if let Some(env) = &options.env {
        command.env("APP_ENV", env);
    }

    let run = match logging {
        Some((width, loader)) => run_streamed(&mut command, &target.label, width, loader),
        None => command.output().map(|output| {
            let text = format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            (output.status, text)
        }),
    };

    let duration_ms = started.elapsed().as_millis() as u64;
    let (exit, text) = match run {
        Ok(run) => run,
        Err(err) => {
            return script(
                target,
                ScriptStatus::Errored(format!("could not run bun: {err}")),
                String::new(),
                duration_ms,
            );
        }
    };

    let status = if exit.success() {
        ScriptStatus::Succeeded
    } else {
        ScriptStatus::Failed
    };

    script(target, status, text, duration_ms)
}

fn script(target: &Target, status: ScriptStatus, output: String, duration_ms: u64) -> ModuleScript {
    ModuleScript {
        name: target.name.clone(),
        label: target.label.clone(),
        dir: target.dir.clone(),
        status,
        duration_ms,
        output,
    }
}
