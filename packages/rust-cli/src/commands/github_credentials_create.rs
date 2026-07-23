use clap::Args;

use crate::utils::{ask_password, save_credentials};

const GITHUB_TOKEN_URL: &str = "https://github.com/settings/personal-access-tokens/new";

/// Rust port of `packages/cli/src/commands/GithubCredentialsCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct GithubCredentialsCreateArgs {
    /// GitHub Personal Access Token (prompted for when omitted).
    #[arg(long)]
    pub token: Option<String>,

    /// Suppress informational messages.
    #[arg(long, default_value_t = false)]
    pub silent: bool,
}

pub fn run(args: &GithubCredentialsCreateArgs) {
    if !args.silent {
        println!("Create a Personal Access Token at {GITHUB_TOKEN_URL}");
    }

    let Some(token) = args
        .token
        .clone()
        .or_else(|| ask_password("Enter GitHub Personal Access Token"))
    else {
        return;
    };

    save_credentials(
        "github.yml",
        "GitHub",
        &[("token".to_string(), token)],
        args.silent,
    );
}
