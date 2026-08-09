use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use flate2::read::GzDecoder;
use tar::Archive;

use super::process::run_step;

pub const SKELETON_REPO_URL: &str = "https://github.com/ooneex/skeleton.git";

pub const TEMPLATES_DIR_ENV: &str = "TALOS_TEMPLATES_DIR";
const SKELETON_ARCHIVE_URL_ENV: &str = "TALOS_SKELETON_ARCHIVE_URL";
const SKELETON_REPO_URL_ENV: &str = "TALOS_SKELETON_REPO_URL";

const SKELETON_REPO_BRANCH: &str = "main";

pub const SKELETON_CACHE_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);

fn skeleton_archive_url() -> String {
    std::env::var(SKELETON_ARCHIVE_URL_ENV).unwrap_or_else(|_| {
        format!(
            "https://codeload.github.com/ooneex/skeleton/tar.gz/refs/heads/{SKELETON_REPO_BRANCH}"
        )
    })
}

fn skeleton_repo_url() -> String {
    std::env::var(SKELETON_REPO_URL_ENV).unwrap_or_else(|_| SKELETON_REPO_URL.to_string())
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
        unpack_skeleton_archive(
            response.into_body().into_reader(),
            staging.path(),
            destination,
        )?;

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
    let repo_url = skeleton_repo_url();
    run_step(
        silent,
        "Cloning skeleton repository...",
        Command::new("git").args([
            "clone",
            "--depth",
            "1",
            &repo_url,
            destination.to_string_lossy().as_ref(),
        ]),
    )
}

fn unpack_skeleton_archive(
    reader: impl std::io::Read,
    staging_dir: &Path,
    destination: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let tar = GzDecoder::new(reader);
    let mut archive = Archive::new(tar);
    archive.unpack(staging_dir)?;

    let unpacked = fs::read_dir(staging_dir)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .find(|path| path.is_dir())
        .ok_or("skeleton archive did not contain the expected directory")?;
    let _ = fs::remove_dir_all(destination);
    fs::rename(unpacked, destination)?;
    Ok(())
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
    repo.map(|dir| dir.join("modules").join("templates"))
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
    use std::sync::Mutex;

    static ENV_GUARD: Mutex<()> = Mutex::new(());

    #[test]
    fn archive_url_points_at_the_main_branch_tarball() {
        assert!(skeleton_archive_url().contains("/refs/heads/main"));
    }

    #[test]
    fn populated_only_when_the_directory_has_entries() {
        let dir = tempfile::tempdir().expect("tempdir");
        assert!(!is_populated(dir.path()));
        fs::write(dir.path().join("file.txt"), "x").expect("write");
        assert!(is_populated(dir.path()));
    }

    #[test]
    fn download_skeleton_archive_fails_without_a_parent_directory() {
        assert!(!download_skeleton_archive(Path::new(""), true));
    }

    #[test]
    fn clone_skeleton_reuses_a_fresh_cache_from_home() {
        let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
        let home = tempfile::tempdir().expect("tempdir");
        let cache = home.path().join(".talos").join("skeleton");
        fs::create_dir_all(cache.join("templates")).expect("templates");
        fs::write(cache.join("templates/module.txt"), "template").expect("template");
        let previous_home = std::env::var_os("HOME");
        unsafe {
            std::env::set_var("HOME", home.path());
        }

        let cloned = clone_skeleton(true, true).expect("cache hit should be reused");

        unsafe {
            match previous_home {
                Some(value) => std::env::set_var("HOME", value),
                None => std::env::remove_var("HOME"),
            }
        }
        assert_eq!(cloned, cache);
    }
}
