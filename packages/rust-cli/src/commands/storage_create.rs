use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource, to_snake_case,
};

const TEMPLATE: &str = include_str!("../templates/storage.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/storage.test.txt");

#[derive(Args, Debug)]
pub struct StorageCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &StorageCreateArgs) {
    scaffold_resource(
        &ScaffoldConfig {
            label: "Storage",
            prompt_message: "Enter storage name",
            suffix: "Storage",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
            dir: "storage",
            dependency: Some("@talosjs/storage"),
            template_data: Some(Box::new(|name: &str| {
                vec![("NAME_UPPER", to_snake_case(name).to_uppercase())]
            })),
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
