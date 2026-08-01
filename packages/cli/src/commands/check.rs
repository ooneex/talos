use clap::Args;

use crate::commands::monorepo_check::{self, MonorepoCheckArgs};

#[derive(Args, Debug)]
pub struct CheckArgs {
    #[arg(long)]
    pub packages: Option<String>,
    #[arg(long)]
    pub modules: Option<String>,
    #[arg(long, default_value_t = false)]
    pub logs: bool,
    #[arg(long, default_value_t = false)]
    pub no_cache: bool,
    /// Minimum line and function coverage a module must reach, in percent.
    #[arg(long)]
    pub threshold: Option<f64>,
    /// How many suites run at once (defaults to the core count, capped at 8).
    #[arg(long)]
    pub concurrency: Option<usize>,
    /// Fail on every module that stayed under the coverage threshold.
    #[arg(long, default_value_t = false)]
    pub strict: bool,
    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &CheckArgs) {
    monorepo_check::run(&MonorepoCheckArgs {
        packages: args.packages.clone(),
        modules: args.modules.clone(),
        logs: args.logs,
        no_cache: args.no_cache,
        threshold: args.threshold,
        concurrency: args.concurrency,
        strict: args.strict,
        cwd: args.cwd.clone(),
    });
}
