use clap::Parser;
use rust_cli::commands::controller_create::ControllerCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: ControllerCreateArgs,
}

#[test]
fn controller_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talosrs",
        "--name",
        "MyController",
        "--module",
        "user",
        "--is-socket",
        "true",
        "--override",
        "--route.name",
        "users",
        "--route.path",
        "/users",
        "--route.method",
        "POST",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyController"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert_eq!(cli.args.is_socket, Some(true));
    assert!(cli.args.r#override);
    assert_eq!(cli.args.route_name.as_deref(), Some("users"));
    assert_eq!(cli.args.route_path.as_deref(), Some("/users"));
    assert_eq!(cli.args.route_method.as_deref(), Some("POST"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn controller_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talosrs"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(cli.args.is_socket.is_none());
    assert!(!cli.args.r#override);
    assert!(cli.args.route_name.is_none());
    assert!(cli.args.route_path.is_none());
    assert!(cli.args.route_method.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn controller_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talosrs", "--definitely-not-a-flag"]).is_err());
}
