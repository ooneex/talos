pub mod app_create;
pub mod app_init;

use clap::Subcommand;

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Initialize a new application from the Talos skeleton.
    #[command(name = "app:init")]
    AppInit(app_init::AppInitArgs),

    /// Create a new API application, with optional CI/CD scaffolding.
    #[command(name = "app:create")]
    AppCreate(app_create::AppCreateArgs),
}

impl Commands {
    pub fn run(&self) {
        match self {
            Commands::AppInit(args) => app_init::run(args),
            Commands::AppCreate(args) => app_create::run(args),
        }
    }
}
