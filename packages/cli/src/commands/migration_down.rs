// `migration:down` — roll every module's migrations back, one module at a
// time, behind a progress bar and a report. See
// [`module_scripts`](crate::utils) for the run itself.

use std::path::PathBuf;

use clap::Args;

use crate::utils::{ModuleScriptsOptions, current_dir, run_module_scripts};

#[derive(Args, Debug)]
pub struct MigrationDownArgs {
    /// The migration version to roll back (defaults to the latest one).
    #[arg(long)]
    pub version: Option<String>,

    /// Print the output of every module that fails.
    #[arg(long, default_value_t = false)]
    pub logs: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &MigrationDownArgs) {
    if !execute(args) {
        std::process::exit(1);
    }
}

/// Roll every module's migrations back and print the report, returning
/// whether the run succeeded.
pub fn execute(args: &MigrationDownArgs) -> bool {
    let root = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);

    run_module_scripts(
        &root,
        ModuleScriptsOptions {
            bin_path: &["bin", "migration", "down.ts"],
            script: "migration:down",
            group: "Rollback",
            title: "Rollback report",
            done: "rolled back",
            clean: "Every rollback succeeded",
            drop: false,
            env: None,
            version: args.version.clone(),
            // A module whose migrations sit on top of another module's tables
            // must be undone before the module underneath it.
            reverse: true,
        },
        args.logs,
    )
}
