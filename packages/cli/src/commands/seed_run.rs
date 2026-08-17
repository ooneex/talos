// `seed:run` — run every module's seeds, one module at a time, behind a
// progress bar and a report. See [`module_scripts`](crate::utils) for the run
// itself.

use std::path::PathBuf;

use clap::Args;

use crate::utils::{ModuleScriptsOptions, current_dir, run_module_scripts};

#[derive(Args, Debug)]
pub struct SeedRunArgs {
    /// Clear the seeded data before the first module runs.
    #[arg(long, default_value_t = false)]
    pub drop: bool,

    /// The `APP_ENV` every seed script runs under.
    #[arg(long)]
    pub env: Option<String>,

    /// Print the output of every module that fails.
    #[arg(long, default_value_t = false)]
    pub logs: bool,

    /// Skip reading and writing the seed cache.
    #[arg(long, default_value_t = false)]
    pub no_cache: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &SeedRunArgs) {
    if !execute(args) {
        std::process::exit(1);
    }
}

/// Run every module's seeds and print the report, returning whether the run
/// succeeded.
pub fn execute(args: &SeedRunArgs) -> bool {
    let root = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);

    run_module_scripts(
        &root,
        ModuleScriptsOptions {
            bin_path: &["bin", "seed", "run.ts"],
            script: "seed:run",
            group: "Seed",
            title: "Seed report",
            done: "seeded",
            clean: "Every seed ran",
            cache_dir: "var/cache/seeds",
            drop: args.drop,
            env: args.env.clone(),
            version: None,
            no_cache: args.no_cache,
            reverse: false,
        },
        args.logs,
    )
}
