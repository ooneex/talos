//! `issue:push --provider=linear`, driven against a stub standing in for the
//! Linear API.
//!
//! The command talks to Linear over one GraphQL endpoint, so the stub routes on
//! the operation name inside the query and answers each one in turn — which is
//! what lets a spec assert on the whole create/update conversation.

mod support;

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use cli::commands::issue_push::push_issue;
use cli::utils::linear::LinearClient;
use support::http::{Reply, Request, Server};

fn scratch() -> tempfile::TempDir {
    tempfile::Builder::new()
        .prefix("talos-issue-push-")
        .tempdir_in(env!("CARGO_MANIFEST_DIR"))
        .expect("create temp dir")
}

/// Write `modules/user/issues/<id>.yml` and return the issues dir and the file.
fn issue_file(root: &Path, id: &str, body: &str) -> (PathBuf, PathBuf) {
    let issues = root.join("modules/user/issues");
    fs::create_dir_all(&issues).expect("create issues dir");
    let path = issues.join(format!("{id}.yml"));
    fs::write(&path, body).expect("write issue");
    (issues, path)
}

fn client(server: &Server) -> LinearClient {
    LinearClient::new("lin_api_test").with_endpoint(server.base())
}

/// The GraphQL operation a request carries, named by the first field the CLI
/// asks for.
fn operation(request: &Request) -> &'static str {
    let query = request.json()["query"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    for name in [
        "issueUpdate",
        "issueCreate",
        "issueLabelCreate",
        "commentCreate",
        "workflowStates",
        "issueLabels",
        "teams",
        "issue(",
    ] {
        if query.contains(name) {
            return match name {
                "issue(" => "issue",
                other => other,
            };
        }
    }
    "unknown"
}

/// A stub answering the whole conversation: the issue lookup returns
/// `existing`, and every mutation succeeds.
fn linear(existing: Value) -> Server {
    Server::start(move |request| {
        Reply::json(match operation(request) {
            "issue" => json!({ "data": { "issue": existing } }),
            "workflowStates" => json!({
                "data": { "workflowStates": { "nodes": [
                    { "id": "state-todo", "name": "Todo" },
                    { "id": "state-done", "name": "Done" },
                ] } }
            }),
            "issueLabels" => json!({
                "data": { "issueLabels": { "nodes": [{ "id": "label-api", "name": "api" }] } }
            }),
            "issueLabelCreate" => json!({
                "data": { "issueLabelCreate": { "issueLabel": { "id": "label-new" } } }
            }),
            "teams" => json!({
                "data": { "teams": { "nodes": [{ "id": "team-1", "name": "General", "key": "GEN" }] } }
            }),
            "issueCreate" => json!({
                "data": { "issueCreate": { "issue": { "id": "uuid-1", "identifier": "GEN-7" } } }
            }),
            "issueUpdate" => json!({ "data": { "issueUpdate": { "success": true } } }),
            "commentCreate" => json!({ "data": { "commentCreate": { "success": true } } }),
            _ => json!({ "data": {} }),
        })
    })
}

/// The variables of the first request carrying `operation`.
fn variables_of(server: &Server, wanted: &str) -> Value {
    server
        .requests()
        .iter()
        .find(|request| operation(request) == wanted)
        .map(|request| request.json()["variables"].clone())
        .unwrap_or(Value::Null)
}

// ---------------------------------------------------------------------------
// Updating an issue Linear already holds
// ---------------------------------------------------------------------------

#[test]
fn push_issue_updates_an_issue_linear_already_holds() {
    let dir = scratch();
    let (issues, path) = issue_file(
        dir.path(),
        "GEN-7",
        "id: \"GEN-7\"\ntitle: \"Add pagination\"\nstate: \"Todo\"\npriority: \"High\"\nlabels:\n  - api\ncontext: \"The list returns everything.\"\n",
    );
    let server = linear(json!({ "id": "uuid-1", "identifier": "GEN-7" }));

    assert!(push_issue(
        &client(&server),
        "user",
        &issues,
        &path,
        "GEN-7"
    ));

    let input = &variables_of(&server, "issueUpdate")["input"];
    assert_eq!(input["title"], "Add pagination");
    assert_eq!(input["priority"], 2);
    assert_eq!(input["stateId"], "state-todo");
    assert_eq!(input["labelIds"], json!(["label-api"]));
    assert!(
        input["description"]
            .as_str()
            .expect("a description")
            .contains("## Context")
    );
}

#[test]
fn push_issue_leaves_the_file_in_place_when_it_updates() {
    let dir = scratch();
    let (issues, path) = issue_file(dir.path(), "GEN-7", "id: \"GEN-7\"\ntitle: \"Keep\"\n");
    let server = linear(json!({ "id": "uuid-1", "identifier": "GEN-7" }));

    push_issue(&client(&server), "user", &issues, &path, "GEN-7");

    assert!(path.exists());
}

#[test]
fn push_issue_omits_fields_the_local_file_does_not_declare() {
    let dir = scratch();
    let (issues, path) = issue_file(dir.path(), "GEN-7", "id: \"GEN-7\"\n");
    let server = linear(json!({ "id": "uuid-1", "identifier": "GEN-7" }));

    push_issue(&client(&server), "user", &issues, &path, "GEN-7");

    let input = &variables_of(&server, "issueUpdate")["input"];
    assert!(input.get("title").is_none());
    assert!(input.get("priority").is_none());
    assert!(input.get("stateId").is_none());
}

#[test]
fn push_issue_fails_when_the_update_is_rejected() {
    let dir = scratch();
    let (issues, path) = issue_file(dir.path(), "GEN-7", "id: \"GEN-7\"\ntitle: \"Add\"\n");
    let server = Server::start(|request| match operation(request) {
        "issue" => Reply::json(json!({ "data": { "issue": { "id": "uuid-1" } } })),
        "issueUpdate" => Reply::json(json!({ "errors": [{ "message": "denied" }] })),
        _ => Reply::json(json!({ "data": {} })),
    });

    assert!(!push_issue(
        &client(&server),
        "user",
        &issues,
        &path,
        "GEN-7"
    ));
}

// ---------------------------------------------------------------------------
// Creating an issue Linear does not hold yet
// ---------------------------------------------------------------------------

#[test]
fn push_issue_creates_an_issue_linear_does_not_hold() {
    let dir = scratch();
    let (issues, path) = issue_file(
        dir.path(),
        "TMP-1",
        "title: \"Add pagination\"\nstate: \"Done\"\npriority: \"urgent\"\n",
    );
    let server = linear(Value::Null);

    assert!(push_issue(
        &client(&server),
        "user",
        &issues,
        &path,
        "TMP-1"
    ));

    let input = &variables_of(&server, "issueCreate")["input"];
    assert_eq!(input["teamId"], "team-1");
    assert_eq!(input["title"], "Add pagination");
    assert_eq!(input["priority"], 1);
    assert_eq!(input["stateId"], "state-done");
}

#[test]
fn push_issue_renames_the_file_to_the_identifier_linear_assigned() {
    let dir = scratch();
    let (issues, path) = issue_file(dir.path(), "TMP-1", "title: \"Add pagination\"\n");
    let server = linear(Value::Null);

    push_issue(&client(&server), "user", &issues, &path, "TMP-1");

    assert!(!path.exists(), "the temporary file is removed");
    let renamed = issues.join("GEN-7.yml");
    assert!(renamed.exists(), "the file is renamed to the identifier");
    assert!(
        fs::read_to_string(&renamed)
            .expect("read")
            .contains("GEN-7")
    );
}

#[test]
fn push_issue_refuses_to_create_an_issue_without_a_title() {
    let dir = scratch();
    let (issues, path) = issue_file(dir.path(), "TMP-1", "state: \"Todo\"\n");
    let server = linear(Value::Null);

    assert!(!push_issue(
        &client(&server),
        "user",
        &issues,
        &path,
        "TMP-1"
    ));
    assert!(
        server
            .requests()
            .iter()
            .all(|request| operation(request) != "issueCreate")
    );
}

#[test]
fn push_issue_fails_when_linear_holds_no_general_team() {
    let dir = scratch();
    let (issues, path) = issue_file(dir.path(), "TMP-1", "title: \"Add\"\n");
    let server = Server::start(|request| match operation(request) {
        "teams" => Reply::json(json!({ "data": { "teams": { "nodes": [] } } })),
        _ => Reply::json(json!({ "data": { "issue": null } })),
    });

    assert!(!push_issue(
        &client(&server),
        "user",
        &issues,
        &path,
        "TMP-1"
    ));
}

#[test]
fn push_issue_fails_when_the_create_is_rejected() {
    let dir = scratch();
    let (issues, path) = issue_file(dir.path(), "TMP-1", "title: \"Add\"\n");
    let server = Server::start(|request| match operation(request) {
        "teams" => Reply::json(json!({
            "data": { "teams": { "nodes": [{ "id": "team-1", "key": "General" }] } }
        })),
        "issueCreate" => Reply::json(json!({ "errors": [{ "message": "denied" }] })),
        _ => Reply::json(json!({ "data": { "issue": null } })),
    });

    assert!(!push_issue(
        &client(&server),
        "user",
        &issues,
        &path,
        "TMP-1"
    ));
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

#[test]
fn push_issue_creates_a_label_linear_does_not_have_yet() {
    let dir = scratch();
    let (issues, path) = issue_file(
        dir.path(),
        "GEN-7",
        "id: \"GEN-7\"\ntitle: \"Add\"\nlabels:\n  - api\n  - brand-new\n",
    );
    let server = linear(json!({ "id": "uuid-1", "identifier": "GEN-7" }));

    push_issue(&client(&server), "user", &issues, &path, "GEN-7");

    assert_eq!(
        variables_of(&server, "issueLabelCreate")["name"],
        "brand-new"
    );
    assert_eq!(
        variables_of(&server, "issueUpdate")["input"]["labelIds"],
        json!(["label-api", "label-new"])
    );
}

#[test]
fn push_issue_matches_an_existing_label_regardless_of_case() {
    let dir = scratch();
    let (issues, path) = issue_file(
        dir.path(),
        "GEN-7",
        "id: \"GEN-7\"\ntitle: \"Add\"\nlabels:\n  - API\n",
    );
    let server = linear(json!({ "id": "uuid-1", "identifier": "GEN-7" }));

    push_issue(&client(&server), "user", &issues, &path, "GEN-7");

    assert_eq!(
        variables_of(&server, "issueUpdate")["input"]["labelIds"],
        json!(["label-api"])
    );
    assert!(
        server
            .requests()
            .iter()
            .all(|request| operation(request) != "issueLabelCreate")
    );
}

#[test]
fn push_issue_asks_for_no_labels_when_the_file_declares_none() {
    let dir = scratch();
    let (issues, path) = issue_file(dir.path(), "GEN-7", "id: \"GEN-7\"\ntitle: \"Add\"\n");
    let server = linear(json!({ "id": "uuid-1", "identifier": "GEN-7" }));

    push_issue(&client(&server), "user", &issues, &path, "GEN-7");

    assert!(
        server
            .requests()
            .iter()
            .all(|request| operation(request) != "issueLabels")
    );
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

#[test]
fn push_issue_posts_only_the_comments_linear_does_not_hold() {
    let dir = scratch();
    let (issues, path) = issue_file(
        dir.path(),
        "GEN-7",
        "id: \"GEN-7\"\ntitle: \"Add\"\ncomments:\n  - message: \"already there\"\n  - message: \"brand new\"\n  - message: \"   \"\n",
    );
    let server = linear(json!({
        "id": "uuid-1",
        "identifier": "GEN-7",
        "comments": { "nodes": [{ "body": "already there" }] },
    }));

    push_issue(&client(&server), "user", &issues, &path, "GEN-7");

    let posted: Vec<String> = server
        .requests()
        .iter()
        .filter(|request| operation(request) == "commentCreate")
        .map(|request| {
            request.json()["variables"]["body"]
                .as_str()
                .unwrap_or_default()
                .to_string()
        })
        .collect();
    assert_eq!(posted, ["brand new"]);
}

#[test]
fn push_issue_posts_every_comment_of_a_freshly_created_issue() {
    let dir = scratch();
    let (issues, path) = issue_file(
        dir.path(),
        "TMP-1",
        "title: \"Add\"\ncomments:\n  - message: \"first\"\n  - message: \"second\"\n",
    );
    let server = linear(Value::Null);

    push_issue(&client(&server), "user", &issues, &path, "TMP-1");

    let posted = server
        .requests()
        .iter()
        .filter(|request| operation(request) == "commentCreate")
        .count();
    assert_eq!(posted, 2);
}

// ---------------------------------------------------------------------------
// Reading the local file
// ---------------------------------------------------------------------------

#[test]
fn push_issue_fails_when_the_local_file_cannot_be_read() {
    let dir = scratch();
    let issues = dir.path().join("modules/user/issues");
    fs::create_dir_all(&issues).expect("create issues dir");
    let server = linear(Value::Null);

    assert!(!push_issue(
        &client(&server),
        "user",
        &issues,
        &issues.join("missing.yml"),
        "GEN-7"
    ));
}

#[test]
fn push_issue_prefers_the_module_the_file_declares() {
    let dir = scratch();
    let (issues, path) = issue_file(
        dir.path(),
        "GEN-7",
        "id: \"GEN-7\"\nmodule: \"billing\"\ntitle: \"Add\"\n",
    );
    let server = linear(json!({ "id": "uuid-1", "identifier": "GEN-7" }));

    push_issue(&client(&server), "user", &issues, &path, "GEN-7");

    let description = variables_of(&server, "issueUpdate")["input"]["description"]
        .as_str()
        .expect("a description")
        .to_string();
    assert!(description.contains("**Module:** `billing`"));
}

#[test]
fn push_issue_treats_unreadable_yaml_as_an_empty_issue() {
    let dir = scratch();
    let (issues, path) = issue_file(dir.path(), "GEN-7", ":\n  not: [valid\n");
    let server = linear(Value::Null);

    // No title survives the parse, so it cannot be created.
    assert!(!push_issue(
        &client(&server),
        "user",
        &issues,
        &path,
        "GEN-7"
    ));
}
