use clap::Parser;
use rust_cli::commands::middleware_create::MiddlewareCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: MiddlewareCreateArgs,
}

#[test]
fn middleware_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs",
        "--name",
        "Auth",
        "--module",
        "user",
        "--override",
        "--is-socket",
        "true",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("Auth"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert!(cli.args.r#override);
    assert_eq!(cli.args.is_socket, Some(true));
}

#[test]
fn middleware_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(!cli.args.r#override);
    assert!(cli.args.is_socket.is_none());
}

#[test]
fn middleware_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
