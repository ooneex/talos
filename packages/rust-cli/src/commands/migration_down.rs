use clap::Args;

use crate::utils::{RunModuleScriptsOptions, current_dir, run_module_scripts};

/// Rust port of `packages/cli/src/commands/MigrationDownCommand.ts`.
#[derive(Args, Debug)]
pub struct MigrationDownArgs {
    /// Target migration version to roll back to (defaults to the latest).
    #[arg(long)]
    pub version: Option<String>,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &MigrationDownArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    run_module_scripts(
        &cwd,
        RunModuleScriptsOptions {
            bin_path: &["bin", "migration", "down.ts"],
            label: "migrations",
            drop: false,
            env: None,
            version: args.version.clone(),
            no_cache: false,
            // Points at the same per-module cache the `up` runner uses, so a
            // rollback deletes the entry from where it was written.
            cache_dir: Some("var/cache/migrations"),
        },
    );
}
