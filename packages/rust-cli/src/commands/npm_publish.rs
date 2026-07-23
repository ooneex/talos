use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use clap::Args;
use flate2::read::GzDecoder;
use serde_json::Value;
use tar::Archive;

use crate::utils::{Action, current_dir, ensure_bin, read_credentials, run_actions_rendered};

const NPM_REGISTRY: &str = "registry.npmjs.org";

/// Rust port of `packages/cli/src/commands/NpmPublishCommand.ts`.
#[derive(Args, Debug)]
pub struct NpmPublishArgs {
    /// Comma-separated package names to publish.
    #[arg(long)]
    pub packages: Option<String>,

    /// Comma-separated module names to publish.
    #[arg(long)]
    pub modules: Option<String>,

    /// Publish access level.
    #[arg(long, default_value = "public")]
    pub access: String,

    /// Suppress success/error messages.
    #[arg(long, default_value_t = false)]
    pub silent: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

#[derive(Clone)]
struct Target {
    base: String,
    kind: &'static str,
    name: String,
}

fn split_csv(value: Option<&str>) -> Vec<String> {
    value
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
        .collect()
}

fn discover(cwd: &std::path::Path, dir_name: &str, kind: &'static str) -> Vec<Target> {
    fs::read_dir(cwd.join(dir_name))
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().is_dir())
        .map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            Target {
                base: format!("{dir_name}/{name}"),
                kind,
                name,
            }
        })
        .collect()
}

fn resolve_targets(
    cwd: &std::path::Path,
    packages: Option<&str>,
    modules: Option<&str>,
) -> Vec<Target> {
    if packages.is_none() && modules.is_none() {
        let mut all = discover(cwd, "packages", "package");
        all.extend(discover(cwd, "modules", "module"));
        return all;
    }
    let mut targets = Vec::new();
    for name in split_csv(packages) {
        targets.push(Target {
            base: format!("packages/{name}"),
            kind: "package",
            name,
        });
    }
    for name in split_csv(modules) {
        targets.push(Target {
            base: format!("modules/{name}"),
            kind: "module",
            name,
        });
    }
    targets
}

fn percent_encode(input: &str) -> String {
    input
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{:02X}", byte),
        })
        .collect()
}

fn read_token() -> Option<String> {
    let profile = read_credentials("npm.yml")?;
    profile
        .into_iter()
        .find_map(|(key, value)| (key == "token").then_some(value))
}

fn version_exists(name: &str, version: &str, token: &str) -> bool {
    let url = format!(
        "https://{NPM_REGISTRY}/{}/{}",
        percent_encode(name),
        percent_encode(version)
    );
    matches!(
        ureq::get(&url)
            .set("Authorization", &format!("Bearer {token}"))
            .call(),
        Ok(response) if response.status() == 200
    )
}

/// Deletes every `*.tgz` file directly inside `dir`, mirroring
/// `rm -f ./dist/*.tgz` run with `dir` as the current directory.
fn remove_tgz_files(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "tgz") {
            let _ = fs::remove_file(path);
        }
    }
}

/// Extracts a gzip tarball into `destination`, dropping each entry's
/// top-level path component. Mirrors `tar -xzf <tarball> -C <destination>
/// --strip-components=1`, which is what npm-style package tarballs need
/// (everything lives under a single `package/` root in the archive).
fn extract_tarball_stripping_root(tarball: &Path, destination: &Path) -> std::io::Result<()> {
    let file = fs::File::open(tarball)?;
    let mut archive = Archive::new(GzDecoder::new(file));
    for entry in archive.entries()? {
        let mut entry = entry?;
        let entry_path = entry.path()?.into_owned();
        let mut components = entry_path.components();
        components.next(); // drop the leading `package/` (or similar) component
        let relative: PathBuf = components.collect();
        if relative.as_os_str().is_empty() {
            continue;
        }
        let target = destination.join(&relative);
        if entry.header().entry_type().is_dir() {
            fs::create_dir_all(&target)?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            entry.unpack(&target)?;
        }
    }
    Ok(())
}

pub fn run(args: &NpmPublishArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    if !ensure_bin("npm") {
        return;
    }
    let targets = resolve_targets(&cwd, args.packages.as_deref(), args.modules.as_deref());
    if targets.is_empty() {
        crate::utils::error("No packages or modules found to publish");
        std::process::exit(1);
    }
    let token = match read_token() {
        Some(token) => token,
        None => {
            crate::utils::error(
                "No npm credentials found. Run `talos npm:credentials:create` first.",
            );
            std::process::exit(1);
        }
    };
    let mut ignored = 0;
    let mut actions: Vec<Action> = Vec::new();
    for target in targets {
        let target_dir = cwd.join(&target.base);
        let pkg_path = target_dir.join("package.json");
        let Ok(raw) = fs::read_to_string(&pkg_path) else {
            crate::utils::error(format!(
                "No {} named \"{}\" found",
                target.kind, target.name
            ));
            continue;
        };
        let Ok(pkg) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        let name = pkg
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(&target.name)
            .to_string();
        let version = pkg
            .get("version")
            .and_then(Value::as_str)
            .map(str::to_string);
        let label = version
            .as_ref()
            .map(|v| format!("{name}@{v}"))
            .unwrap_or_else(|| name.clone());
        if let Some(version) = version.as_deref()
            && version_exists(&name, version, &token)
        {
            ignored += 1;
            if !args.silent {
                println!("Skipped {label} (already published)");
            }
            continue;
        }

        // Each package publishes into its own directory with no shared mutable
        // state (only the read-only token is shared), so the packages publish
        // concurrently instead of one after another.
        let access = args.access.clone();
        let token = token.clone();
        actions.push(Action::new(format!("Publishing {label}"), move || {
            publish_one(&target_dir, &access, &token)
        }));
    }

    let total = actions.len();
    let failures = run_actions_rendered(actions, !args.silent);
    if !args.silent {
        for (label, message) in &failures {
            crate::utils::error(label.clone());
            if !message.trim().is_empty() {
                eprintln!("{}", message.trim_end());
            }
        }
    }
    let succeeded = total - failures.len();
    if !args.silent {
        println!("Summary: {succeeded} published, {ignored} ignored");
    }
}

/// Packs, extracts, and publishes a single package/module directory to npm with
/// its subprocess output captured (so it can run behind the concurrent action
/// spinner). Returns the combined command output on failure.
fn publish_one(target_dir: &Path, access: &str, token: &str) -> Result<(), String> {
    let dist_dir = target_dir.join("dist");
    let publish_dir = dist_dir.join("publish");
    let _ = fs::remove_dir_all(&publish_dir);
    fs::create_dir_all(&publish_dir).map_err(|e| e.to_string())?;
    remove_tgz_files(&dist_dir);

    let pack = Command::new("bun")
        .args(["pm", "pack", "--destination", "./dist"])
        .current_dir(target_dir)
        .env(format!("npm_config_//{NPM_REGISTRY}/:_authToken"), token)
        .output()
        .map_err(|e| e.to_string())?;
    if !pack.status.success() {
        let _ = fs::remove_dir_all(&publish_dir);
        return Err(format!(
            "bun pm pack failed\n{}{}",
            String::from_utf8_lossy(&pack.stdout),
            String::from_utf8_lossy(&pack.stderr)
        ));
    }

    let tarball = fs::read_dir(&dist_dir)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .find_map(|e| {
            e.file_name()
                .to_str()
                .filter(|n| n.ends_with(".tgz"))
                .map(|n| dist_dir.join(n))
        });
    let Some(tarball) = tarball else {
        let _ = fs::remove_dir_all(&publish_dir);
        return Err("bun pm pack produced no tarball".to_string());
    };

    if let Err(error) = extract_tarball_stripping_root(&tarball, &publish_dir) {
        let _ = fs::remove_dir_all(&publish_dir);
        return Err(format!("failed to extract tarball: {error}"));
    }

    let publish = Command::new("npm")
        .args(["publish", "--access", access])
        .current_dir(&publish_dir)
        .env(format!("npm_config_//{NPM_REGISTRY}/:_authToken"), token)
        .output();
    let _ = fs::remove_dir_all(&publish_dir);

    match publish {
        Ok(output) if output.status.success() => Ok(()),
        Ok(output) => Err(format!(
            "npm publish failed\n{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        )),
        Err(error) => Err(error.to_string()),
    }
}
