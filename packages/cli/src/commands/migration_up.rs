// `migration:up` — apply every module's migrations, one module at a time,
// behind a progress bar and a report. See [`module_scripts`](crate::utils) for
// the run itself.

use std::path::PathBuf;

use clap::Args;

use crate::utils::{ModuleScriptsOptions, current_dir, run_module_scripts};

#[derive(Args, Debug)]
pub struct MigrationUpArgs {
    /// Drop the database before applying the first module's migrations.
    #[arg(long, default_value_t = false)]
    pub drop: bool,

    /// Print the output of every module that fails.
    #[arg(long, default_value_t = false)]
    pub logs: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &MigrationUpArgs) {
    if !execute(args) {
        std::process::exit(1);
    }
}

/// Apply every module's migrations and print the report, returning whether
/// the run succeeded.
pub fn execute(args: &MigrationUpArgs) -> bool {
    let root = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);

    run_module_scripts(
        &root,
        ModuleScriptsOptions {
            bin_path: &["bin", "migration", "up.ts"],
            script: "migration:up",
            group: "Migrate",
            title: "Migration report",
            done: "migrated",
            clean: "Every module is up to date",
            drop: args.drop,
            env: None,
            version: None,
            reverse: false,
        },
        args.logs,
    )
}
