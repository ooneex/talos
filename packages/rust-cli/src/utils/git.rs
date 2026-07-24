use std::path::{Path, PathBuf};

use git2::Repository;

pub fn discover(dir: &Path) -> Option<Repository> {
    Repository::discover(dir).ok()
}

pub fn origin_url(cwd: &Path) -> Option<String> {
    let repo = discover(cwd)?;
    repo.find_remote("origin").ok()?.url().map(str::to_string)
}

pub fn toplevel(dir: &Path) -> Option<PathBuf> {
    discover(dir)?.workdir().map(Path::to_path_buf)
}
