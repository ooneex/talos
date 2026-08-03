use clap::Parser;
use cli::commands::npm_credentials_create::NpmCredentialsCreateArgs;
use cli::commands::npm_credentials_create::run;
use cli::utils::read_credentials;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: NpmCredentialsCreateArgs,
}

#[test]
fn npm_credentials_create_parses_all_flags() {
    let cli = TestCli::try_parse_from(["talos", "--token", "secret", "--silent"])
        .expect("valid arguments should parse");

    assert_eq!(cli.args.token.as_deref(), Some("secret"));
    assert!(cli.args.silent);
}

#[test]
fn npm_credentials_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.token.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn npm_credentials_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn npm_credentials_create_writes_a_credentials_profile_when_the_token_is_given() {
    let home = tempfile::tempdir().expect("tempdir");
    let previous = std::env::var_os("HOME");
    unsafe {
        std::env::set_var("HOME", home.path());
    }

    run(&NpmCredentialsCreateArgs {
        token: Some("secret".to_string()),
        silent: true,
    });

    let credentials = read_credentials("npm.yml");

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
        Some(vec![("token".to_string(), "secret".to_string())])
    );
}
