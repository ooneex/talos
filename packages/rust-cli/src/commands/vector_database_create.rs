use clap::Args;

use crate::utils::{ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource};

const TEMPLATE: &str = include_str!("../templates/vector-database.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/vector-database.test.txt");

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
    scaffold_resource(
        &ScaffoldConfig {
            label: "Vector database",
            prompt_message: "Enter vector database name",
            suffix: "VectorDatabase",
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
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
