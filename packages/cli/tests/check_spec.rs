use clap::Parser;
use cli::commands::check::{CheckArgs, forwarded_args};
use cli::commands::workspace_check::OutputFormat;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: CheckArgs,
}

#[test]
fn check_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--packages",
        "core",
        "--modules",
        "user",
        "--logs",
        "--no-cache",
        "--threshold",
        "85",
        "--concurrency",
        "4",
        "--strict",
        "--output",
        "md",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.packages.as_deref(), Some("core"));
    assert_eq!(cli.args.modules.as_deref(), Some("user"));
    assert!(cli.args.logs);
    assert!(cli.args.no_cache);
    assert_eq!(cli.args.threshold, Some(85.0));
    assert_eq!(cli.args.concurrency, Some(4));
    assert!(cli.args.strict);
    assert_eq!(cli.args.output, Some(OutputFormat::Md));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn check_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.packages.is_none());
    assert!(cli.args.modules.is_none());
    assert!(!cli.args.logs);
    assert!(!cli.args.no_cache);
    assert!(cli.args.threshold.is_none());
    assert!(cli.args.concurrency.is_none());
    assert!(!cli.args.strict);
    assert!(cli.args.output.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn check_rejects_an_output_format_it_cannot_write() {
    assert!(TestCli::try_parse_from(["talos", "--output", "html"]).is_err());
}

#[test]
fn check_parses_the_json_output_format() {
    let cli = TestCli::try_parse_from(["talos", "--output", "json"]).expect("json is a format");

    assert_eq!(cli.args.output, Some(OutputFormat::Json));
}

#[test]
fn check_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn check_forwards_all_flags_to_workspace_check() {
    let args = CheckArgs {
        packages: Some("core".to_string()),
        modules: Some("user".to_string()),
        logs: true,
        no_cache: true,
        threshold: Some(85.0),
        concurrency: Some(4),
        strict: true,
        output: Some(OutputFormat::Json),
        cwd: Some("./here".to_string()),
    };

    let forwarded = forwarded_args(&args);

    assert_eq!(forwarded.packages.as_deref(), Some("core"));
    assert_eq!(forwarded.modules.as_deref(), Some("user"));
    assert!(forwarded.logs);
    assert!(forwarded.no_cache);
    assert_eq!(forwarded.threshold, Some(85.0));
    assert_eq!(forwarded.concurrency, Some(4));
    assert!(forwarded.strict);
    assert_eq!(forwarded.output, Some(OutputFormat::Json));
    assert_eq!(forwarded.cwd.as_deref(), Some("./here"));
}
