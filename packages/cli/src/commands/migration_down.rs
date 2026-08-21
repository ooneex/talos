// `migration:down` — roll every module's migrations back, one module at a
// time, streaming each rollback as it lands under a progress bar, then a
// report. See [`module_scripts`](crate::utils) for the run itself.

use std::path::PathBuf;

use clap::Args;

use crate::commands::project_check::modules::wanted_names;
use crate::utils::{ModuleScriptsOptions, current_dir, run_module_scripts};

#[derive(Args, Debug)]
pub struct MigrationDownArgs {
    /// Only roll back modules whose directory name matches (comma-separated).
    #[arg(long)]
    pub modules: Option<String>,

    /// Alias for --modules (comma-separated).
    #[arg(long)]
    pub packages: Option<String>,

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
            cache_dir: "var/cache/migrations",
            drop: false,
            env: None,
            version: args.version.clone(),
            modules: wanted_names(args.modules.as_deref(), args.packages.as_deref()),
            no_cache: false,
            // A module whose migrations sit on top of another module's tables
            // must be undone before the module underneath it.
            reverse: true,
        },
        args.logs,
    )
}
