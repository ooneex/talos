use std::path::PathBuf;
use std::process::Command;

use clap::Args;

use crate::utils::{check_commit_message_file, current_dir};

/// Rust port of `packages/cli/src/commands/CommitlintCheckCommand.ts`.
#[derive(Args, Debug)]
pub struct CommitlintCheckArgs {
    /// Commit message file to validate.
    #[arg(long)]
    pub file: Option<String>,

    /// Working directory (defaults to git root or current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

fn resolve_git_root(cwd: &std::path::Path) -> Option<PathBuf> {
    let output = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(cwd)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Some(PathBuf::from(stdout))
}

pub fn run(args: &CommitlintCheckArgs) {
    let Some(file) = args.file.as_ref() else {
        eprintln!("✖ commitlint:check requires --file <commit-message-file>");
        std::process::exit(1);
    };

    let fallback_cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let root_dir = args
        .cwd
        .as_ref()
        .map(PathBuf::from)
        .or_else(|| resolve_git_root(&fallback_cwd))
        .unwrap_or(fallback_cwd);

    let errors = check_commit_message_file(&PathBuf::from(file), &root_dir);
    if errors.is_empty() {
        return;
    }

    let details = errors
        .into_iter()
        .map(|error| format!("  • {error}"))
        .collect::<Vec<_>>()
        .join("\n");
    eprintln!("✖ Invalid commit message:\n{details}");
    std::process::exit(1);
}
