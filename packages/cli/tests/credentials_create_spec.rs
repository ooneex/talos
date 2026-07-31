use clap::Parser;
use cli::commands::credentials_create::{CredentialsCreateArgs, CredentialsProvider, PROVIDERS};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: CredentialsCreateArgs,
}

#[test]
fn credentials_create_parses_provider_and_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--provider=jira",
        "--base-url",
        "https://acme.atlassian.net",
        "--email",
        "dev@acme.com",
        "--token",
        "secret",
        "--silent",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.provider, Some(CredentialsProvider::Jira));
    assert_eq!(
        cli.args.base_url.as_deref(),
        Some("https://acme.atlassian.net")
    );
    assert_eq!(cli.args.email.as_deref(), Some("dev@acme.com"));
    assert_eq!(cli.args.token.as_deref(), Some("secret"));
    assert!(cli.args.silent);
}

#[test]
fn credentials_create_parses_every_provider() {
    for provider in PROVIDERS {
        let flag = format!("--provider={}", provider.slug());
        let cli =
            TestCli::try_parse_from(["talos", &flag]).expect("every provider slug should parse");

        assert_eq!(cli.args.provider, Some(*provider));
    }
}

#[test]
fn credentials_create_accepts_twitter_as_an_alias_for_x() {
    let cli = TestCli::try_parse_from(["talos", "--provider=twitter"])
        .expect("twitter should alias to x");

    assert_eq!(cli.args.provider, Some(CredentialsProvider::X));
}

#[test]
fn credentials_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.provider.is_none());
    assert!(cli.args.token.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn credentials_create_rejects_unknown_provider() {
    assert!(TestCli::try_parse_from(["talos", "--provider=myspace"]).is_err());
}

#[test]
fn credentials_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn every_provider_has_a_unique_slug_and_a_hint() {
    let mut slugs: Vec<&str> = PROVIDERS.iter().map(|provider| provider.slug()).collect();
    slugs.sort_unstable();
    let count = slugs.len();
    slugs.dedup();

    assert_eq!(slugs.len(), count);
    assert!(
        PROVIDERS
            .iter()
            .all(|provider| provider.hint().contains("https://"))
    );
}
