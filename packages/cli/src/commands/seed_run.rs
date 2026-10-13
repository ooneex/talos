// `seed:run` — run every module's seeds, one module at a time, streaming
// each seed as it lands under a progress bar, then a report. See
// [`module_scripts`](crate::utils) for the run itself.
//
// Each module's `bin/seed/run.ts` resolves `MainDatabase` from the container.
// The seeds package loads the app env before that script body runs.

use std::path::PathBuf;

use clap::Args;

use crate::commands::project_check::modules::wanted_names;
use crate::utils::{ModuleScriptsOptions, current_dir, info, run_module_scripts};

#[derive(Args, Debug)]
pub struct SeedRunArgs {
    /// Only seed modules whose directory name matches (comma-separated).
    #[arg(long)]
    pub modules: Option<String>,

    /// Alias for --modules (comma-separated).
    #[arg(long)]
    pub packages: Option<String>,

    /// Re-run every seed from scratch, ignoring the cache.
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

/// The `APP_ENV` the seeds will run under: what `--env` asks for, otherwise
/// whatever the shell already exports. `None` when neither sets it — the
/// seeds runtime then applies no environment filter (a module's own `.env`
/// may still set one), so the CLI must not claim `production`.
fn active_env(cli_env: Option<&str>, shell_env: Option<&str>) -> Option<String> {
    cli_env
        .or(shell_env)
        .filter(|env| !env.is_empty())
        .map(str::to_string)
}

fn env_banner(env: Option<&str>) -> String {
    match env {
        Some(env) => format!("Seeding under APP_ENV={env}"),
        None => "Seeding with APP_ENV unset — seeds are not filtered by environment unless a module's .env sets it".to_string(),
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

    let shell_env = std::env::var("APP_ENV").ok();
    let env = active_env(args.env.as_deref(), shell_env.as_deref());
    info(env_banner(env.as_deref()));

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
            modules: wanted_names(args.modules.as_deref(), args.packages.as_deref()),
            no_cache: args.no_cache,
            reverse: false,
        },
        args.logs,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_env_prefers_flag_then_shell() {
        assert_eq!(
            active_env(Some("test"), Some("staging")).as_deref(),
            Some("test")
        );
        assert_eq!(
            active_env(None, Some("staging")).as_deref(),
            Some("staging")
        );
    }

    #[test]
    fn active_env_does_not_default_to_production() {
        assert_eq!(active_env(None, None), None);
        assert_eq!(active_env(None, Some("")), None);
    }

    #[test]
    fn banner_reports_unfiltered_run_when_unset() {
        assert_eq!(env_banner(Some("local")), "Seeding under APP_ENV=local");
        let unset = env_banner(None);
        assert!(!unset.contains("production"));
        assert!(unset.contains("not filtered"));
    }
}
