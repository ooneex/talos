use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, ask_confirm, ask_input, current_dir, read_template,
    scaffold_resource, skeleton_templates_dir,
};

#[derive(Args, Debug)]
pub struct MiddlewareCreateArgs {
    #[arg(long, default_value_t = false)]
    pub no_cache: bool,

    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,

    #[arg(long)]
    pub is_socket: Option<bool>,
}

pub fn run(args: &MiddlewareCreateArgs) {
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter middleware name") {
            Some(name) => name,
            None => return,
        },
    };

    let is_socket = match args.is_socket {
        Some(value) => value,
        None => ask_confirm("Is this a socket middleware?", false),
    };

    let Some(templates_dir) = skeleton_templates_dir(false, !args.no_cache) else {
        return;
    };
    let template_file = if is_socket {
        "middleware.socket.txt"
    } else {
        "middleware.txt"
    };
    let Some(template) = read_template(&templates_dir, template_file) else {
        return;
    };
    let Some(test_template) = read_template(&templates_dir, "middleware.test.txt") else {
        return;
    };

    scaffold_resource(
        &ScaffoldConfig {
            label: "Middleware",
            prompt_message: "Enter middleware name",
            suffix: "Middleware",
            template,
            test_template,
            dir: "middlewares",
            module_field: Some("middlewares"),
            dependency: Some("@talosjs/middleware"),
            ..Default::default()
        },
        ScaffoldOptions {
            name: Some(name),
            module: args.module.clone(),
            r#override: args.r#override,
        },
        &current_dir(),
    );
}
