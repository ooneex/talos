use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource, to_kebab_case,
};

const TEMPLATE: &str = include_str!("../templates/workflow.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/workflow.test.txt");

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
    scaffold_resource(
        &ScaffoldConfig {
            label: "Workflow",
            prompt_message: "Enter workflow name",
            suffix: "Workflow",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
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
