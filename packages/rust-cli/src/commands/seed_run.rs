use clap::Args;

use crate::utils::{RunModuleScriptsOptions, current_dir, run_module_scripts};

/// Rust port of `packages/cli/src/commands/SeedRunCommand.ts`.
#[derive(Args, Debug)]
pub struct SeedRunArgs {
    /// Drop existing data before seeding.
    #[arg(long, default_value_t = false)]
    pub drop: bool,

    /// Target environment (forwarded as `APP_ENV`).
    #[arg(long)]
    pub env: Option<String>,

    /// Bypass each module's per-seed run cache.
    #[arg(long, default_value_t = false)]
    pub no_cache: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &SeedRunArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    run_module_scripts(
        &cwd,
        RunModuleScriptsOptions {
            bin_path: &["bin", "seed", "run.ts"],
            label: "seeds",
            drop: args.drop,
            env: args.env.clone(),
            version: None,
            no_cache: args.no_cache,
            cache_dir: Some("var/cache/seeds"),
        },
    );
}
