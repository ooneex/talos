//! The registry and tarball helpers behind `npm:publish` — the "is it already
//! published?" lookup, the tgz cleanup, and unpacking a packed tarball.

mod support;

use std::fs;
use std::io::Write;
use std::path::Path;

use flate2::Compression;
use flate2::write::GzEncoder;

use cli::commands::npm_publish::{
    extract_tarball_stripping_root, percent_encode, remove_tgz_files, version_exists,
};
use support::http::{Reply, Server};

fn scratch() -> tempfile::TempDir {
    tempfile::Builder::new()
        .prefix("talos-npm-publish-")
        .tempdir_in(env!("CARGO_MANIFEST_DIR"))
        .expect("create temp dir")
}

// ---------------------------------------------------------------------------
// version_exists
// ---------------------------------------------------------------------------

#[test]
fn version_exists_is_true_when_the_registry_answers_200() {
    let server = Server::start(|_| Reply::status(200, "{}"));

    assert!(version_exists(
        "@talosjs/app",
        "1.2.3",
        "npm_token",
        Some(server.base())
    ));
}

#[test]
fn version_exists_is_false_when_the_registry_has_no_such_version() {
    let server = Server::start(|_| Reply::status(404, "{}"));

    assert!(!version_exists(
        "@talosjs/app",
        "9.9.9",
        "npm_token",
        Some(server.base())
    ));
}

#[test]
fn version_exists_percent_encodes_the_scoped_name() {
    let server = Server::start(|_| Reply::status(200, "{}"));

    version_exists("@talosjs/app", "1.2.3", "npm_token", Some(server.base()));

    assert_eq!(server.requests()[0].path, "/%40talosjs%2Fapp/1.2.3");
}

#[test]
fn version_exists_sends_the_token_as_a_bearer() {
    let server = Server::start(|_| Reply::status(200, "{}"));

    version_exists("left-pad", "1.0.0", "npm_token", Some(server.base()));

    assert_eq!(
        server.requests()[0].header("Authorization"),
        Some("Bearer npm_token")
    );
}

#[test]
fn version_exists_is_false_when_the_registry_cannot_be_reached() {
    assert!(!version_exists(
        "left-pad",
        "1.0.0",
        "npm_token",
        Some("http://127.0.0.1:1")
    ));
}

#[test]
fn percent_encode_keeps_unreserved_characters() {
    assert_eq!(percent_encode("left-pad"), "left-pad");
    assert_eq!(percent_encode("@talosjs/app"), "%40talosjs%2Fapp");
    assert_eq!(percent_encode("1.2.3"), "1.2.3");
}

// ---------------------------------------------------------------------------
// remove_tgz_files
// ---------------------------------------------------------------------------

#[test]
fn remove_tgz_files_deletes_only_the_tarballs() {
    let dir = scratch();
    fs::write(dir.path().join("pkg-1.0.0.tgz"), "x").expect("write");
    fs::write(dir.path().join("other-2.0.0.tgz"), "x").expect("write");
    fs::write(dir.path().join("package.json"), "{}").expect("write");

    remove_tgz_files(dir.path());

    assert!(!dir.path().join("pkg-1.0.0.tgz").exists());
    assert!(!dir.path().join("other-2.0.0.tgz").exists());
    assert!(dir.path().join("package.json").exists());
}

#[test]
fn remove_tgz_files_ignores_a_directory_that_is_not_there() {
    let dir = scratch();

    remove_tgz_files(&dir.path().join("nope"));
}

// ---------------------------------------------------------------------------
// extract_tarball_stripping_root
// ---------------------------------------------------------------------------

/// Pack `files` under a single wrapping directory, the way `npm pack` does.
fn pack(path: &Path, root: &str, files: &[(&str, &str)]) {
    let tarball = fs::File::create(path).expect("create tarball");
    let mut builder = tar::Builder::new(GzEncoder::new(tarball, Compression::default()));

    for (name, content) in files {
        let mut header = tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, format!("{root}/{name}"), content.as_bytes())
            .expect("append file");
    }

    builder
        .into_inner()
        .expect("finish tar")
        .finish()
        .expect("finish gzip")
        .flush()
        .expect("flush");
}

#[test]
fn extract_tarball_drops_the_wrapping_directory() {
    let dir = scratch();
    let tarball = dir.path().join("pkg-1.0.0.tgz");
    pack(
        &tarball,
        "package",
        &[
            ("package.json", r#"{"name":"pkg"}"#),
            ("dist/index.js", "export {}"),
        ],
    );
    let destination = dir.path().join("out");

    extract_tarball_stripping_root(&tarball, &destination).expect("extract");

    assert_eq!(
        fs::read_to_string(destination.join("package.json")).expect("read"),
        r#"{"name":"pkg"}"#
    );
    assert_eq!(
        fs::read_to_string(destination.join("dist/index.js")).expect("read"),
        "export {}"
    );
    assert!(
        !destination.join("package").exists(),
        "the wrapping directory is not kept"
    );
}

#[test]
fn extract_tarball_fails_on_a_tarball_that_is_not_there() {
    let dir = scratch();

    let result = extract_tarball_stripping_root(&dir.path().join("nope.tgz"), dir.path());

    assert!(result.is_err());
}

#[test]
fn extract_tarball_fails_on_a_file_that_is_not_a_tarball() {
    let dir = scratch();
    let tarball = dir.path().join("pkg.tgz");
    fs::write(&tarball, "definitely not gzip").expect("write");

    assert!(extract_tarball_stripping_root(&tarball, &dir.path().join("out")).is_err());
}
