use clap::Args;
use std::time::Instant;

use crate::commands::test::{self, TestArgs};
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
        // The gate lints and nothing else, so it never reads any of these —
        // they are only here for the callers of `workspace_check::measure`
        // and `score`, which build the same arguments themselves.
        threshold: None,
        concurrency: None,
        strict: false,
        output: args.output,
        cwd: args.cwd.clone(),
    }
}

pub fn forwarded_test_args(args: &CheckArgs) -> TestArgs {
    TestArgs {
        packages: args.packages.clone(),
        modules: args.modules.clone(),
        logs: args.logs,
        no_cache: args.no_cache,
        concurrency: None,
        cwd: args.cwd.clone(),
    }
}

pub fn run(args: &CheckArgs) {
    let started = Instant::now();
    let workspace_args = forwarded_args(args);
    let mut workspace = workspace_check::audit(&workspace_args);
    let tests_passed = test::execute(&forwarded_test_args(args));
    let passed = workspace.passed() && tests_passed;
    workspace.elapsed_ms = started.elapsed().as_millis() as u64;

    workspace_check::write_requested_output(
        &workspace_args,
        &workspace,
        Some(tests_passed),
        passed,
    );

    if !passed {
        std::process::exit(1);
    }
}
