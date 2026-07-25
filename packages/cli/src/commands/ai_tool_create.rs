use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, read_template, scaffold_resource,
    skeleton_templates_dir, to_snake_case,
};

#[derive(Args, Debug)]
pub struct AiToolCreateArgs {
    #[arg(long, default_value_t = false)]
    pub no_cache: bool,

    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &AiToolCreateArgs) {
    let Some(templates_dir) = skeleton_templates_dir(false, !args.no_cache) else {
        return;
    };
    let Some(template) = read_template(&templates_dir, "ai-tool.txt") else {
        return;
    };
    let Some(test_template) = read_template(&templates_dir, "ai-tool.test.txt") else {
        return;
    };
    scaffold_resource(
        &ScaffoldConfig {
            label: "AI tool",
            prompt_message: "Enter tool name",
            suffix: "Tool",
            template,
            test_template,
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
