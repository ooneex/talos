use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, read_template, scaffold_resource,
    skeleton_templates_dir,
};

#[derive(Args, Debug)]
pub struct CacheCreateArgs {
    #[arg(
        long,
        default_value_t = false,
        help = "Bypass the skeleton template cache and re-download templates (auto-refreshes after 24h); does not update the installed talos CLI binary itself — rerun the install script for that"
    )]
    pub no_cache: bool,

    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,
}

pub fn run(args: &CacheCreateArgs) {
    let Some(templates_dir) = skeleton_templates_dir(false, !args.no_cache) else {
        return;
    };
    let Some(template) = read_template(&templates_dir, "cache.txt") else {
        return;
    };
    let Some(test_template) = read_template(&templates_dir, "cache.test.txt") else {
        return;
    };
    scaffold_resource(
        &ScaffoldConfig {
            label: "Cache",
            prompt_message: "Enter cache name",
            suffix: "Cache",
            template,
            test_template,
            dir: "cache",
            dependency: Some("@talosjs/cache"),
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
