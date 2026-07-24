use clap::Args;

#[derive(Args, Debug)]
pub struct VersionArgs {}

pub fn run(_args: &VersionArgs) {
    println!("{}", env!("CARGO_PKG_VERSION"));
}
