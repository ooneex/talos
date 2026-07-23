use clap::Args;

use crate::commands::monorepo_run::{self, MonorepoRunArgs};

/// Rust port of `packages/cli/src/commands/LintCommand.ts`: a short alias
/// for `monorepo:run --commands=lint`.
#[derive(Args, Debug)]
pub struct LintArgs {
    #[arg(long)]
    pub packages: Option<String>,
    #[arg(long)]
    pub modules: Option<String>,
    #[arg(long, default_value_t = false)]
    pub logs: bool,
    #[arg(long, default_value_t = false)]
    pub no_cache: bool,
    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &LintArgs) {
    monorepo_run::run(&MonorepoRunArgs {
        commands: Some("lint".to_string()),
        packages: args.packages.clone(),
        modules: args.modules.clone(),
        logs: args.logs,
        no_cache: args.no_cache,
        cwd: args.cwd.clone(),
    });
}
