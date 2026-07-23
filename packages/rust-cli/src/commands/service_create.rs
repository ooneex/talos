use clap::Args;

use crate::utils::{ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource};

const TEMPLATE: &str = include_str!("../templates/service.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/service.test.txt");

/// Rust port of `packages/cli/src/commands/ServiceCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct ServiceCreateArgs {
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

pub fn run(args: &ServiceCreateArgs) {
    scaffold_resource(
        &ScaffoldConfig {
            label: "Service",
            prompt_message: "Enter service name",
            suffix: "Service",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
            dir: "services",
            dependency: Some("@talosjs/service"),
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
