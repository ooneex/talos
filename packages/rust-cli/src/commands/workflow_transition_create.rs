use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource, to_kebab_case,
};

const TEMPLATE: &str = include_str!("../templates/workflow-transition.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/workflow-transition.test.txt");

#[derive(Args, Debug)]
pub struct WorkflowTransitionCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &WorkflowTransitionCreateArgs) {
    scaffold_resource(
        &ScaffoldConfig {
            label: "Workflow transition",
            prompt_message: "Enter transition name",
            suffix: "Transition",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
            dir: "workflows/transitions",
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
