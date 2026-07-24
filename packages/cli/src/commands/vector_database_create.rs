use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, read_template, scaffold_resource,
    skeleton_templates_dir,
};

#[derive(Args, Debug)]
pub struct VectorDatabaseCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &VectorDatabaseCreateArgs) {
    let Some(templates_dir) = skeleton_templates_dir(false) else {
        return;
    };
    let Some(template) = read_template(&templates_dir, "vector-database.txt") else {
        return;
    };
    let Some(test_template) = read_template(&templates_dir, "vector-database.test.txt") else {
        return;
    };
    scaffold_resource(
        &ScaffoldConfig {
            label: "Vector database",
            prompt_message: "Enter vector database name",
            suffix: "VectorDatabase",
            template,
            test_template,
            dir: "databases",
            strip_suffixes: &["VectorDatabase", "Database"],
            dependency: Some("@talosjs/rag"),
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
