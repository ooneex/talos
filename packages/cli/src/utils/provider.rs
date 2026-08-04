use clap::ValueEnum;

use super::github;
use super::linear::LinearClient;

/// Issue tracker backend targeted by `issue:pull` / `issue:push`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, ValueEnum)]
pub enum Provider {
    /// Linear (default) — uses the Linear GraphQL API.
    #[default]
    Linear,
    /// GitHub — uses the `gh` CLI against the current repository.
    Github,
}

/// Resolves the API client needed for the selected `--provider`, exiting the process
/// with a helpful message when the required credentials/tooling are missing.
/// Linear needs a `LinearClient` built from saved credentials; GitHub instead relies
/// on an already-authenticated `gh` CLI, so no client value is returned for it.
pub fn resolve_provider_client(provider: Provider) -> Option<LinearClient> {
    match provider {
        Provider::Linear => match LinearClient::from_credentials() {
            Some(client) => Some(client),
            None => {
                crate::utils::error(
                    "No Linear credentials found. Run `talos credentials:create --provider=linear`",
                );
                std::process::exit(1);
            }
        },
        Provider::Github => {
            if !github::is_available() {
                crate::utils::error(
                    "GitHub CLI (`gh`) not found. Install it and run `gh auth login`",
                );
                std::process::exit(1);
            }
            None
        }
    }
}
