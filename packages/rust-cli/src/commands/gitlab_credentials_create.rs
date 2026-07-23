use clap::Args;

use crate::utils::{ask_password, save_credentials};

const GITLAB_TOKEN_URL: &str = "https://gitlab.com/-/user_settings/personal_access_tokens";

/// Rust port of `packages/cli/src/commands/GitlabCredentialsCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct GitlabCredentialsCreateArgs {
    /// GitLab Personal Access Token (prompted for when omitted).
    #[arg(long)]
    pub token: Option<String>,

    /// Suppress informational messages.
    #[arg(long, default_value_t = false)]
    pub silent: bool,
}

pub fn run(args: &GitlabCredentialsCreateArgs) {
    if !args.silent {
        println!("Create a Personal Access Token at {GITLAB_TOKEN_URL}");
    }

    let Some(token) = args
        .token
        .clone()
        .or_else(|| ask_password("Enter GitLab Personal Access Token"))
    else {
        return;
    };

    save_credentials(
        "gitlab.yml",
        "GitLab",
        &[("token".to_string(), token)],
        args.silent,
    );
}
