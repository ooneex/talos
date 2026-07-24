use std::fs;
use std::path::PathBuf;

use super::yaml::{credentials_to_yaml, parse_default_profile};

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
    let path = credentials_path(file_name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok()?;
    }
    fs::write(&path, credentials_to_yaml(profile)).ok()?;

    if !silent {
        super::style::success(format!("{label} credentials saved to {}", path.display()));
    }

    Some(path)
}

#[allow(
    dead_code,
    reason = "read side used by future consumers of saved credentials"
)]
pub fn read_credentials(file_name: &str) -> Option<Vec<(String, String)>> {
    let path = credentials_path(file_name)?;
    let content = fs::read_to_string(path).ok()?;
    Some(parse_default_profile(&content))
}
