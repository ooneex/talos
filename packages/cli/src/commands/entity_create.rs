use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, pluralize, read_template, scaffold_resource,
    skeleton_templates_dir, to_snake_case,
};

#[derive(Args, Debug)]
pub struct EntityCreateArgs {
    #[arg(
        long,
        default_value_t = false,
        help = "Bypass the skeleton cache and re-download templates (the cache otherwise auto-refreshes after 24h)"
    )]
    pub no_cache: bool,

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
    let Some(templates_dir) = skeleton_templates_dir(false, !args.no_cache) else {
        return;
    };
    let Some(template) = read_template(&templates_dir, "entity.txt") else {
        return;
    };
    let Some(test_template) = read_template(&templates_dir, "entity.test.txt") else {
        return;
    };
    let table_name = args.table_name.clone();
    scaffold_resource(
        &ScaffoldConfig {
            label: "Entity",
            prompt_message: "Enter entity name",
            suffix: "Entity",
            template,
            test_template,
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
