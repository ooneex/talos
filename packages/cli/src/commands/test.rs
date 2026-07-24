use clap::Args;

use crate::commands::monorepo_run::{self, MonorepoRunArgs};

#[derive(Args, Debug)]
pub struct TestArgs {
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

pub fn run(args: &TestArgs) {
    monorepo_run::run(&MonorepoRunArgs {
        commands: Some("test".to_string()),
        packages: args.packages.clone(),
        modules: args.modules.clone(),
        logs: args.logs,
        no_cache: args.no_cache,
        cwd: args.cwd.clone(),
    });
}
