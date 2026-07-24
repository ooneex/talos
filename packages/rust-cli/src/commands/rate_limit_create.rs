use clap::Args;

use crate::utils::{ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource};

const TEMPLATE: &str = include_str!("../templates/rate-limit.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/rate-limit.test.txt");

#[derive(Args, Debug)]
pub struct RateLimitCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &RateLimitCreateArgs) {
    scaffold_resource(
        &ScaffoldConfig {
            label: "RateLimiter",
            prompt_message: "Enter rate limiter name",
            suffix: "RateLimiter",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
            dir: "rate-limit",
            strip_suffixes: &["RateLimiter", "RateLimit"],
            dependency: Some("@talosjs/rate-limit"),
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
