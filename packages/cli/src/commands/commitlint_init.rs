use clap::Args;

use crate::commands::app_init::install_commitlint_hook;
use crate::utils::{current_dir, ensure_bin};

#[derive(Args, Debug)]
pub struct CommitlintInitArgs {
    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &CommitlintInitArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    if !ensure_bin("git") {
        return;
    }

    match install_commitlint_hook(&cwd) {
        Ok(()) => {}
        Err(error) => {
            crate::utils::error(&error);
            std::process::exit(1);
        }
    }
}
