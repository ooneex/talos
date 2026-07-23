//! Skeleton repository cloning, mirroring `getSkeletonDir`/`cloneSkeleton` in
//! `packages/cli/src/agentConfig.ts`.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use flate2::read::GzDecoder;
use tar::Archive;

use super::process::run_step;

/// Source repository cloned by `app:init` (and, transitively, `app:create`).
pub const SKELETON_REPO_URL: &str = "https://github.com/ooneex/skeleton.git";

/// Default branch archived by [`download_skeleton_archive`].
const SKELETON_REPO_BRANCH: &str = "main";

/// Tarball for the default branch, served without `.git` history — much
/// cheaper to fetch than a full git clone since it's a single compressed
/// HTTP GET with no protocol negotiation.
fn skeleton_archive_url() -> String {
    format!("https://codeload.github.com/ooneex/skeleton/tar.gz/refs/heads/{SKELETON_REPO_BRANCH}")
}

/// Downloads and extracts the skeleton tarball into `destination`, which must
/// not already exist. Returns `true` on success.
///
/// GitHub tarballs unpack into a single `<repo>-<branch>/` directory, so it is
/// renamed to `destination` after extraction.
fn download_skeleton_archive(destination: &Path, silent: bool) -> bool {
    if !silent {
        println!("Downloading skeleton archive...");
    }

    let Some(parent) = destination.parent() else {
        return false;
    };

    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
        let response = ureq::get(&skeleton_archive_url()).call()?;
        let tar = GzDecoder::new(response.into_reader());
        let mut archive = Archive::new(tar);
        archive.unpack(parent)?;

        let unpacked = fs::read_dir(parent)?
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .find(|path| path.is_dir() && path != destination)
            .ok_or("skeleton archive did not contain the expected directory")?;
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

/// Shallow-clones the skeleton repo with `git`. Used as a fallback when the
/// archive download fails (e.g. behind a proxy that blocks `codeload.github.com`).
fn git_clone_skeleton(destination: &Path, silent: bool) -> bool {
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

/// Mirrors `getSkeletonDir`/`cloneSkeleton`: fetches the skeleton repo into a
/// temporary directory and returns it (the clone lives at `<dir>/repo`).
/// Prefers a tarball download over `git clone` for speed, falling back to git
/// if the download fails.
pub fn clone_skeleton(silent: bool) -> Option<tempfile::TempDir> {
    let parent_dir = tempfile::Builder::new()
        .prefix("talos-skeleton-")
        .tempdir()
        .ok()?;
    let destination = parent_dir.path().join("repo");

    if download_skeleton_archive(&destination, silent) || git_clone_skeleton(&destination, silent) {
        Some(parent_dir)
    } else {
        None
    }
}

/// Fetches the skeleton repo into a hidden workspace directory under the
/// current project, avoiding OS temp directories. The clone lands at
/// `<cwd>/.talosrs-cache/<label>/repo` and the returned path points to `repo`.
/// Prefers a tarball download over `git clone` for speed, falling back to git
/// if the download fails.
pub fn clone_skeleton_in_workspace(cwd: &Path, label: &str, silent: bool) -> Option<PathBuf> {
    let cache_root = cwd.join(".talosrs-cache").join(label);
    let destination = cache_root.join("repo");
    let _ = fs::remove_dir_all(&cache_root);
    fs::create_dir_all(&cache_root).ok()?;

    if download_skeleton_archive(&destination, silent) || git_clone_skeleton(&destination, silent) {
        Some(destination)
    } else {
        None
    }
}
