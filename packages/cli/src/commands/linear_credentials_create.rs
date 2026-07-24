use clap::Args;

use crate::utils::{ask_password, save_credentials};

const LINEAR_TOKEN_URL: &str = "https://linear.app/settings/api";

#[derive(Args, Debug)]
pub struct LinearCredentialsCreateArgs {
    #[arg(long)]
    pub token: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,
}

pub fn run(args: &LinearCredentialsCreateArgs) {
    if !args.silent {
        println!("Create a Personal API key at {LINEAR_TOKEN_URL}");
    }

    let Some(token) = args
        .token
        .clone()
        .or_else(|| ask_password("Enter Linear Personal API key"))
    else {
        return;
    };

    save_credentials(
        "linear.yml",
        "Linear",
        &[("token".to_string(), token)],
        args.silent,
    );
}
