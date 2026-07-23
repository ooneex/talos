use clap::Args;

use crate::commands::monorepo_run::{self, MonorepoRunArgs};

/// Rust port of `packages/cli/src/commands/RunCommand.ts`: a short alias for
/// `monorepo:run`, forwarding every option untouched.
#[derive(Args, Debug)]
pub struct RunArgs {
    #[arg(long)]
    pub commands: Option<String>,
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

pub fn run(args: &RunArgs) {
    monorepo_run::run(&MonorepoRunArgs {
        commands: args.commands.clone(),
        packages: args.packages.clone(),
        modules: args.modules.clone(),
        logs: args.logs,
        no_cache: args.no_cache,
        cwd: args.cwd.clone(),
    });
}
