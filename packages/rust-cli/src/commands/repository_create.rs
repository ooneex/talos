use clap::Args;

use crate::utils::{ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource};

const TEMPLATE: &str = include_str!("../templates/repository.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/repository.test.txt");

#[derive(Args, Debug)]
pub struct RepositoryCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

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
