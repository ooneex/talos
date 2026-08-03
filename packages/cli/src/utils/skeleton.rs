use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use flate2::read::GzDecoder;
use tar::Archive;

use super::process::run_step;

pub const SKELETON_REPO_URL: &str = "https://github.com/ooneex/skeleton.git";

pub const TEMPLATES_DIR_ENV: &str = "TALOS_TEMPLATES_DIR";

const SKELETON_REPO_BRANCH: &str = "main";

pub const SKELETON_CACHE_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);

fn skeleton_archive_url() -> String {
    format!("https://codeload.github.com/ooneex/skeleton/tar.gz/refs/heads/{SKELETON_REPO_BRANCH}")
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn skeleton_cache_dir() -> Option<PathBuf> {
    Some(dirs_home()?.join(".talos").join("skeleton"))
}

fn is_populated(dir: &Path) -> bool {
    fs::read_dir(dir)
        .map(|mut entries| entries.next().is_some())
        .unwrap_or(false)
}

pub fn is_cache_stale(dir: &Path) -> bool {
    let Ok(metadata) = fs::metadata(dir) else {
        return true;
    };
    let Ok(modified) = metadata.modified() else {
        return true;
    };
    match modified.elapsed() {
        Ok(age) => age > SKELETON_CACHE_MAX_AGE,
        Err(_) => false,
    }
}

fn download_skeleton_archive(destination: &Path, silent: bool) -> bool {
    if !silent {
        println!("Downloading skeleton archive...");
    }

    let Some(parent) = destination.parent() else {
        return false;
    };

    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
        fs::create_dir_all(parent)?;
        let staging = tempfile::Builder::new()
            .prefix(".talos-skeleton-download-")
            .tempdir_in(parent)?;

        let response = ureq::get(&skeleton_archive_url()).call()?;
        let tar = GzDecoder::new(response.into_body().into_reader());
        let mut archive = Archive::new(tar);
        archive.unpack(staging.path())?;

        let unpacked = fs::read_dir(staging.path())?
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .find(|path| path.is_dir())
            .ok_or("skeleton archive did not contain the expected directory")?;
        let _ = fs::remove_dir_all(destination);
        fs::rename(unpacked, destination)?;

        Ok(())
    })();

    match result {
        Ok(()) => true,
        Err(error) => {
            super::style::error(format!("Failed to download skeleton archive: {error}"));
            false
        }
    }
}

fn git_clone_skeleton(destination: &Path, silent: bool) -> bool {
    let _ = fs::remove_dir_all(destination);
    run_step(
        silent,
        "Cloning skeleton repository...",
        Command::new("git").args([
            "clone",
            "--depth",
            "1",
            SKELETON_REPO_URL,
            destination.to_string_lossy().as_ref(),
        ]),
    )
}

/// Where the artifact templates sit inside a checked-out skeleton.
///
/// They live under `modules/`, not at the root: the skeleton publishes them as
/// `modules/templates/`, which is what every `*-create` generator reads
/// `controller.txt` and friends from.
pub const TEMPLATES_SUBDIR: [&str; 2] = ["modules", "templates"];

/// The directory `read_template` resolves names against.
pub fn templates_dir_of(repo: &Path) -> PathBuf {
    TEMPLATES_SUBDIR
        .iter()
        .fold(repo.to_path_buf(), |path, segment| path.join(segment))
}

pub fn skeleton_templates_dir(silent: bool, use_cache: bool) -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os(TEMPLATES_DIR_ENV) {
        return Some(PathBuf::from(dir));
    }
    let repo = if silent {
        clone_skeleton(true, use_cache)
    } else {
        let spinner = super::style::Spinner::start("Downloading templates...");
        let repo = clone_skeleton(true, use_cache);
        spinner.stop();
        repo
    };
    repo.map(|dir| templates_dir_of(&dir))
}

pub fn read_template(dir: &Path, name: &str) -> Option<String> {
    let path = dir.join(name);
    match fs::read_to_string(&path) {
        Ok(content) => Some(content),
        Err(error) => {
            super::style::error(format!("Failed to read template \"{name}\": {error}"));
            None
        }
    }
}

pub fn clone_skeleton(silent: bool, use_cache: bool) -> Option<PathBuf> {
    let cache_dir = skeleton_cache_dir()?;

    if use_cache && is_populated(&cache_dir) && !is_cache_stale(&cache_dir) {
        return Some(cache_dir);
    }

    let parent = cache_dir.parent()?;
    fs::create_dir_all(parent).ok()?;
    let _ = fs::remove_dir_all(&cache_dir);

    if download_skeleton_archive(&cache_dir, silent) || git_clone_skeleton(&cache_dir, silent) {
        Some(cache_dir)
    } else {
        let _ = fs::remove_dir_all(&cache_dir);
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_templates_under_the_modules_directory() {
        // The skeleton publishes `modules/templates/`, so a root-level
        // `templates/` would never be found and every generator would fail on
        // "Failed to read template".
        assert_eq!(
            templates_dir_of(Path::new("/cache/skeleton")),
            PathBuf::from("/cache/skeleton/modules/templates")
        );
    }

    #[test]
    fn the_env_override_wins_over_the_cache() {
        // Safe to set: the override is read before anything is cloned.
        unsafe { std::env::set_var(TEMPLATES_DIR_ENV, "/somewhere/else") };
        let resolved = skeleton_templates_dir(true, true);
        unsafe { std::env::remove_var(TEMPLATES_DIR_ENV) };

        assert_eq!(resolved, Some(PathBuf::from("/somewhere/else")));
    }
}
