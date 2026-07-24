use clap::Args;

use crate::utils::{ask_input_with_default, ask_password, ask_plain_input, save_credentials};

const DOCKER_TOKEN_URL: &str = "https://app.docker.com/settings/personal-access-tokens/create";

#[derive(Args, Debug)]
pub struct DockerCredentialsCreateArgs {
    #[arg(long)]
    pub registry: Option<String>,

    #[arg(long)]
    pub username: Option<String>,

    #[arg(long)]
    pub token: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,
}

pub fn run(args: &DockerCredentialsCreateArgs) {
    if !args.silent {
        println!("Create a Docker access token at {DOCKER_TOKEN_URL}");
    }

    let Some(registry) = args
        .registry
        .clone()
        .or_else(|| ask_input_with_default("Enter Docker registry", "docker.io"))
    else {
        return;
    };
    let Some(username) = args
        .username
        .clone()
        .or_else(|| ask_plain_input("Enter Docker username"))
    else {
        return;
    };
    let Some(token) = args
        .token
        .clone()
        .or_else(|| ask_password("Enter Docker access token"))
    else {
        return;
    };

    save_credentials(
        "docker.yml",
        "Docker",
        &[
            ("registry".to_string(), registry),
            ("username".to_string(), username),
            ("token".to_string(), token),
        ],
        args.silent,
    );
}
