use clap::Args;

use crate::utils::{ask_password, save_credentials};

const NPM_TOKEN_URL: &str =
    "https://www.npmjs.com/settings/<username>/tokens/granular-access-tokens/new";

#[derive(Args, Debug)]
pub struct NpmCredentialsCreateArgs {
    #[arg(long)]
    pub token: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,
}

pub fn run(args: &NpmCredentialsCreateArgs) {
    if !args.silent {
        println!("Create a Granular Access Token at {NPM_TOKEN_URL}");
    }

    let Some(token) = args
        .token
        .clone()
        .or_else(|| ask_password("Enter npm Granular Access Token"))
    else {
        return;
    };

    save_credentials(
        "npm.yml",
        "npm",
        &[("token".to_string(), token)],
        args.silent,
    );
}
