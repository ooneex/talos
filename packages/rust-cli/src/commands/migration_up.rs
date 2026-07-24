use clap::Args;

use crate::utils::{RunModuleScriptsOptions, current_dir, run_module_scripts};

#[derive(Args, Debug)]
pub struct MigrationUpArgs {
    #[arg(long, default_value_t = false)]
    pub drop: bool,

    #[arg(long, default_value_t = false)]
    pub no_cache: bool,

    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &MigrationUpArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    run_module_scripts(
        &cwd,
        RunModuleScriptsOptions {
            bin_path: &["bin", "migration", "up.ts"],
            label: "migrations",
            drop: args.drop,
            env: None,
            version: None,
            no_cache: args.no_cache,
            cache_dir: Some("var/cache/migrations"),
        },
    );
}
