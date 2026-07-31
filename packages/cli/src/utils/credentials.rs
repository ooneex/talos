use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use super::yaml::{credentials_to_yaml, parse_default_profile};

/// Credential files hold API tokens in clear text, so they stay readable by
/// their owner only.
const DIR_MODE: u32 = 0o700;
const FILE_MODE: u32 = 0o600;

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
        fs::set_permissions(parent, fs::Permissions::from_mode(DIR_MODE))
            .map_err(|e| e.to_string())?;
    }

    fs::write(path, credentials_to_yaml(profile)).map_err(|e| e.to_string())?;
    fs::set_permissions(path, fs::Permissions::from_mode(FILE_MODE)).map_err(|e| e.to_string())
}

pub fn read_credentials(file_name: &str) -> Option<Vec<(String, String)>> {
    let path = credentials_path(file_name)?;
    let content = fs::read_to_string(path).ok()?;

    Some(parse_default_profile(&content))
}
