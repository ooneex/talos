use clap::Parser;
use rust_cli::commands::version::VersionArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: VersionArgs,
}

#[test]
fn version_parses_with_no_arguments() {
    assert!(TestCli::try_parse_from(["talosrs"]).is_ok());
}

#[test]
fn version_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn version_run_does_not_panic() {
    rust_cli::commands::version::run(&VersionArgs {});
}
