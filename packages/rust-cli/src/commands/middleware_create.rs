use clap::Args;

use crate::utils::{
    ScaffoldConfig, ScaffoldOptions, ask_confirm, ask_input, current_dir, scaffold_resource,
};

const TEMPLATE: &str = include_str!("../templates/middleware.txt");
const SOCKET_TEMPLATE: &str = include_str!("../templates/middleware.socket.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/middleware.test.txt");

/// Rust port of `packages/cli/src/commands/MiddlewareCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct MiddlewareCreateArgs {
    /// Middleware name.
    #[arg(long)]
    pub name: Option<String>,

    /// Destination module (defaults to "shared").
    #[arg(long)]
    pub module: Option<String>,

    /// Overwrite the file if it already exists without prompting.
    #[arg(long, default_value_t = false)]
    pub r#override: bool,

    /// Whether this is a WebSocket middleware (prompted for when omitted).
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

    scaffold_resource(
        &ScaffoldConfig {
            label: "Middleware",
            prompt_message: "Enter middleware name",
            suffix: "Middleware",
            template: if is_socket { SOCKET_TEMPLATE } else { TEMPLATE },
            test_template: TEST_TEMPLATE,
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
