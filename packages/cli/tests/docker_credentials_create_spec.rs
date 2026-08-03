use clap::Parser;
use cli::commands::docker_credentials_create::DockerCredentialsCreateArgs;
use cli::commands::docker_credentials_create::run;
use cli::utils::read_credentials;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: DockerCredentialsCreateArgs,
}

#[test]
fn docker_credentials_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--registry",
        "docker.io",
        "--username",
        "alice",
        "--token",
        "secret",
        "--silent",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.registry.as_deref(), Some("docker.io"));
    assert_eq!(cli.args.username.as_deref(), Some("alice"));
    assert_eq!(cli.args.token.as_deref(), Some("secret"));
    assert!(cli.args.silent);
}

#[test]
fn docker_credentials_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.registry.is_none());
    assert!(cli.args.username.is_none());
    assert!(cli.args.token.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn docker_credentials_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn docker_credentials_create_writes_a_credentials_profile_when_all_values_are_given() {
    let home = tempfile::tempdir().expect("tempdir");
    let previous = std::env::var_os("HOME");
    unsafe {
        std::env::set_var("HOME", home.path());
    }

    run(&DockerCredentialsCreateArgs {
        registry: Some("docker.io".to_string()),
        username: Some("alice".to_string()),
        token: Some("secret".to_string()),
        silent: true,
    });

    let credentials = read_credentials("docker.yml");

    match previous {
        Some(value) => unsafe {
            std::env::set_var("HOME", value);
        },
        None => unsafe {
            std::env::remove_var("HOME");
        },
    }

    assert_eq!(
        credentials,
        Some(vec![
            ("registry".to_string(), "docker.io".to_string()),
            ("username".to_string(), "alice".to_string()),
            ("token".to_string(), "secret".to_string()),
        ])
    );
}
