//! Skeleton repository cloning, mirroring `getSkeletonDir`/`cloneSkeleton` in
//! `packages/cli/src/agentConfig.ts`.
//!
//! The skeleton is cloned once, directly into a persistent user cache at
//! `~/.talos/skeleton` (mirroring how `credentials.rs` stores data under
//! `~/.talos`). Consumers read the templates straight from that directory: it
//! is checked before every pull and reused whenever it already exists, so no
//! temporary or per-project working copies are created.

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

/// Minimal home-directory resolver, mirroring `credentials.rs` so this module
/// doesn't need an extra crate.
fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// Resolves the persistent skeleton cache at `~/.talos/skeleton`.
fn skeleton_cache_dir() -> Option<PathBuf> {
    Some(dirs_home()?.join(".talos").join("skeleton"))
}

/// Returns `true` when `dir` exists and contains at least one entry.
fn is_populated(dir: &Path) -> bool {
    fs::read_dir(dir)
        .map(|mut entries| entries.next().is_some())
        .unwrap_or(false)
}

/// Downloads and extracts the skeleton tarball into `destination`. Returns
/// `true` on success.
///
/// GitHub tarballs unpack into a single `<repo>-<branch>/` directory, so the
/// archive is extracted into a staging directory (alongside `destination`) and
/// that single directory is then moved onto `destination`. Staging keeps the
/// extraction isolated from any sibling entries that already live in the parent
/// (e.g. `~/.talos/credentials`).
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

/// Shallow-clones the skeleton repo with `git` directly into `destination`.
/// Used as a fallback when the archive download fails (e.g. behind a proxy that
/// blocks `codeload.github.com`).
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

/// Mirrors `getSkeletonDir`/`cloneSkeleton`: returns the skeleton repo path,
/// cloned directly into the persistent user cache at `~/.talos/skeleton`.
///
/// The cache is checked first: when it is already populated the repo is reused
/// without any network access. Otherwise the skeleton is fetched (preferring a
/// tarball download over `git clone` for speed) straight into the cache
/// directory. No temporary or per-project working copies are created, and the
/// returned directory is never removed by callers.
pub fn clone_skeleton(silent: bool) -> Option<PathBuf> {
    let cache_dir = skeleton_cache_dir()?;

    if is_populated(&cache_dir) {
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
