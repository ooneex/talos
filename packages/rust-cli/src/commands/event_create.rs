use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, scaffold_resource, to_kebab_case,
};

const TEMPLATE: &str = include_str!("../templates/event.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/event.test.txt");

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
    let channel = args.channel.clone();
    scaffold_resource(
        &ScaffoldConfig {
            label: "Event",
            prompt_message: "Enter name",
            suffix: "Event",
            strip_suffixes: &["Event", "PubSub"],
            template: TEMPLATE,
            test_template: TEST_TEMPLATE,
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
