use clap::ValueEnum;

/// Issue tracker backend targeted by `issue:pull` / `issue:push`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, ValueEnum)]
pub enum Provider {
    /// Linear (default) — uses the Linear GraphQL API.
    #[default]
    Linear,
    /// GitHub — uses the `gh` CLI against the current repository.
    Github,
}
