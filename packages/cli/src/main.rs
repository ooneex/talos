use clap::Parser;
use cli::commands::Commands;

#[derive(Parser)]
#[command(
    name = "talos",
    about = "Talos CLI",
    version,
    disable_help_subcommand = true
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

fn main() {
    let cli = Cli::parse();

    if let Some(command) = cli.command {
        command.run();
    }
}
