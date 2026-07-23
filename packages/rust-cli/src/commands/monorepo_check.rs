use clap::Args;

use crate::commands::monorepo_run::{self, MonorepoRunArgs};

// The full verification pipeline, run in order: dependencies first, then the
// per-target scripts. `monorepo:run` already sequences one command group
// after another, so listing them here gives install → build → fmt → lint → test.
const CHECK_COMMANDS: &str = "build,fmt,lint,test";

/// Rust port of `packages/cli/src/commands/MonorepoCheckCommand.ts`.
#[derive(Args, Debug)]
pub struct MonorepoCheckArgs {
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

pub fn run(args: &MonorepoCheckArgs) {
    monorepo_run::run(&MonorepoRunArgs {
        commands: Some(CHECK_COMMANDS.to_string()),
        packages: args.packages.clone(),
        modules: args.modules.clone(),
        logs: args.logs,
        no_cache: args.no_cache,
        cwd: args.cwd.clone(),
    });
}
