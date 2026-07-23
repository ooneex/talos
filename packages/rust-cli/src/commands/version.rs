/// Print the version of the CLI.
pub fn run() {
    println!("{}", env!("CARGO_PKG_VERSION"));
}
