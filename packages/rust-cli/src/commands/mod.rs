mod version;

use clap::Subcommand;

#[derive(Subcommand)]
pub enum Commands {
    /// Print the version of the CLI
    Version,
}

impl Commands {
    pub fn run(&self) {
        match self {
            Commands::Version => version::run(),
        }
    }
}
