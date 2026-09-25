use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use clap::Args;
use flate2::read::GzDecoder;
use serde_json::Value;
use tar::Archive;

pub use crate::utils::split_csv;
use crate::utils::{
    Action, PublishTarget, current_dir, discover_publish_targets, ensure_bin, is_rust_module,
    read_credentials, resolve_publish_targets, run_actions_rendered_limited,
};

const NPM_REGISTRY: &str = "registry.npmjs.org";

/// How many packages publish at once. Each one spawns `bun` and `npm` and
/// unpacks a tarball; starting every package together exhausts the process
/// file-descriptor limit (`EMFILE`, os error 24).
const PUBLISH_CONCURRENCY: usize = 4;

/// Overrides the registry `published_version` reads, so a test can stand in
/// for npm. Unset, the public registry is used.
pub const NPM_REGISTRY_URL_ENV: &str = "TALOS_NPM_REGISTRY";

#[derive(Args, Debug)]
pub struct NpmPublishArgs {
    #[arg(long)]
    pub packages: Option<String>,

    #[arg(long)]
    pub modules: Option<String>,

    #[arg(long, default_value = "public")]
    pub access: String,

    #[arg(long, default_value_t = false)]
    pub silent: bool,

    #[arg(long)]
    pub cwd: Option<String>,
}

pub type Target = PublishTarget;

pub fn discover(cwd: &std::path::Path, dir_name: &str, kind: &'static str) -> Vec<Target> {
    discover_publish_targets(cwd, dir_name, kind)
}

pub fn resolve_targets(
    cwd: &std::path::Path,
    packages: Option<&str>,
    modules: Option<&str>,
) -> Vec<Target> {
    resolve_publish_targets(cwd, packages, modules)
}

pub fn percent_encode(input: &str) -> String {
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

/// The version npm currently publishes for `name`.
///
/// `Ok(None)` means the package has never been published. Any other failure
/// is returned, because guessing a version from the manifest can skip numbers
/// npm never saw. `base` overrides the public registry the lookup normally
/// goes to.
pub fn published_version(name: &str, base: Option<&str>) -> Result<Option<String>, String> {
    let root = base
        .map(str::to_string)
        .or_else(|| std::env::var(NPM_REGISTRY_URL_ENV).ok())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("https://{NPM_REGISTRY}"));
    let url = format!(
        "{}/{}/latest",
        root.trim().trim_end_matches('/'),
        percent_encode(name)
    );
    let mut request = ureq::get(&url).header("Accept", "application/json");
    if let Some(token) = read_token() {
        request = request.header("Authorization", &format!("Bearer {token}"));
    }

    match request.call() {
        Ok(response) => {
            let body: Value = response.into_body().read_json().map_err(|error| {
                format!("npm returned an unreadable version for {name}: {error}")
            })?;
            let version = body
                .get("version")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|version| !version.is_empty())
                .ok_or_else(|| format!("npm returned no version for {name}"))?;
            let core = version
                .trim_start_matches('v')
                .split(['-', '+'])
                .next()
                .unwrap_or(version);
            if !core.split('.').all(is_numeric_part) || core.is_empty() {
                return Err(format!(
                    "npm returned a version for {name} that is not a release number: {version}"
                ));
            }
            Ok(Some(core.to_string()))
        }
        Err(ureq::Error::StatusCode(404)) => Ok(None),
        Err(error) => Err(format!("Failed to read the npm version of {name}: {error}")),
    }
}

fn is_numeric_part(part: &str) -> bool {
    !part.is_empty() && part.chars().all(|character| character.is_ascii_digit())
}

/// Whether the registry already published that exact version. `base` overrides
/// the public registry the lookup normally goes to.
pub fn version_exists(name: &str, version: &str, token: &str, base: Option<&str>) -> bool {
    let url = format!(
        "{}/{}/{}",
        base.map(|base| base.trim_end_matches('/').to_string())
            .unwrap_or_else(|| format!("https://{NPM_REGISTRY}")),
        percent_encode(name),
        percent_encode(version)
    );
    matches!(
        ureq::get(&url)
            .header("Authorization", &format!("Bearer {token}"))
            .call(),
        Ok(response) if response.status().as_u16() == 200
    )
}

pub fn remove_tgz_files(dir: &Path) {
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

/// Unpack a tarball, dropping the single wrapping directory npm packs into it.
pub fn extract_tarball_stripping_root(tarball: &Path, destination: &Path) -> std::io::Result<()> {
    let file = fs::File::open(tarball)?;
    let mut archive = Archive::new(GzDecoder::new(file));
    for entry in archive.entries()? {
        let mut entry = entry?;
        let entry_path = entry.path()?.into_owned();
        let mut components = entry_path.components();
        components.next();
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

/// Reads a target's `package.json` and builds the publish action for it,
/// or reports why it should be skipped/ignored. `ignored` is bumped when the
/// version is already published on the registry. A Rust module never reaches
/// this step.
fn build_publish_action(
    cwd: &Path,
    target: &Target,
    token: &str,
    access: &str,
    silent: bool,
    ignored: &mut usize,
) -> Option<Action> {
    let target_dir = cwd.join(&target.base);
    let pkg_path = target_dir.join("package.json");
    let Ok(raw) = fs::read_to_string(&pkg_path) else {
        crate::utils::error(format!(
            "No {} named \"{}\" found",
            target.kind, target.name
        ));
        return None;
    };
    let Ok(pkg) = serde_json::from_str::<Value>(&raw) else {
        return None;
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
        && version_exists(&name, version, token, None)
    {
        *ignored += 1;
        if !silent {
            println!("Skipped {label} (already published)");
        }
        return None;
    }

    let access = access.to_string();
    let token = token.to_string();
    Some(Action::new(format!("Publishing {label}"), move || {
        publish_one(&target_dir, &access, &token)
    }))
}

/// A Rust module is not published to npm. Counts it as ignored.
fn ignore_rust_module(cwd: &Path, target: &Target, silent: bool, ignored: &mut usize) -> bool {
    if !is_rust_module(&cwd.join(&target.base)) {
        return false;
    }
    *ignored += 1;
    if !silent {
        println!("Skipped {} (rust module)", target.name);
    }
    true
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
    let mut ignored = 0;
    let publishable: Vec<Target> = targets
        .into_iter()
        .filter(|target| !ignore_rust_module(&cwd, target, args.silent, &mut ignored))
        .collect();
    if publishable.is_empty() {
        if !args.silent {
            println!("Summary: 0 published, {ignored} ignored");
        }
        return;
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
    let actions: Vec<Action> = publishable
        .iter()
        .filter_map(|target| {
            build_publish_action(
                &cwd,
                target,
                &token,
                &args.access,
                args.silent,
                &mut ignored,
            )
        })
        .collect();

    let total = actions.len();
    let failures = run_actions_rendered_limited(actions, !args.silent, Some(PUBLISH_CONCURRENCY));
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

/// Pack `target_dir` with `bun pm pack`, unpack the tarball, and `npm publish` it.
pub fn publish_one(target_dir: &Path, access: &str, token: &str) -> Result<(), String> {
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
