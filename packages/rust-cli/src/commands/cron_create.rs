use clap::Args;

use crate::utils::{ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource};

const TEMPLATE: &str = include_str!("../templates/cron.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/cron.test.txt");

#[derive(Args, Debug)]
pub struct CronCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &CronCreateArgs) {
    scaffold_resource(
        &ScaffoldConfig {
            label: "Cron",
            prompt_message: "Enter cron name",
            suffix: "Cron",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
            dir: "crons",
            module_field: Some("cronJobs"),
            dependency: Some("@talosjs/cron"),
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
