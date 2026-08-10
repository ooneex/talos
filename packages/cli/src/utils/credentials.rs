use std::fs;
use std::path::{Path, PathBuf};

use super::yaml::{credentials_to_yaml, parse_default_profile};

/// Credential files hold API tokens in clear text, so they stay readable by
/// their owner only. Windows has no mode bits — the files inherit the ACL of
/// the user profile directory instead.
#[cfg(unix)]
const DIR_MODE: u32 = 0o700;
#[cfg(unix)]
const FILE_MODE: u32 = 0o600;

#[cfg(unix)]
fn restrict(path: &Path, mode: u32) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(path, fs::Permissions::from_mode(mode)).map_err(|e| e.to_string())
}

#[cfg(not(unix))]
fn restrict(_path: &Path, _mode: u32) -> Result<(), String> {
    Ok(())
}

#[cfg(not(unix))]
const DIR_MODE: u32 = 0;
#[cfg(not(unix))]
const FILE_MODE: u32 = 0;

fn credentials_path(file_name: &str) -> Option<PathBuf> {
    let home = dirs_home()?;
    Some(home.join(".talos").join("credentials").join(file_name))
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

pub fn save_credentials(
    file_name: &str,
    label: &str,
    profile: &[(String, String)],
    silent: bool,
) -> Option<PathBuf> {
    let Some(path) = credentials_path(file_name) else {
        super::style::error("Cannot resolve the home directory: HOME is not set");
        return None;
    };

    if let Err(message) = write_credentials(&path, profile) {
        super::style::error(format!(
            "Failed to save {label} credentials to {}: {message}",
            path.display()
        ));
        return None;
    }

    if !silent {
        super::style::success(format!("{label} credentials saved to {}", path.display()));
    }

    Some(path)
}

fn write_credentials(path: &Path, profile: &[(String, String)]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        restrict(parent, DIR_MODE)?;
    }

    fs::write(path, credentials_to_yaml(profile)).map_err(|e| e.to_string())?;
    restrict(path, FILE_MODE)
}

pub fn read_credentials(file_name: &str) -> Option<Vec<(String, String)>> {
    let path = credentials_path(file_name)?;
    let content = fs::read_to_string(path).ok()?;

    Some(parse_default_profile(&content))
}
