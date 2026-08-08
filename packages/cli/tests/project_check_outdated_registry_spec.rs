//! The registry half of the `outdated` check: where each registry is read
//! from, what it collects out of the manifests, and the report it builds from
//! the answers. The lookups run against a stub, so no spec touches the network.

mod support;

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::json;

use cli::commands::project_check::CheckStatus;
use cli::commands::project_check::modules::discover_modules;
use cli::commands::project_check::outdated::{Dependency, Registry, collect, fetch_latest, report};
use support::http::{Reply, Server};

fn scratch() -> tempfile::TempDir {
    tempfile::Builder::new()
        .prefix("talos-outdated-")
        .tempdir_in(env!("CARGO_MANIFEST_DIR"))
        .expect("create temp dir")
}

fn write(path: &Path, content: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create parent directory");
    }
    fs::write(path, content).expect("write file");
}

fn dependency(name: &str, registry: Registry, declared: &str, owners: &[&str]) -> Dependency {
    Dependency {
        name: name.to_string(),
        registry,
        declared: declared.to_string(),
        owners: owners.iter().map(|owner| owner.to_string()).collect(),
    }
}

fn answers(
    entries: &[(&Dependency, Option<&str>)],
) -> BTreeMap<(Registry, String), Option<String>> {
    entries
        .iter()
        .map(|(dependency, latest)| {
            (
                (dependency.registry, dependency.name.clone()),
                latest.map(str::to_string),
            )
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

#[test]
fn registry_labels_itself_by_its_public_name() {
    assert_eq!(Registry::Npm.label(), "npm");
}

#[test]
fn registry_points_at_the_public_host_by_default() {
    assert_eq!(
        Registry::Npm.url("left-pad"),
        "https://registry.npmjs.org/left-pad/latest"
    );
}

#[test]
fn registry_keeps_its_path_when_pointed_at_another_host() {
    assert_eq!(
        Registry::Npm.url_at("http://mirror.test/", "left-pad"),
        "http://mirror.test/left-pad/latest"
    );
}

#[test]
fn registry_reads_the_latest_version_out_of_its_own_response_shape() {
    assert_eq!(
        Registry::Npm
            .latest(&json!({ "version": "3.1.0" }))
            .as_deref(),
        Some("3.1.0")
    );
}

#[test]
fn registry_reads_no_version_out_of_an_unexpected_response() {
    assert!(
        Registry::Npm
            .latest(&json!({ "error": "Not found" }))
            .is_none()
    );
}

// ---------------------------------------------------------------------------
// fetch_latest
// ---------------------------------------------------------------------------

fn agent() -> ureq::Agent {
    ureq::Agent::new_with_defaults()
}

#[test]
fn fetch_latest_reads_the_version_the_registry_publishes() {
    let server = Server::always(json!({ "version": "3.1.0" }));
    let dependency = dependency("left-pad", Registry::Npm, "1.0.0", &["root"]);

    let latest = fetch_latest(&agent(), &dependency, Some(server.base()));

    assert_eq!(latest.as_deref(), Some("3.1.0"));
}

#[test]
fn fetch_latest_asks_the_path_the_registry_expects() {
    let server = Server::always(json!({ "version": "1.0.2" }));
    let dependency = dependency("left-pad", Registry::Npm, "0.9.0", &["root"]);

    fetch_latest(&agent(), &dependency, Some(server.base()));

    assert_eq!(server.requests()[0].path, "/left-pad/latest");
}

#[test]
fn fetch_latest_identifies_itself_to_the_registry() {
    let server = Server::always(json!({ "version": "1.0.2" }));
    let dependency = dependency("left-pad", Registry::Npm, "0.9.0", &["root"]);

    fetch_latest(&agent(), &dependency, Some(server.base()));

    assert_eq!(
        server.requests()[0].header("User-Agent"),
        Some("talos-cli (project:check)")
    );
}

#[test]
fn fetch_latest_is_none_when_the_registry_answers_with_an_error() {
    let server = Server::start(|_| Reply::status(404, "{}"));
    let dependency = dependency("gone", Registry::Npm, "1.0.0", &["root"]);

    assert!(fetch_latest(&agent(), &dependency, Some(server.base())).is_none());
}

#[test]
fn fetch_latest_is_none_when_the_registry_cannot_be_reached() {
    let dependency = dependency("left-pad", Registry::Npm, "1.0.0", &["root"]);

    assert!(fetch_latest(&agent(), &dependency, Some("http://127.0.0.1:1")).is_none());
}

// ---------------------------------------------------------------------------
// collect
// ---------------------------------------------------------------------------

fn workspace() -> (tempfile::TempDir, PathBuf) {
    let dir = scratch();
    let root = dir.path().to_path_buf();
    write(
        &root.join("package.json"),
        r#"{ "dependencies": { "react": "^19.0.0" }, "devDependencies": { "typescript": "~5.4.0" } }"#,
    );
    (dir, root)
}

#[test]
fn collect_merges_npm_dependencies_from_the_root_and_the_modules() {
    let (_dir, root) = workspace();
    write(&root.join("modules/user/user.yml"), "name: \"user\"\n");
    write(
        &root.join("modules/user/package.json"),
        r#"{ "dependencies": { "react": "^18.2.0" } }"#,
    );

    let found = collect(&discover_modules(&root), &root);
    let react = found
        .iter()
        .find(|dependency| dependency.name == "react")
        .expect("react is collected");

    // The oldest floor in the workspace is the one holding an upgrade back.
    assert_eq!(react.declared, "18.2.0");
    assert_eq!(
        react.owners,
        BTreeSet::from(["root".to_string(), "modules/user".to_string()])
    );
}

#[test]
fn collect_reads_dev_dependencies_too() {
    let (_dir, root) = workspace();

    let found = collect(&discover_modules(&root), &root);

    assert!(
        found
            .iter()
            .any(|dependency| dependency.name == "typescript")
    );
}

#[test]
fn collect_skips_a_range_that_pins_nothing() {
    let (_dir, root) = workspace();
    write(&root.join("modules/user/user.yml"), "name: \"user\"\n");
    write(
        &root.join("modules/user/package.json"),
        r#"{ "dependencies": { "@talosjs/app": "workspace:^", "left-pad": "*" } }"#,
    );

    let found = collect(&discover_modules(&root), &root);

    assert!(
        found
            .iter()
            .all(|dependency| dependency.name != "@talosjs/app")
    );
    assert!(found.iter().all(|dependency| dependency.name != "left-pad"));
}

#[test]
fn collect_ignores_a_manifest_entry_that_is_not_a_range() {
    let (_dir, root) = workspace();
    write(&root.join("modules/user/user.yml"), "name: \"user\"\n");
    write(
        &root.join("modules/user/package.json"),
        r#"{ "dependencies": { "weird": { "version": "1.0.0" } } }"#,
    );

    let found = collect(&discover_modules(&root), &root);

    assert!(found.iter().all(|dependency| dependency.name != "weird"));
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

#[test]
fn report_skips_when_no_registry_could_be_reached() {
    let left_pad = dependency("left-pad", Registry::Npm, "1.0.0", &["root"]);
    let outcome = report(
        std::slice::from_ref(&left_pad),
        &answers(&[(&left_pad, None)]),
    );

    assert_eq!(outcome.status, CheckStatus::Skipped);
    assert_eq!(outcome.summary, "the registries could not be reached");
}

#[test]
fn report_passes_when_every_dependency_is_on_a_current_major() {
    let react = dependency("react", Registry::Npm, "19.0.0", &["root"]);
    let outcome = report(
        std::slice::from_ref(&react),
        &answers(&[(&react, Some("19.2.0"))]),
    );

    assert_eq!(outcome.status, CheckStatus::Passed);
    assert!(outcome.summary.starts_with("1 dependency · 1 behind"));
}

#[test]
fn report_stays_quiet_about_a_minor_or_patch_behind() {
    let react = dependency("react", Registry::Npm, "19.0.0", &["root"]);
    let outcome = report(
        std::slice::from_ref(&react),
        &answers(&[(&react, Some("19.2.0"))]),
    );

    assert!(outcome.details.is_empty());
}

#[test]
fn report_warns_about_a_dependency_a_major_behind() {
    let react = dependency("react", Registry::Npm, "17.0.0", &["root", "modules/web"]);
    let outcome = report(
        std::slice::from_ref(&react),
        &answers(&[(&react, Some("19.2.0"))]),
    );

    assert_eq!(outcome.status, CheckStatus::Warned);
    assert_eq!(outcome.details.len(), 1);
    assert!(outcome.details[0].contains("2 major versions behind"));
    assert!(outcome.details[0].contains("modules/web, root"));
}

#[test]
fn report_counts_one_major_in_the_singular() {
    let react = dependency("react", Registry::Npm, "18.0.0", &["root"]);
    let outcome = report(
        std::slice::from_ref(&react),
        &answers(&[(&react, Some("19.0.0"))]),
    );

    assert!(outcome.details[0].contains("1 major version behind"));
}

#[test]
fn report_fails_when_a_dependency_left_the_registry() {
    let gone = dependency("gone", Registry::Npm, "1.0.0", &["root"]);
    let react = dependency("react", Registry::Npm, "19.0.0", &["root"]);
    let outcome = report(
        &[gone.clone(), react.clone()],
        &answers(&[(&gone, None), (&react, Some("19.0.0"))]),
    );

    assert_eq!(outcome.status, CheckStatus::Failed);
    assert!(outcome.details[0].contains("is not published on npm any more"));
}

#[test]
fn report_ignores_a_dependency_the_lookup_never_covered() {
    let react = dependency("react", Registry::Npm, "17.0.0", &["root"]);
    let typescript = dependency("typescript", Registry::Npm, "5.0.0", &["root"]);
    // Only react was looked up; typescript carries no answer either way.
    let outcome = report(
        &[react.clone(), typescript],
        &answers(&[(&react, Some("19.0.0"))]),
    );

    assert_eq!(outcome.details.len(), 1);
    assert!(outcome.summary.starts_with("2 dependencies"));
}
