//! Skeleton repository cloning, mirroring `getSkeletonDir`/`cloneSkeleton` in
//! `packages/cli/src/agentConfig.ts`.

use std::process::Command;

use super::process::run_step;

/// Source repository cloned by `app:init` (and, transitively, `app:create`).
pub const SKELETON_REPO_URL: &str = "https://github.com/ooneex/skeleton.git";

/// Mirrors `getSkeletonDir`/`cloneSkeleton`: shallow-clones the skeleton repo
/// into a temporary directory and returns it (the clone lives at `<dir>/repo`).
pub fn clone_skeleton(silent: bool) -> Option<tempfile::TempDir> {
    let parent_dir = tempfile::Builder::new()
        .prefix("talos-skeleton-")
        .tempdir()
        .ok()?;
    let destination = parent_dir.path().join("repo");

    let cloned = run_step(
        silent,
        "Cloning skeleton repository...",
        Command::new("git").args([
            "clone",
            "--depth",
            "1",
            SKELETON_REPO_URL,
            destination.to_string_lossy().as_ref(),
        ]),
    );

    if cloned { Some(parent_dir) } else { None }
}
