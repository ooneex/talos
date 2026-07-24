use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, read_template, scaffold_resource,
    skeleton_templates_dir, to_snake_case,
};

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
    let Some(templates_dir) = skeleton_templates_dir(false) else {
        return;
    };
    let Some(template) = read_template(&templates_dir, "storage.txt") else {
        return;
    };
    let Some(test_template) = read_template(&templates_dir, "storage.test.txt") else {
        return;
    };
    scaffold_resource(
        &ScaffoldConfig {
            label: "Storage",
            prompt_message: "Enter storage name",
            suffix: "Storage",
            template,
            test_template,
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
