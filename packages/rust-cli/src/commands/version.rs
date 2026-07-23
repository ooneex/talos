use clap::Args;

/// Rust port of `packages/cli/src/commands/VersionCommand.ts`. Uses the crate's
/// own Cargo-embedded version instead of walking up to find `package.json`
/// (there's no npm package tree to walk in the native binary).
#[derive(Args, Debug)]
pub struct VersionArgs {}

pub fn run(_args: &VersionArgs) {
    println!("{}", env!("CARGO_PKG_VERSION"));
}
