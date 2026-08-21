// `migration:up` — apply every module's migrations, one module at a time,
// streaming each migration as it lands under a progress bar, then a report.
// See [`module_scripts`](crate::utils) for the run itself.

use std::path::PathBuf;

use clap::Args;

use crate::commands::project_check::modules::wanted_names;
use crate::utils::{ModuleScriptsOptions, current_dir, error, run_module_scripts};

#[derive(Args, Debug)]
pub struct MigrationUpArgs {
    /// Only migrate modules whose directory name matches (comma-separated).
    #[arg(long)]
    pub modules: Option<String>,

    /// Alias for --modules (comma-separated).
    #[arg(long)]
    pub packages: Option<String>,

    /// Drop the database before applying the first module's migrations.
    #[arg(long, default_value_t = false)]
    pub drop: bool,

    /// Print the output of every module that fails.
    #[arg(long, default_value_t = false)]
    pub logs: bool,

    /// Skip reading and writing the migration cache.
    #[arg(long, default_value_t = false)]
    pub no_cache: bool,

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
    let modules = wanted_names(args.modules.as_deref(), args.packages.as_deref());

    // `--drop` drops the schema every module shares, so a selection would
    // take the tables of the modules it left out with it and re-apply only
    // the ones it named — leaving their cached "already applied" markers
    // describing a database that no longer has them.
    if args.drop && !modules.is_empty() {
        error(
            "--drop drops the whole database, so it cannot be narrowed to --modules/--packages — run it without a selection, or drop the selection",
        );
        return false;
    }

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
            cache_dir: "var/cache/migrations",
            drop: args.drop,
            env: None,
            version: None,
            modules,
            no_cache: args.no_cache,
            reverse: false,
        },
        args.logs,
    )
}
