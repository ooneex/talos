use std::sync::{Mutex, MutexGuard};

use clap::Parser;
use cli::commands::credentials_create::{
    CredentialsCreateArgs, CredentialsProvider, PROVIDERS, run,
};
use cli::utils::read_credentials;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: CredentialsCreateArgs,
}

/// `HOME` decides where the profile is written, and it is process-wide — two
/// tests pointing it at their own temp dir at once would read each other's.
static HOME: Mutex<()> = Mutex::new(());

/// Run `body` against a `HOME` of its own, restoring the real one after.
fn with_home<T>(body: impl FnOnce() -> T) -> T {
    let _guard: MutexGuard<'_, ()> = HOME.lock().unwrap_or_else(|error| error.into_inner());
    let home = tempfile::tempdir().expect("tempdir");
    let previous = std::env::var_os("HOME");
    unsafe {
        std::env::set_var("HOME", home.path());
    }

    let outcome = body();

    match previous {
        Some(value) => unsafe {
            std::env::set_var("HOME", value);
        },
        None => unsafe {
            std::env::remove_var("HOME");
        },
    }
    outcome
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

#[test]
fn every_provider_has_a_non_empty_label() {
    assert!(
        PROVIDERS
            .iter()
            .all(|provider| !provider.label().is_empty())
    );
}

#[test]
fn credentials_create_writes_a_profile_when_the_jira_flags_are_given() {
    let credentials = with_home(|| {
        let cli = TestCli::try_parse_from([
            "talos",
            "--provider=jira",
            "--base-url=https://acme.atlassian.net",
            "--email=dev@acme.com",
            "--token=secret",
            "--silent",
        ])
        .expect("valid arguments should parse");
        run(&cli.args);
        read_credentials("jira.yml")
    });

    assert_eq!(
        credentials,
        Some(vec![
            (
                "baseUrl".to_string(),
                "https://acme.atlassian.net".to_string(),
            ),
            ("email".to_string(), "dev@acme.com".to_string()),
            ("token".to_string(), "secret".to_string()),
        ])
    );
}

#[test]
fn credentials_create_takes_the_linear_key_under_the_name_linear_gives_it() {
    // Linear calls it a Personal API key everywhere in its own UI, so
    // `--api-key` is the flag a reader of the hint reaches for. Before it was
    // an alias, clap accepted the value, the field stayed empty, and the
    // command prompted for a key that had already been typed on the line.
    let credentials = with_home(|| {
        let cli = TestCli::try_parse_from([
            "talos",
            "--provider=linear",
            "--api-key=lin_api_xxx",
            "--silent",
        ])
        .expect("valid arguments should parse");
        run(&cli.args);
        read_credentials("linear.yml")
    });

    assert_eq!(
        credentials,
        Some(vec![("token".to_string(), "lin_api_xxx".to_string())])
    );
}

#[test]
fn credentials_create_still_takes_the_linear_key_under_its_own_name() {
    let credentials = with_home(|| {
        let cli = TestCli::try_parse_from([
            "talos",
            "--provider=linear",
            "--token=lin_api_xxx",
            "--silent",
        ])
        .expect("valid arguments should parse");
        run(&cli.args);
        read_credentials("linear.yml")
    });

    assert_eq!(
        credentials,
        Some(vec![("token".to_string(), "lin_api_xxx".to_string())])
    );
}

#[test]
fn credentials_create_prefers_the_field_name_over_its_alias() {
    let credentials = with_home(|| {
        let cli = TestCli::try_parse_from([
            "talos",
            "--provider=openrouter",
            "--api-key=own",
            "--token=alias",
            "--silent",
        ])
        .expect("valid arguments should parse");
        run(&cli.args);
        read_credentials("openrouter.yml")
    });

    assert_eq!(
        credentials,
        Some(vec![("apiKey".to_string(), "own".to_string())])
    );
}
