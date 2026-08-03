//! The whole `security:check` audit, driven against a stub standing in for
//! OSV.dev — the batch query that says which packages are affected, and the
//! advisory records that describe how.

mod support;

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::json;

use cli::commands::security_check::audit_at;
use support::http::{Reply, Server};

fn scratch() -> tempfile::TempDir {
    tempfile::Builder::new()
        .prefix("talos-security-")
        .tempdir_in(env!("CARGO_MANIFEST_DIR"))
        .expect("create temp dir")
}

fn write(path: &Path, content: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create parent directory");
    }
    fs::write(path, content).expect("write file");
}

/// A workspace with one module whose lockfile pins a single npm package.
fn workspace() -> (tempfile::TempDir, PathBuf) {
    let dir = scratch();
    let root = dir.path().to_path_buf();
    write(
        &root.join("modules/user/package.json"),
        r#"{ "name": "user" }"#,
    );
    write(
        &root.join("modules/user/package-lock.json"),
        r#"{
  "lockfileVersion": 3,
  "packages": {
    "node_modules/left-pad": { "version": "1.0.0" }
  }
}
"#,
    );
    (dir, root)
}

/// An OSV stub: the batch query reports `ids` against the only package, and
/// every advisory lookup answers with `record`.
fn osv(ids: Vec<&'static str>, record: serde_json::Value) -> Server {
    Server::start(move |request| {
        if request.path.contains("querybatch") {
            let queries = request.json()["queries"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            let results: Vec<serde_json::Value> = queries
                .iter()
                .map(|_| json!({ "vulns": ids.iter().map(|id| json!({ "id": id })).collect::<Vec<_>>() }))
                .collect();
            return Reply::json(json!({ "results": results }));
        }
        Reply::json(record.clone())
    })
}

fn advisory(severity_score: &str) -> serde_json::Value {
    json!({
        "id": "GHSA-xxxx",
        "summary": "left-pad pads too far",
        "severity": [{ "type": "CVSS_V3", "score": severity_score }],
        "affected": [{
            "package": { "name": "left-pad", "ecosystem": "npm" },
            "ranges": [{
                "type": "SEMVER",
                "events": [{ "introduced": "0" }, { "fixed": "1.0.1" }],
            }],
        }],
    })
}

// ---------------------------------------------------------------------------
// Reaching OSV
// ---------------------------------------------------------------------------

#[test]
fn audit_queries_osv_with_every_pinned_package() {
    let (_dir, root) = workspace();
    let server = osv(vec![], json!({}));

    audit_at(&root, None, None, None, Some(server.base())).expect("the audit runs");

    let batch = server
        .requests()
        .into_iter()
        .find(|request| request.path.contains("querybatch"))
        .expect("the batch query is sent");
    let query = &batch.json()["queries"][0];
    assert_eq!(query["package"]["name"], "left-pad");
    assert_eq!(query["package"]["ecosystem"], "npm");
    assert_eq!(query["version"], "1.0.0");
}

#[test]
fn audit_reports_a_clean_workspace_with_no_findings() {
    let (_dir, root) = workspace();
    let server = osv(vec![], json!({}));

    let result = audit_at(&root, None, None, None, Some(server.base())).expect("the audit runs");

    assert!(result.findings.is_empty());
    assert_eq!(result.modules, 1);
    assert_eq!(result.dependencies, 1);
}

#[test]
fn audit_fails_when_osv_cannot_be_reached() {
    let (_dir, root) = workspace();

    let result = audit_at(&root, None, None, None, Some("http://127.0.0.1:1"));

    assert!(result.is_err());
    assert!(result.unwrap_err().contains("Could not reach OSV.dev"));
}

#[test]
fn audit_reports_no_lockfile_with_an_empty_error() {
    let dir = scratch();
    let server = osv(vec![], json!({}));

    let result = audit_at(dir.path(), None, None, None, Some(server.base()));

    // An empty message is how the caller tells "nothing to audit" apart from a
    // real failure.
    assert_eq!(result.unwrap_err(), "");
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

#[test]
fn audit_turns_an_advisory_into_a_finding() {
    let (_dir, root) = workspace();
    let server = osv(
        vec!["GHSA-xxxx"],
        advisory("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"),
    );

    let result = audit_at(&root, None, None, None, Some(server.base())).expect("the audit runs");

    assert_eq!(result.findings.len(), 1);
    let finding = &result.findings[0];
    assert_eq!(finding.subject, "left-pad");
    assert_eq!(finding.version, "1.0.0");
    assert_eq!(finding.id, "GHSA-xxxx");
    assert_eq!(finding.severity, "CRITICAL");
    assert_eq!(finding.title, "left-pad pads too far");
    assert_eq!(finding.url, "https://osv.dev/vulnerability/GHSA-xxxx");
    assert_eq!(finding.remediation, "1.0.1");
    assert_eq!(finding.module, "user");
}

#[test]
fn audit_fetches_each_advisory_record_by_id() {
    let (_dir, root) = workspace();
    let server = osv(
        vec!["GHSA-xxxx"],
        advisory("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"),
    );

    audit_at(&root, None, None, None, Some(server.base())).expect("the audit runs");

    assert!(
        server
            .requests()
            .iter()
            .any(|request| request.path.ends_with("/v1/vulns/GHSA-xxxx"))
    );
}

#[test]
fn audit_counts_every_severity_it_found() {
    let (_dir, root) = workspace();
    let server = osv(
        vec!["GHSA-xxxx"],
        advisory("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"),
    );

    let result = audit_at(&root, None, None, None, Some(server.base())).expect("the audit runs");

    assert_eq!(result.count("CRITICAL"), 1);
    assert_eq!(result.count("HIGH"), 0);
}

#[test]
fn audit_drops_findings_below_the_requested_level() {
    let (_dir, root) = workspace();
    let server = osv(
        vec!["GHSA-xxxx"],
        advisory("CVSS:3.1/AV:N/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N"),
    );

    let result =
        audit_at(&root, None, None, Some("critical"), Some(server.base())).expect("the audit runs");

    assert!(result.findings.is_empty());
}

#[test]
fn audit_reports_an_advisory_whose_record_never_arrived() {
    let (_dir, root) = workspace();
    let server = Server::start(|request| {
        if request.path.contains("querybatch") {
            return Reply::json(json!({ "results": [{ "vulns": [{ "id": "GHSA-yyyy" }] }] }));
        }
        Reply::status(404, "{}")
    });

    let result = audit_at(&root, None, None, None, Some(server.base())).expect("the audit runs");

    assert_eq!(result.findings.len(), 1);
    assert_eq!(result.findings[0].id, "GHSA-yyyy");
    assert_eq!(result.findings[0].severity, "UNKNOWN");
}

// ---------------------------------------------------------------------------
// Scoping
// ---------------------------------------------------------------------------

#[test]
fn audit_restricts_itself_to_the_modules_it_was_given() {
    let (_dir, root) = workspace();
    write(
        &root.join("modules/web/package-lock.json"),
        r#"{ "lockfileVersion": 3, "packages": { "node_modules/react": { "version": "18.0.0" } } }"#,
    );
    let server = osv(vec![], json!({}));

    let result =
        audit_at(&root, Some("user"), None, None, Some(server.base())).expect("the audit runs");

    assert_eq!(result.modules, 1);
    assert_eq!(result.dependencies, 1);
}

#[test]
fn audit_reports_nothing_to_do_when_the_filter_matches_no_module() {
    let (_dir, root) = workspace();
    let server = osv(vec![], json!({}));

    let result = audit_at(&root, Some("nope"), None, None, Some(server.base()));

    assert_eq!(result.unwrap_err(), "");
}

#[test]
fn audit_queries_a_shared_package_once() {
    let (_dir, root) = workspace();
    write(
        &root.join("modules/web/package-lock.json"),
        r#"{ "lockfileVersion": 3, "packages": { "node_modules/left-pad": { "version": "1.0.0" } } }"#,
    );
    let server = osv(vec![], json!({}));

    let result = audit_at(&root, None, None, None, Some(server.base())).expect("the audit runs");

    let batch = server
        .requests()
        .into_iter()
        .find(|request| request.path.contains("querybatch"))
        .expect("the batch query is sent");
    assert_eq!(
        batch.json()["queries"].as_array().expect("queries").len(),
        1,
        "the same package is queried once across modules"
    );
    assert_eq!(result.dependencies, 2, "but it is still counted per module");
}
