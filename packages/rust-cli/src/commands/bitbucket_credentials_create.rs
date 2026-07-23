use clap::Args;

use crate::utils::{ask_password, ask_plain_input, save_credentials};

const BITBUCKET_APP_PASSWORD_URL: &str = "https://bitbucket.org/account/settings/app-passwords/";

/// Rust port of `packages/cli/src/commands/BitbucketCredentialsCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct BitbucketCredentialsCreateArgs {
    /// Bitbucket username (prompted for when omitted).
    #[arg(long)]
    pub username: Option<String>,

    /// Bitbucket app password (prompted for when omitted).
    #[arg(long)]
    pub token: Option<String>,

    /// Suppress informational messages.
    #[arg(long, default_value_t = false)]
    pub silent: bool,
}

pub fn run(args: &BitbucketCredentialsCreateArgs) {
    if !args.silent {
        println!("Create an app password at {BITBUCKET_APP_PASSWORD_URL}");
    }

    let Some(username) = args
        .username
        .clone()
        .or_else(|| ask_plain_input("Enter Bitbucket username"))
    else {
        return;
    };
    let Some(token) = args
        .token
        .clone()
        .or_else(|| ask_password("Enter Bitbucket app password"))
    else {
        return;
    };

    save_credentials(
        "bitbucket.yml",
        "Bitbucket",
        &[
            ("username".to_string(), username),
            ("token".to_string(), token),
        ],
        args.silent,
    );
}
