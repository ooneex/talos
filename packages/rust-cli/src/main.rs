mod commands;

use clap::Parser;
use commands::Commands;

#[derive(Parser)]
#[command(name = "talos", about = "Talos CLI", version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

fn main() {
    let cli = Cli::parse();
    cli.command.run();
}
