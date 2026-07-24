use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, read_template, scaffold_resource,
    skeleton_templates_dir, to_kebab_case,
};

#[derive(Args, Debug)]
pub struct WorkflowCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &WorkflowCreateArgs) {
    let Some(templates_dir) = skeleton_templates_dir(false) else {
        return;
    };
    let Some(template) = read_template(&templates_dir, "workflow.txt") else {
        return;
    };
    let Some(test_template) = read_template(&templates_dir, "workflow.test.txt") else {
        return;
    };
    scaffold_resource(
        &ScaffoldConfig {
            label: "Workflow",
            prompt_message: "Enter workflow name",
            suffix: "Workflow",
            template,
            test_template,
            dir: "workflows",
            dependency: Some("@talosjs/workflow"),
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
