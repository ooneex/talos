use clap::Parser;
use rust_cli::commands::Commands;

#[derive(Parser)]
#[command(
    name = "talosrs",
    about = "Talosrs CLI",
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
