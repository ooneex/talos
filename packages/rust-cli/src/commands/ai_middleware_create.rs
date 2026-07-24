use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource, to_kebab_case,
};

const TEMPLATE: &str = include_str!("../templates/ai-middleware.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/ai-middleware.test.txt");

#[derive(Args, Debug)]
pub struct AiMiddlewareCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &AiMiddlewareCreateArgs) {
    scaffold_resource(
        &ScaffoldConfig {
            label: "AI middleware",
            prompt_message: "Enter middleware name",
            suffix: "Middleware",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
            dir: "ai/middlewares",
            dependency: Some("@talosjs/ai"),
            template_data: Some(Box::new(|name: &str| vec![("KEBAB", to_kebab_case(name))])),
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
