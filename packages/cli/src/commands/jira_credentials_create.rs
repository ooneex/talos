use clap::Args;

use crate::utils::{ask_input_with_default, ask_password, ask_plain_input, save_credentials};

const JIRA_TOKEN_URL: &str = "https://id.atlassian.com/manage-profile/security/api-tokens";

#[derive(Args, Debug)]
pub struct JiraCredentialsCreateArgs {
    #[arg(long)]
    pub base_url: Option<String>,

    #[arg(long)]
    pub email: Option<String>,

    #[arg(long)]
    pub token: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,
}

pub fn run(args: &JiraCredentialsCreateArgs) {
    if !args.silent {
        println!("Create an API token at {JIRA_TOKEN_URL}");
    }

    let Some(base_url) = args.base_url.clone().or_else(|| {
        ask_input_with_default("Enter Jira base URL", "https://your-domain.atlassian.net")
    }) else {
        return;
    };
    let Some(email) = args
        .email
        .clone()
        .or_else(|| ask_plain_input("Enter Jira account email"))
    else {
        return;
    };
    let Some(token) = args
        .token
        .clone()
        .or_else(|| ask_password("Enter Jira API token"))
    else {
        return;
    };

    save_credentials(
        "jira.yml",
        "Jira",
        &[
            ("baseUrl".to_string(), base_url),
            ("email".to_string(), email),
            ("token".to_string(), token),
        ],
        args.silent,
    );
}
