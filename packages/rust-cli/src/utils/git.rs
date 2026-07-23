//! Read-only git queries backed by `git2` (libgit2 bindings), replacing
//! shell-outs to the `git` CLI for information that doesn't touch
//! credentials, hooks, or signing (see `is_git_workspace_root`,
//! `origin_url`, `toplevel`, and their callers in `commands/`).

use std::path::{Path, PathBuf};

use git2::Repository;

/// Opens the repository containing (or above) `dir` by discovering upward
/// from it, mirroring how plain `git` subcommands locate the repo from a cwd.
pub fn discover(dir: &Path) -> Option<Repository> {
    Repository::discover(dir).ok()
}

/// Mirrors `git config --get remote.origin.url`.
pub fn origin_url(cwd: &Path) -> Option<String> {
    let repo = discover(cwd)?;
    repo.find_remote("origin").ok()?.url().map(str::to_string)
}

/// Mirrors `git rev-parse --show-toplevel`: the work tree root of the
/// repository containing `dir`, or `None` for a bare repository or when
/// `dir` isn't inside a git repository.
pub fn toplevel(dir: &Path) -> Option<PathBuf> {
    discover(dir)?.workdir().map(Path::to_path_buf)
}
