use clap::Args;

use crate::utils::{ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource};

const TEMPLATE: &str = include_str!("../templates/repository.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/repository.test.txt");

/// Rust port of `packages/cli/src/commands/RepositoryCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct RepositoryCreateArgs {
    /// Repository name.
    #[arg(long)]
    pub name: Option<String>,

    /// Destination module (defaults to "shared").
    #[arg(long)]
    pub module: Option<String>,

    /// Overwrite the file if it already exists without prompting.
    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &RepositoryCreateArgs) {
    scaffold_resource(
        &ScaffoldConfig {
            label: "Repository",
            prompt_message: "Enter repository name",
            suffix: "Repository",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
            dir: "repositories",
            dependency: Some("@talosjs/repository"),
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
