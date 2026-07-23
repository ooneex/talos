//! Persist/read named credential profiles, mirroring `packages/cli/src/credentials.ts`.

use std::fs;
use std::path::PathBuf;

use super::yaml::{credentials_to_yaml, parse_default_profile};

/// Resolves `~/.talos/credentials/<file_name>`.
fn credentials_path(file_name: &str) -> Option<PathBuf> {
    let home = dirs_home()?;
    Some(home.join(".talos").join("credentials").join(file_name))
}

/// Minimal home-directory resolver so this module doesn't need an extra crate.
fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// Mirrors `saveCredentials`: writes `{ profiles: { default: profile } }` as
/// YAML to `~/.talos/credentials/<file_name>`, printing the destination
/// unless `silent`. Returns the path written to.
pub fn save_credentials(
    file_name: &str,
    label: &str,
    profile: &[(String, String)],
    silent: bool,
) -> Option<PathBuf> {
    let path = credentials_path(file_name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok()?;
    }
    fs::write(&path, credentials_to_yaml(profile)).ok()?;

    if !silent {
        println!("✔ {label} credentials saved to {}", path.display());
    }

    Some(path)
}

/// Mirrors `readCredentials`: reads the `default` profile from
/// `~/.talos/credentials/<file_name>`, returning `None` when missing.
#[allow(
    dead_code,
    reason = "read side used by future consumers of saved credentials"
)]
pub fn read_credentials(file_name: &str) -> Option<Vec<(String, String)>> {
    let path = credentials_path(file_name)?;
    let content = fs::read_to_string(path).ok()?;
    Some(parse_default_profile(&content))
}
