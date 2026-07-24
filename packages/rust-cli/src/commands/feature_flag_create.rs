use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource, to_kebab_case,
};

const TEMPLATE: &str = include_str!("../templates/feature-flag.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/feature-flag.test.txt");

#[derive(Args, Debug)]
pub struct FeatureFlagCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &FeatureFlagCreateArgs) {
    scaffold_resource(
        &ScaffoldConfig {
            label: "Feature flag",
            prompt_message: "Enter name",
            suffix: "FeatureFlag",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
            dir: "flags",
            tests_dir: Some("feature-flag"),
            dependency: Some("@talosjs/feature-flag"),
            template_data: Some(Box::new(|name: &str| vec![("KEY", to_kebab_case(name))])),
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
