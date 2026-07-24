use clap::Args;

use crate::utils::{ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource};

const TEMPLATE: &str = include_str!("../templates/cache.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/cache.test.txt");

#[derive(Args, Debug)]
pub struct CacheCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

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
