use clap::Args;

use crate::utils::{RunModuleScriptsOptions, current_dir, run_module_scripts};

#[derive(Args, Debug)]
pub struct MigrationDownArgs {
    #[arg(long)]
    pub version: Option<String>,

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
            cache_dir: Some("var/cache/migrations"),
        },
    );
}
