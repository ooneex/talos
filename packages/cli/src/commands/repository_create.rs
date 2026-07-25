use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, read_template, scaffold_resource,
    skeleton_templates_dir,
};

#[derive(Args, Debug)]
pub struct RepositoryCreateArgs {
    #[arg(long, default_value_t = false)]
    pub no_cache: bool,

    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &RepositoryCreateArgs) {
    let Some(templates_dir) = skeleton_templates_dir(false, !args.no_cache) else {
        return;
    };
    let Some(template) = read_template(&templates_dir, "repository.txt") else {
        return;
    };
    let Some(test_template) = read_template(&templates_dir, "repository.test.txt") else {
        return;
    };
    scaffold_resource(
        &ScaffoldConfig {
            label: "Repository",
            prompt_message: "Enter repository name",
            suffix: "Repository",
            template,
            test_template,
            dir: "repositories",
            dependency: Some("@talosjs/repository"),
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
