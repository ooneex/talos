use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource, to_snake_case,
};

const TEMPLATE: &str = include_str!("../templates/ai-tool.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/ai-tool.test.txt");

/// Rust port of `packages/cli/src/commands/AiToolCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct AiToolCreateArgs {
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

pub fn run(args: &AiToolCreateArgs) {
    scaffold_resource(
        &ScaffoldConfig {
            label: "AI tool",
            prompt_message: "Enter tool name",
            suffix: "Tool",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
            dir: "ai/tools",
            dependency: Some("@talosjs/ai"),
            template_data: Some(Box::new(|name: &str| vec![("SNAKE", to_snake_case(name))])),
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
