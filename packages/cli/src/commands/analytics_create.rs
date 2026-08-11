use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, read_template, scaffold_resource,
    skeleton_templates_dir,
};

#[derive(Args, Debug)]
pub struct AnalyticsCreateArgs {
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

pub fn run(args: &AnalyticsCreateArgs) {
    let Some(templates_dir) = skeleton_templates_dir(false, !args.no_cache) else {
        return;
    };
    let Some(template) = read_template(&templates_dir, "analytics.txt") else {
        return;
    };
    let Some(test_template) = read_template(&templates_dir, "analytics.test.txt") else {
        return;
    };
    scaffold_resource(
        &ScaffoldConfig {
            label: "Analytics",
            prompt_message: "Enter analytics name",
            suffix: "Analytics",
            template,
            test_template,
            dir: "analytics",
            dependency: Some("@talosjs/analytics"),
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
