use clap::Subcommand;

#[derive(Subcommand)]
pub enum Commands {}

impl Commands {
    pub fn run(&self) {
        match *self {}
    }
}
