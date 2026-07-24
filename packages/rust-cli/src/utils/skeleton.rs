use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use flate2::read::GzDecoder;
use tar::Archive;

use super::process::run_step;

pub const SKELETON_REPO_URL: &str = "https://github.com/ooneex/skeleton.git";

const SKELETON_REPO_BRANCH: &str = "main";

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
        let tar = GzDecoder::new(response.into_reader());
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

pub fn clone_skeleton(silent: bool, use_cache: bool) -> Option<PathBuf> {
    let cache_dir = skeleton_cache_dir()?;

    if use_cache && is_populated(&cache_dir) {
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
