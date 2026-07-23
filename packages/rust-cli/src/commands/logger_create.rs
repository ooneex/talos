use clap::Args;

use crate::utils::{ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource};

const TEMPLATE: &str = include_str!("../templates/logger.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/logger.test.txt");

/// Rust port of `packages/cli/src/commands/LoggerCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct LoggerCreateArgs {
    /// Resource name.
    #[arg(long)]
    pub name: Option<String>,

    /// Destination module (defaults to "shared").
    #[arg(long)]
    pub module: Option<String>,

    /// Overwrite the file if it already exists without prompting.
    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &LoggerCreateArgs) {
    scaffold_resource(
        &ScaffoldConfig {
            label: "Logger",
            prompt_message: "Enter logger name",
            suffix: "Logger",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
            dir: "loggers",
            dependency: Some("@talosjs/logger"),
            ..Default::default()
        },
        ScaffoldOptions {
            name: args.name.clone(),
            module: args.module.clone(),
            r#override: args.r#override,
        },
        &current_dir(),
    );
}
