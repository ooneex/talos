use std::path::PathBuf;

use clap::Args;

use crate::utils::{check_commit_message_file, current_dir, git_toplevel};

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

pub fn run(args: &CommitlintCheckArgs) {
    let Some(file) = args.file.as_ref() else {
        crate::utils::error("commitlint:check requires --file <commit-message-file>");
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
        .or_else(|| git_toplevel(&fallback_cwd))
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
    crate::utils::error(format!("Invalid commit message:\n{details}"));
    std::process::exit(1);
}
