use clap::Args;

use crate::utils::{ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource};

const TEMPLATE: &str = include_str!("../templates/analytics.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/analytics.test.txt");

#[derive(Args, Debug)]
pub struct AnalyticsCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &AnalyticsCreateArgs) {
    scaffold_resource(
        &ScaffoldConfig {
            label: "Analytics",
            prompt_message: "Enter analytics name",
            suffix: "Analytics",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
            dir: "analytics",
            dependency: Some("@talosjs/analytics"),
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
