use clap::Args;

use crate::commands::workspace_check::{self, OutputFormat, WorkspaceCheckArgs};

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
    /// Also write the report to var/outputs/talos_check.md or
    /// var/outputs/talos_check.json, in the shape an AI agent is handed to fix
    /// what it lists.
    #[arg(long, value_enum)]
    pub output: Option<OutputFormat>,
    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn forwarded_args(args: &CheckArgs) -> WorkspaceCheckArgs {
    WorkspaceCheckArgs {
        packages: args.packages.clone(),
        modules: args.modules.clone(),
        logs: args.logs,
        no_cache: args.no_cache,
        threshold: args.threshold,
        concurrency: args.concurrency,
        strict: args.strict,
        output: args.output,
        cwd: args.cwd.clone(),
    }
}

pub fn run(args: &CheckArgs) {
    workspace_check::run(&forwarded_args(args));
}
