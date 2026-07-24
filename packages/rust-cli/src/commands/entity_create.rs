use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, pluralize, scaffold_resource, to_snake_case,
};

const TEMPLATE: &str = include_str!("../templates/entity.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/entity.test.txt");

#[derive(Args, Debug)]
pub struct EntityCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long)]
    pub table_name: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &EntityCreateArgs) {
    let table_name = args.table_name.clone();
    scaffold_resource(
        &ScaffoldConfig {
            label: "Entity",
            prompt_message: "Enter entity name",
            suffix: "Entity",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
            dir: "entities",
            module_field: Some("entities"),
            template_data: Some(Box::new(move |name: &str| {
                vec![(
                    "TABLE_NAME",
                    table_name
                        .clone()
                        .unwrap_or_else(|| to_snake_case(&pluralize(name))),
                )]
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
