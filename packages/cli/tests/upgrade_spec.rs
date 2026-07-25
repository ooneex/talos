use clap::Parser;
use cli::commands::upgrade::{UpgradeArgs, parse_version_from_tag};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: UpgradeArgs,
}

#[test]
fn upgrade_parses_all_flags() {
    let cli = TestCli::try_parse_from(["talos", "--cwd", "./here"])
        .expect("valid arguments should parse");

    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn upgrade_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.cwd.is_none());
}

#[test]
fn upgrade_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn parses_scoped_package_release_tag() {
    assert_eq!(parse_version_from_tag("@talosjs/cli@1.2.3"), "1.2.3");
}

#[test]
fn parses_v_prefixed_and_plain_tags() {
    assert_eq!(parse_version_from_tag("v0.4.0"), "0.4.0");
    assert_eq!(parse_version_from_tag("0.4.0"), "0.4.0");
}
