use clap::Args;

use crate::utils::{ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource};

const TEMPLATE: &str = include_str!("../templates/queue.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/queue.test.txt");

#[derive(Args, Debug)]
pub struct QueueCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &QueueCreateArgs) {
    scaffold_resource(
        &ScaffoldConfig {
            label: "Queue",
            prompt_message: "Enter queue name",
            suffix: "Queue",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
            dir: "queues",
            dependency: Some("@talosjs/queue"),
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
