use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, read_template, scaffold_resource,
    skeleton_templates_dir, to_kebab_case,
};

#[derive(Args, Debug)]
pub struct EventCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,

    #[arg(long)]
    pub channel: Option<String>,
}

pub fn run(args: &EventCreateArgs) {
    let Some(templates_dir) = skeleton_templates_dir(false) else {
        return;
    };
    let Some(template) = read_template(&templates_dir, "event.txt") else {
        return;
    };
    let Some(test_template) = read_template(&templates_dir, "event.test.txt") else {
        return;
    };
    let channel = args.channel.clone();
    scaffold_resource(
        &ScaffoldConfig {
            label: "Event",
            prompt_message: "Enter name",
            suffix: "Event",
            strip_suffixes: &["Event", "PubSub"],
            template,
            test_template,
            dir: "events",
            module_field: Some("events"),
            dependency: Some("@talosjs/event"),
            template_data: Some(Box::new(move |name: &str| {
                vec![(
                    "CHANNEL",
                    channel.clone().unwrap_or_else(|| to_kebab_case(name)),
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
