use clap::Args;

use crate::utils::{ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource};

const TEMPLATE: &str = include_str!("../templates/cache.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/cache.test.txt");

/// Rust port of `packages/cli/src/commands/CacheCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct CacheCreateArgs {
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

pub fn run(args: &CacheCreateArgs) {
    scaffold_resource(
        &ScaffoldConfig {
            label: "Cache",
            prompt_message: "Enter cache name",
            suffix: "Cache",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
            dir: "cache",
            dependency: Some("@talosjs/cache"),
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
