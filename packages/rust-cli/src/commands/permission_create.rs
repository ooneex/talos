use clap::Args;

use crate::utils::{ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource};

const TEMPLATE: &str = include_str!("../templates/permission.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/permission.test.txt");

#[derive(Args, Debug)]
pub struct PermissionCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &PermissionCreateArgs) {
    scaffold_resource(
        &ScaffoldConfig {
            label: "Permission",
            prompt_message: "Enter permission name",
            suffix: "Permission",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
            dir: "permissions",
            dependency: Some("@talosjs/permission"),
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
