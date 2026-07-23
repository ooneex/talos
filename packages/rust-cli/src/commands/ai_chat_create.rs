use clap::Args;

use crate::utils::{ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource};

const TEMPLATE: &str = include_str!("../templates/ai-chat.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/ai-chat.test.txt");

/// Rust port of `packages/cli/src/commands/AiChatCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct AiChatCreateArgs {
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

pub fn run(args: &AiChatCreateArgs) {
    scaffold_resource(
        &ScaffoldConfig {
            label: "AI chat",
            prompt_message: "Enter chat name",
            suffix: "Chat",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
            dir: "ai/chats",
            dependency: Some("@talosjs/ai"),
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
