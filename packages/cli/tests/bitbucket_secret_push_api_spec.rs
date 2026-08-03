//! Pushing a pipeline variable to Bitbucket: reading the repository out of the
//! git remote, and the create-or-replace conversation with the API, driven
//! against a stub.

mod support;

use std::sync::Mutex;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde_json::json;

use cli::commands::bitbucket_secret_push::{
    basic_auth_header, find_variable_uuid, parse_repository, push_variable,
};
use support::http::{Reply, Server};

// ---------------------------------------------------------------------------
// parse_repository
// ---------------------------------------------------------------------------

#[test]
fn parse_repository_reads_an_ssh_remote() {
    assert_eq!(
        parse_repository("git@bitbucket.org:acme/web.git"),
        Some(("acme".to_string(), "web".to_string()))
    );
    assert_eq!(
        parse_repository("ssh://git@bitbucket.org/acme/web.git"),
        Some(("acme".to_string(), "web".to_string()))
    );
}

#[test]
fn parse_repository_reads_an_https_remote_with_or_without_a_user() {
    assert_eq!(
        parse_repository("https://bitbucket.org/acme/web.git"),
        Some(("acme".to_string(), "web".to_string()))
    );
    assert_eq!(
        parse_repository("https://someone@bitbucket.org/acme/web"),
        Some(("acme".to_string(), "web".to_string()))
    );
}

#[test]
fn parse_repository_tolerates_a_trailing_slash_and_whitespace() {
    assert_eq!(
        parse_repository("  https://bitbucket.org/acme/web/  "),
        Some(("acme".to_string(), "web".to_string()))
    );
}

#[test]
fn parse_repository_rejects_a_remote_that_is_not_workspace_and_slug() {
    assert!(parse_repository("git@bitbucket.org:acme.git").is_none());
    assert!(parse_repository("https://bitbucket.org/acme/team/web").is_none());
    assert!(parse_repository("not-a-remote").is_none());
    assert!(parse_repository("").is_none());
}

// ---------------------------------------------------------------------------
// basic_auth_header
// ---------------------------------------------------------------------------

#[test]
fn basic_auth_header_encodes_the_credentials() {
    let header = basic_auth_header("ada", "hunter2");

    assert_eq!(header, format!("Basic {}", BASE64.encode("ada:hunter2")));
}

// ---------------------------------------------------------------------------
// push_variable — creating
// ---------------------------------------------------------------------------

fn base(server: &Server) -> String {
    server.url("/2.0/repositories/acme/web/pipelines_config/variables/")
}

#[test]
fn push_variable_creates_a_secured_variable() {
    let server = Server::start(|_| Reply::status(201, "{}"));

    let result = push_variable(&base(&server), "API_KEY", "shh", "ada", "hunter2");

    assert!(result.is_ok());
    let request = &server.requests()[0];
    assert_eq!(request.method, "POST");
    assert_eq!(request.json()["key"], "API_KEY");
    assert_eq!(request.json()["value"], "shh");
    assert_eq!(request.json()["secured"], true);
}

#[test]
fn push_variable_authenticates_with_basic_auth() {
    let server = Server::start(|_| Reply::status(201, "{}"));

    let _ = push_variable(&base(&server), "API_KEY", "shh", "ada", "hunter2");

    assert_eq!(
        server.requests()[0].header("Authorization"),
        Some(basic_auth_header("ada", "hunter2").as_str())
    );
}

#[test]
fn push_variable_accepts_a_plain_200_as_created() {
    let server = Server::start(|_| Reply::status(200, "{}"));

    assert!(push_variable(&base(&server), "API_KEY", "shh", "ada", "hunter2").is_ok());
}

// ---------------------------------------------------------------------------
// push_variable — replacing
// ---------------------------------------------------------------------------

#[test]
fn push_variable_replaces_the_variable_bitbucket_already_holds() {
    let server = Server::start(|request| match request.method.as_str() {
        "POST" => Reply::status(409, r#"{"error":"already exists"}"#),
        "GET" => Reply::json(json!({
            "values": [
                { "key": "OTHER", "uuid": "{other}" },
                { "key": "API_KEY", "uuid": "{abc-123}" },
            ]
        })),
        _ => Reply::status(200, "{}"),
    });

    let result = push_variable(&base(&server), "API_KEY", "shh", "ada", "hunter2");

    assert!(result.is_ok());
    let update = server
        .requests()
        .into_iter()
        .find(|request| request.method == "PUT")
        .expect("the variable is updated in place");
    assert!(
        update.path.ends_with("/variables/%7Babc-123%7D") || update.path.ends_with("{abc-123}")
    );
    assert_eq!(update.json()["value"], "shh");
}

#[test]
fn find_variable_uuid_walks_the_pages_until_it_finds_the_variable() {
    // The stub needs its own address to name the second page, so it is filled
    // in once the listener is up.
    let next: &'static Mutex<String> = Box::leak(Box::new(Mutex::new(String::new())));
    let server = Server::start(move |request| {
        if request.path.contains("page=2") {
            return Reply::json(json!({ "values": [{ "key": "API_KEY", "uuid": "{abc-123}" }] }));
        }
        Reply::json(json!({
            "values": [{ "key": "OTHER", "uuid": "{other}" }],
            "next": next.lock().expect("not poisoned").clone(),
        }))
    });
    *next.lock().expect("not poisoned") = format!("{}?page=2", base(&server));

    let uuid = find_variable_uuid(&base(&server), "API_KEY", "ada", "hunter2");

    assert_eq!(uuid.as_deref(), Some("{abc-123}"));
    assert_eq!(server.requests().len(), 2, "both pages are fetched");
}

#[test]
fn push_variable_fails_when_the_conflicting_variable_cannot_be_found() {
    let server = Server::start(|request| match request.method.as_str() {
        "POST" => Reply::status(409, r#"{"error":"already exists"}"#),
        _ => Reply::json(json!({ "values": [] })),
    });

    let result = push_variable(&base(&server), "API_KEY", "shh", "ada", "hunter2");

    assert_eq!(result.unwrap_err(), r#"{"error":"already exists"}"#);
}

#[test]
fn push_variable_fails_when_the_replacement_is_rejected() {
    let server = Server::start(|request| match request.method.as_str() {
        "POST" => Reply::status(409, "conflict"),
        "GET" => Reply::json(json!({ "values": [{ "key": "API_KEY", "uuid": "{abc}" }] })),
        _ => Reply::status(403, "denied"),
    });

    assert_eq!(
        push_variable(&base(&server), "API_KEY", "shh", "ada", "hunter2").unwrap_err(),
        "conflict"
    );
}

// ---------------------------------------------------------------------------
// push_variable — failing
// ---------------------------------------------------------------------------

#[test]
fn push_variable_reports_the_body_bitbucket_refused_with() {
    let server = Server::start(|_| Reply::status(401, r#"{"error":"bad token"}"#));

    assert_eq!(
        push_variable(&base(&server), "API_KEY", "shh", "ada", "nope").unwrap_err(),
        r#"{"error":"bad token"}"#
    );
}

#[test]
fn push_variable_reports_a_transport_failure() {
    let result = push_variable(
        "http://127.0.0.1:1/2.0/repositories/acme/web/pipelines_config/variables/",
        "API_KEY",
        "shh",
        "ada",
        "hunter2",
    );

    assert_eq!(result.unwrap_err(), "curl failed");
}

// ---------------------------------------------------------------------------
// find_variable_uuid
// ---------------------------------------------------------------------------

#[test]
fn find_variable_uuid_asks_for_a_full_page() {
    let server = Server::always(json!({ "values": [{ "key": "API_KEY", "uuid": "{abc}" }] }));

    let uuid = find_variable_uuid(&base(&server), "API_KEY", "ada", "hunter2");

    assert_eq!(uuid.as_deref(), Some("{abc}"));
    assert!(server.requests()[0].path.contains("pagelen=100"));
}

#[test]
fn find_variable_uuid_is_none_when_the_listing_runs_out() {
    let server = Server::always(json!({ "values": [{ "key": "OTHER", "uuid": "{other}" }] }));

    assert!(find_variable_uuid(&base(&server), "API_KEY", "ada", "hunter2").is_none());
}

#[test]
fn find_variable_uuid_is_none_when_bitbucket_cannot_be_reached() {
    assert!(find_variable_uuid("http://127.0.0.1:1/", "API_KEY", "ada", "hunter2").is_none());
}
