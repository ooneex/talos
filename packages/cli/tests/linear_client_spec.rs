//! The Linear GraphQL client, driven against a stub standing in for the API.

mod support;

use serde_json::json;
use std::sync::Mutex;

use cli::utils::linear::LinearClient;
use support::http::{Reply, Server};

fn client(server: &Server) -> LinearClient {
    LinearClient::new("lin_api_test").with_endpoint(server.base())
}

static HOME_GUARD: Mutex<()> = Mutex::new(());

fn with_temp_home<T>(test: impl FnOnce() -> T) -> T {
    let _guard = HOME_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let original_home = std::env::var_os("HOME");
    let tmp = tempfile::tempdir().expect("tempdir");
    unsafe {
        std::env::set_var("HOME", tmp.path());
    }

    let outcome = test();

    unsafe {
        match original_home {
            Some(home) => std::env::set_var("HOME", home),
            None => std::env::remove_var("HOME"),
        }
    }

    outcome
}

// ---------------------------------------------------------------------------
// request
// ---------------------------------------------------------------------------

#[test]
fn request_posts_the_query_and_variables_as_graphql() {
    let server = Server::always(json!({ "data": { "ok": true } }));

    client(&server).request("query { viewer { id } }", json!({ "id": "ABC-1" }));

    let sent = server.requests();
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].method, "POST");
    assert_eq!(sent[0].json()["query"], "query { viewer { id } }");
    assert_eq!(sent[0].json()["variables"]["id"], "ABC-1");
}

#[test]
fn request_authorises_with_the_token() {
    let server = Server::always(json!({ "data": {} }));

    client(&server).request("query { viewer { id } }", json!({}));

    assert_eq!(
        server.requests()[0].header("Authorization"),
        Some("lin_api_test")
    );
    assert_eq!(
        server.requests()[0].header("Content-Type"),
        Some("application/json")
    );
}

#[test]
fn request_returns_the_data_payload() {
    let server = Server::always(json!({ "data": { "viewer": { "id": "u1" } } }));

    let data = client(&server).request("query { viewer { id } }", json!({}));

    assert_eq!(data, Some(json!({ "viewer": { "id": "u1" } })));
}

#[test]
fn request_returns_none_when_the_response_carries_graphql_errors() {
    let server = Server::always(json!({
        "data": { "viewer": null },
        "errors": [{ "message": "Not authorised" }],
    }));

    assert!(
        client(&server)
            .request("query { viewer { id } }", json!({}))
            .is_none()
    );
}

#[test]
fn request_returns_none_when_the_response_holds_no_data() {
    let server = Server::always(json!({ "extensions": {} }));

    assert!(
        client(&server)
            .request("query { viewer { id } }", json!({}))
            .is_none()
    );
}

#[test]
fn request_returns_none_on_a_transport_failure() {
    let client = LinearClient::new("lin_api_test").with_endpoint("http://127.0.0.1:1");

    assert!(
        client
            .request("query { viewer { id } }", json!({}))
            .is_none()
    );
}

#[test]
fn request_returns_none_when_the_body_is_not_json() {
    let server = Server::start(|_| Reply::status(200, "<html>gateway</html>"));

    assert!(
        client(&server)
            .request("query { viewer { id } }", json!({}))
            .is_none()
    );
}

// ---------------------------------------------------------------------------
// get_issue
// ---------------------------------------------------------------------------

fn issue_payload() -> serde_json::Value {
    json!({
        "data": {
            "issue": {
                "identifier": "ABC-1",
                "title": "Add pagination",
                "description": "The list returns everything at once.",
                "priority": 2,
                "state": { "name": "In Progress" },
                "labels": { "nodes": [{ "name": "api" }, { "name": "perf" }] },
                "comments": {
                    "nodes": [
                        { "body": "Started on this", "user": { "name": "Ada" } },
                        { "body": "No author here" },
                    ]
                },
            }
        }
    })
}

#[test]
fn get_issue_maps_every_field_it_asked_for() {
    let server = Server::always(issue_payload());

    let issue = client(&server)
        .get_issue("ABC-1")
        .expect("issue is returned");

    assert_eq!(issue.identifier.as_deref(), Some("ABC-1"));
    assert_eq!(issue.title.as_deref(), Some("Add pagination"));
    assert_eq!(
        issue.description.as_deref(),
        Some("The list returns everything at once.")
    );
    assert_eq!(issue.priority.as_deref(), Some("High"));
    assert_eq!(issue.state.as_deref(), Some("In Progress"));
    assert_eq!(issue.labels, ["api", "perf"]);
}

#[test]
fn get_issue_keeps_a_comment_without_an_author() {
    let server = Server::always(issue_payload());

    let issue = client(&server)
        .get_issue("ABC-1")
        .expect("issue is returned");

    assert_eq!(issue.comments.len(), 2);
    assert_eq!(issue.comments[0].author.as_deref(), Some("Ada"));
    assert_eq!(issue.comments[0].body, "Started on this");
    assert_eq!(issue.comments[1].author, None);
}

#[test]
fn get_issue_sends_the_id_as_a_variable() {
    let server = Server::always(issue_payload());

    client(&server).get_issue("ABC-1");

    assert_eq!(server.requests()[0].json()["variables"]["id"], "ABC-1");
}

#[test]
fn get_issue_defaults_absent_collections_to_empty() {
    let server = Server::always(json!({ "data": { "issue": { "identifier": "ABC-2" } } }));

    let issue = client(&server)
        .get_issue("ABC-2")
        .expect("issue is returned");

    assert_eq!(issue.identifier.as_deref(), Some("ABC-2"));
    assert!(issue.labels.is_empty());
    assert!(issue.comments.is_empty());
    assert_eq!(issue.priority, None);
    assert_eq!(issue.state, None);
}

#[test]
fn get_issue_drops_a_comment_that_carries_no_body() {
    let server = Server::always(json!({
        "data": { "issue": { "comments": { "nodes": [{ "user": { "name": "Ada" } }] } } }
    }));

    let issue = client(&server)
        .get_issue("ABC-3")
        .expect("issue is returned");

    assert!(issue.comments.is_empty());
}

#[test]
fn get_issue_is_none_when_linear_holds_no_such_issue() {
    let server = Server::always(json!({ "data": { "issue": null } }));

    assert!(client(&server).get_issue("ABC-404").is_none());
}

#[test]
fn get_issue_is_none_when_the_request_fails() {
    let server = Server::always(json!({ "errors": [{ "message": "boom" }] }));

    assert!(client(&server).get_issue("ABC-1").is_none());
}

#[test]
fn from_credentials_reads_the_linear_token() {
    with_temp_home(|| {
        let credentials_dir = std::path::PathBuf::from(std::env::var("HOME").expect("HOME"))
            .join(".talos/credentials");
        std::fs::create_dir_all(&credentials_dir).expect("credentials dir");
        std::fs::write(
            credentials_dir.join("linear.yml"),
            "profiles:\n  default:\n    token: lin_api_saved\n",
        )
        .expect("credentials file");

        let server = Server::always(json!({ "data": { "viewer": { "id": "u1" } } }));
        let client = LinearClient::from_credentials()
            .expect("client should be created")
            .with_endpoint(server.base());

        let data = client.request("query { viewer { id } }", json!({}));
        assert_eq!(data, Some(json!({ "viewer": { "id": "u1" } })));
        assert_eq!(
            server.requests()[0].header("Authorization"),
            Some("lin_api_saved")
        );
    });
}

#[test]
fn from_credentials_returns_none_without_a_token() {
    with_temp_home(|| {
        let credentials_dir = std::path::PathBuf::from(std::env::var("HOME").expect("HOME"))
            .join(".talos/credentials");
        std::fs::create_dir_all(&credentials_dir).expect("credentials dir");
        std::fs::write(
            credentials_dir.join("linear.yml"),
            "profiles:\n  default:\n    email: ada@example.test\n",
        )
        .expect("credentials file");

        assert!(LinearClient::from_credentials().is_none());
    });
}
