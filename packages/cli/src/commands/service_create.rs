use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, read_template, scaffold_resource,
    skeleton_templates_dir,
};

#[derive(Args, Debug)]
pub struct ServiceCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &ServiceCreateArgs) {
    let Some(templates_dir) = skeleton_templates_dir(false) else {
        return;
    };
    let Some(template) = read_template(&templates_dir, "service.txt") else {
        return;
    };
    let Some(test_template) = read_template(&templates_dir, "service.test.txt") else {
        return;
    };
    scaffold_resource(
        &ScaffoldConfig {
            label: "Service",
            prompt_message: "Enter service name",
            suffix: "Service",
            template,
            test_template,
            dir: "services",
            dependency: Some("@talosjs/service"),
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
