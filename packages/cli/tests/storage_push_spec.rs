//! `storage:push` — what it uploads, where it addresses it, and how it signs.
//!
//! The signing is checked against the example AWS publishes for Signature
//! Version 4; the wire behaviour against a stub HTTP server standing in for an
//! R2 endpoint, so no bucket is ever touched.

use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::mpsc::{Sender, channel};
use std::thread;

use cli::commands::storage_push::{archive_name, collect_files, collect_uploads, zip_archive};
use cli::utils::storage::{
    StorageProvider, authorization_header, bunny_host, canonical_query, content_type, host_of,
    join_key, normalize_prefix, resolve_remote, sha256_hex, signing_key, split_bucket, tags,
    uri_encode,
};

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("a parent")).expect("create parent");
    fs::write(path, content).expect("write file");
}

fn profile(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
    pairs
        .iter()
        .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
        .collect()
}

// ---------------------------------------------------------------------------
// Keys and paths
// ---------------------------------------------------------------------------

#[test]
fn a_destination_keeps_only_its_inner_path() {
    assert_eq!(normalize_prefix("/assets/img/"), "assets/img");
    assert_eq!(normalize_prefix("  "), "");
    assert_eq!(join_key("/assets/", "app.css"), "assets/app.css");
    assert_eq!(join_key("", "app.css"), "app.css");
}

#[test]
fn an_r2_destination_gives_up_its_first_segment_as_the_bucket() {
    assert_eq!(
        split_bucket("/my-bucket/assets/img/"),
        Some(("my-bucket".to_string(), "assets/img".to_string()))
    );
    assert_eq!(
        split_bucket("my-bucket"),
        Some(("my-bucket".to_string(), String::new()))
    );
    assert_eq!(split_bucket("///"), None);
}

#[test]
fn a_bunny_region_picks_its_host_and_the_default_one_stays_bare() {
    assert_eq!(bunny_host("de"), "storage.bunnycdn.com");
    assert_eq!(bunny_host(""), "storage.bunnycdn.com");
    assert_eq!(bunny_host("NY"), "ny.storage.bunnycdn.com");
}

#[test]
fn a_host_header_is_the_authority_of_an_endpoint_port_included() {
    assert_eq!(
        host_of("https://acc.r2.cloudflarestorage.com/"),
        "acc.r2.cloudflarestorage.com"
    );
    assert_eq!(host_of("http://127.0.0.1:8080"), "127.0.0.1:8080");
}

#[test]
fn a_key_is_encoded_per_segment_and_the_separators_survive() {
    assert_eq!(uri_encode("assets/app.css", false), "assets/app.css");
    assert_eq!(uri_encode("a b/c+d", false), "a%20b/c%2Bd");
    assert_eq!(uri_encode("a/b", true), "a%2Fb");
}

#[test]
fn a_content_type_follows_the_extension_and_falls_back_to_bytes() {
    assert_eq!(content_type("assets/app.css"), "text/css");
    assert_eq!(content_type("index.HTML"), "text/html");
    assert_eq!(content_type("bundle.zip"), "application/zip");
    assert_eq!(content_type("LICENSE"), "application/octet-stream");
}

// ---------------------------------------------------------------------------
// Remotes
// ---------------------------------------------------------------------------

#[test]
fn an_s3_profile_addresses_its_bucket_as_a_virtual_host() {
    let (remote, prefix) = resolve_remote(
        StorageProvider::S3,
        &profile(&[
            ("accessKey", "AKIA"),
            ("secretKey", "secret"),
            ("bucket", "media"),
            ("region", "eu-west-3"),
        ]),
        "/assets/",
    )
    .expect("the profile is complete");

    assert_eq!(prefix, "assets");
    let debug = format!("{remote:?}");
    assert!(
        debug.contains("https://media.s3.eu-west-3.amazonaws.com"),
        "{debug}"
    );
    assert!(
        debug.contains("path_prefix: \"\""),
        "a virtual-hosted bucket is not repeated in the path: {debug}"
    );
}

#[test]
fn an_r2_profile_takes_its_bucket_from_the_destination_and_signs_against_auto() {
    let (remote, prefix) = resolve_remote(
        StorageProvider::Cloudflare,
        &profile(&[
            ("accessKey", "key"),
            ("secretKey", "secret"),
            ("endpoint", "https://acc.r2.cloudflarestorage.com/"),
            ("region", "EEUR"),
        ]),
        "my-bucket/assets",
    )
    .expect("the profile is complete");

    assert_eq!(prefix, "assets");
    let debug = format!("{remote:?}");
    assert!(debug.contains("path_prefix: \"/my-bucket\""), "{debug}");
    assert!(
        debug.contains("region: \"auto\""),
        "R2 signs against `auto`, not the jurisdiction the profile stores: {debug}"
    );
}

#[test]
fn an_r2_destination_without_a_bucket_is_rejected() {
    let error = resolve_remote(
        StorageProvider::Cloudflare,
        &profile(&[
            ("accessKey", "key"),
            ("secretKey", "secret"),
            ("endpoint", "https://acc.r2.cloudflarestorage.com"),
        ]),
        "/",
    )
    .expect_err("no bucket can be read");

    assert!(error.contains("bucket"), "{error}");
}

#[test]
fn a_profile_missing_a_field_says_which_one() {
    let error = resolve_remote(
        StorageProvider::Bunny,
        &profile(&[("storageZone", "zone")]),
        "assets",
    )
    .expect_err("the access key is missing");

    assert!(error.contains("accessKey"), "{error}");
}

// ---------------------------------------------------------------------------
// What a --from path expands to
// ---------------------------------------------------------------------------

fn tree() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().join("dist");
    write(&root.join("index.html"), "<h1>hi</h1>");
    write(&root.join("assets/app.css"), "body{}");
    write(&root.join("assets/img/logo.svg"), "<svg/>");
    (dir, root)
}

#[test]
fn a_folder_expands_to_every_file_under_it_keyed_by_its_relative_path() {
    let (_dir, root) = tree();

    let keys: Vec<String> = collect_uploads(&root, "site", false)
        .expect("the folder is readable")
        .into_iter()
        .map(|upload| upload.key)
        .collect();

    assert_eq!(
        keys,
        vec![
            "site/assets/app.css".to_string(),
            "site/assets/img/logo.svg".to_string(),
            "site/index.html".to_string(),
        ]
    );
}

#[test]
fn a_single_file_lands_under_the_destination_by_its_own_name() {
    let (_dir, root) = tree();

    let uploads =
        collect_uploads(&root.join("index.html"), "/site/", false).expect("the file is readable");

    assert_eq!(uploads.len(), 1);
    assert_eq!(uploads[0].key, "site/index.html");
}

#[test]
fn zipping_sends_one_archive_named_after_the_source() {
    let (_dir, root) = tree();

    let uploads = collect_uploads(&root, "site", true).expect("the folder is readable");

    assert_eq!(uploads.len(), 1);
    assert_eq!(uploads[0].key, "site/dist.zip");
    let body = uploads[0].body.as_ref().expect("the archive is in memory");
    assert_eq!(&body[..2], b"PK", "{:?}", &body[..4]);

    let mut archive =
        zip::ZipArchive::new(std::io::Cursor::new(body.clone())).expect("a readable archive");
    let names: Vec<String> = archive.file_names().map(str::to_string).collect();
    assert!(
        names.contains(&"assets/img/logo.svg".to_string()),
        "{names:?}"
    );
    let mut entry = archive.by_name("index.html").expect("the entry is there");
    let mut content = String::new();
    entry.read_to_string(&mut content).expect("read the entry");
    assert_eq!(content, "<h1>hi</h1>");
}

#[test]
fn a_zipped_file_keeps_its_own_name_inside_the_archive() {
    let (_dir, root) = tree();
    let file = root.join("index.html");

    assert_eq!(archive_name(&file).expect("a name"), "index.html.zip");
    let archive = zip::ZipArchive::new(std::io::Cursor::new(
        zip_archive(&file).expect("an archive"),
    ))
    .expect("a readable archive");
    let names: Vec<String> = archive.file_names().map(str::to_string).collect();
    assert_eq!(names, vec!["index.html".to_string()]);
}

#[test]
fn walking_a_folder_is_ordered_so_two_runs_push_the_same_list() {
    let (_dir, root) = tree();

    let first: Vec<String> = collect_files(&root)
        .expect("readable")
        .into_iter()
        .map(|(_, key)| key)
        .collect();
    let second: Vec<String> = collect_files(&root)
        .expect("readable")
        .into_iter()
        .map(|(_, key)| key)
        .collect();

    assert_eq!(first, second);
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

#[test]
fn the_signing_key_matches_the_example_aws_publishes() {
    let key = signing_key(
        "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
        "20120215",
        "us-east-1",
        "iam",
    );

    let hex: String = key.iter().map(|byte| format!("{byte:02x}")).collect();
    assert_eq!(
        hex,
        "f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d"
    );
}

#[test]
fn an_empty_payload_hashes_to_the_value_s3_expects() {
    assert_eq!(
        sha256_hex(b""),
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
}

/// The same signature, varying one part at a time.
fn sign(method: &str, uri: &str, query: &str) -> String {
    authorization_header(
        method,
        concat!("AKIAIOSFOD", "NN7EXAMPLE"),
        "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
        "us-east-1",
        "examplebucket.s3.us-east-1.amazonaws.com",
        uri,
        query,
        &sha256_hex(b"hello"),
        "20130524T000000Z",
        "20130524",
    )
}

#[test]
fn the_authorization_header_names_the_scope_and_the_headers_it_covers() {
    let header = sign("PUT", "/test.txt", "");

    assert!(header.starts_with("AWS4-HMAC-SHA256 "), "{header}");
    assert!(
        header.contains(&format!(
            "Credential={}/20130524/us-east-1/s3/aws4_request",
            concat!("AKIAIOSFOD", "NN7EXAMPLE")
        )),
        "{header}"
    );
    assert!(
        header.contains("SignedHeaders=host;x-amz-content-sha256;x-amz-date"),
        "{header}"
    );
}

#[test]
fn the_signature_covers_the_method_the_path_and_the_query() {
    let header = sign("PUT", "/test.txt", "");

    assert_ne!(header, sign("GET", "/test.txt", ""), "the method is signed");
    assert_ne!(header, sign("PUT", "/other.txt", ""), "the path is signed");
    assert_ne!(
        header,
        sign("PUT", "/test.txt", "list-type=2"),
        "the query is signed"
    );
}

#[test]
fn a_query_is_signed_sorted_and_encoded() {
    assert_eq!(
        canonical_query(&[
            ("prefix".to_string(), "assets/img/".to_string()),
            ("list-type".to_string(), "2".to_string()),
        ]),
        "list-type=2&prefix=assets%2Fimg%2F"
    );
    assert_eq!(canonical_query(&[]), "");
}

#[test]
fn a_listing_response_gives_up_its_keys_with_the_entities_decoded() {
    let xml = "<ListBucketResult><IsTruncated>false</IsTruncated>\
        <Contents><Key>site/index.html</Key><Size>11</Size></Contents>\
        <Contents><Key>site/a&amp;b.css</Key></Contents></ListBucketResult>";

    assert_eq!(
        tags(xml, "Key"),
        vec!["site/index.html".to_string(), "site/a&b.css".to_string()]
    );
    assert_eq!(tags(xml, "IsTruncated"), vec!["false".to_string()]);
    assert!(tags(xml, "NextContinuationToken").is_empty());
}

// ---------------------------------------------------------------------------
// The command, against a stub endpoint
// ---------------------------------------------------------------------------

/// What the stub server saw for one request.
struct Received {
    line: String,
    headers: Vec<String>,
    body: String,
}

/// An HTTP server that answers `200` to anything and reports what it got.
fn stub_server(sender: Sender<Received>, status: &'static str) -> (String, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind a port");
    let endpoint = format!("http://{}", listener.local_addr().expect("an address"));
    let handle = thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            if !serve(stream, &sender, status) {
                break;
            }
        }
    });

    (endpoint, handle)
}

fn serve(mut stream: TcpStream, sender: &Sender<Received>, status: &'static str) -> bool {
    let mut reader = BufReader::new(stream.try_clone().expect("clone the stream"));
    let mut line = String::new();
    if reader.read_line(&mut line).unwrap_or(0) == 0 {
        return true;
    }
    let mut headers = Vec::new();
    let mut length = 0usize;
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).unwrap_or(0) == 0 {
            break;
        }
        let header = header.trim_end().to_string();
        if header.is_empty() {
            break;
        }
        if let Some((name, value)) = header.split_once(": ")
            && name.eq_ignore_ascii_case("content-length")
        {
            length = value.trim().parse().unwrap_or(0);
        }
        headers.push(header);
    }
    let mut body = vec![0; length];
    let _ = reader.read_exact(&mut body);

    let _ = stream.write_all(
        format!("HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").as_bytes(),
    );
    let _ = stream.flush();

    let stop = line.starts_with("GET /stop");
    let _ = sender.send(Received {
        line: line.trim_end().to_string(),
        headers,
        body: String::from_utf8_lossy(&body).to_string(),
    });

    !stop
}

fn talos(root: &Path, home: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .arg(format!("--cwd={}", root.display()))
        .env("HOME", home)
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .output()
        .expect("the talos binary should run")
}

fn text(output: &Output) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

/// A scratch `HOME` holding an R2 profile pointed at `endpoint`.
fn home_with_r2(endpoint: &str) -> tempfile::TempDir {
    let home = tempfile::tempdir().expect("create temp home");
    let output = Command::new(env!("CARGO_BIN_EXE_talos"))
        .args([
            "credentials:create",
            "--provider=cloudflare",
            "--access-key=key",
            "--secret-key=secret",
            "--region=auto",
            "--silent",
        ])
        .arg(format!("--endpoint={endpoint}"))
        .env("HOME", home.path())
        .stdin(Stdio::null())
        .output()
        .expect("the talos binary should run");
    assert!(output.status.success(), "{}", text(&output));

    home
}

#[test]
fn a_push_signs_every_object_and_addresses_it_under_the_bucket() {
    let (_dir, root) = tree();
    let (sender, receiver) = channel();
    let (endpoint, handle) = stub_server(sender, "200 OK");
    let home = home_with_r2(&endpoint);

    let output = talos(
        &root,
        home.path(),
        &[
            "storage:push",
            "--provider=cloudflare",
            "--from=.",
            "--destination=my-bucket/site",
            "--silent",
        ],
    );

    assert!(output.status.success(), "{}", text(&output));
    let mut seen = Vec::new();
    for _ in 0..3 {
        let received = receiver
            .recv_timeout(std::time::Duration::from_secs(10))
            .expect("the stub server saw a request");
        assert!(
            received.headers.iter().any(|header| header
                .starts_with("authorization: AWS4-HMAC-SHA256 ")
                || header.starts_with("Authorization: AWS4-HMAC-SHA256 ")),
            "{:?}",
            received.headers
        );
        if received.line.contains("index.html") {
            assert_eq!(received.body, "<h1>hi</h1>");
        }
        seen.push(received.line);
    }
    seen.sort();

    assert_eq!(
        seen,
        vec![
            "PUT /my-bucket/site/assets/app.css HTTP/1.1".to_string(),
            "PUT /my-bucket/site/assets/img/logo.svg HTTP/1.1".to_string(),
            "PUT /my-bucket/site/index.html HTTP/1.1".to_string(),
        ]
    );

    let _ = ureq::get(format!("{endpoint}/stop")).call();
    let _ = handle.join();
}

#[test]
fn zipping_sends_a_single_archive_instead_of_the_files() {
    let (_dir, root) = tree();
    let (sender, receiver) = channel();
    let (endpoint, handle) = stub_server(sender, "200 OK");
    let home = home_with_r2(&endpoint);

    let output = talos(
        &root,
        home.path(),
        &[
            "storage:push",
            "--provider=cloudflare",
            "--from=.",
            "--destination=my-bucket/releases",
            "--zip",
            "--silent",
        ],
    );

    assert!(output.status.success(), "{}", text(&output));
    let received = receiver
        .recv_timeout(std::time::Duration::from_secs(10))
        .expect("the stub server saw a request");
    assert_eq!(received.line, "PUT /my-bucket/releases/dist.zip HTTP/1.1");
    assert!(received.body.starts_with("PK"), "the body is a zip");
    assert!(
        received
            .headers
            .iter()
            .any(|header| header.to_lowercase() == "content-type: application/zip"),
        "{:?}",
        received.headers
    );

    let _ = ureq::get(format!("{endpoint}/stop")).call();
    let _ = handle.join();
}

#[test]
fn a_rejected_object_fails_the_run_and_says_what_came_back() {
    let (_dir, root) = tree();
    let (sender, receiver) = channel();
    let (endpoint, handle) = stub_server(sender, "403 Forbidden");
    let home = home_with_r2(&endpoint);

    let output = talos(
        &root,
        home.path(),
        &[
            "storage:push",
            "--provider=cloudflare",
            "--from=index.html",
            "--destination=my-bucket/site",
        ],
    );

    assert!(!output.status.success(), "{}", text(&output));
    assert!(text(&output).contains("403"), "{}", text(&output));
    let _ = receiver.recv_timeout(std::time::Duration::from_secs(10));

    let _ = ureq::get(format!("{endpoint}/stop")).call();
    let _ = handle.join();
}

#[test]
fn pushing_without_a_stored_profile_says_which_command_creates_one() {
    let (_dir, root) = tree();
    let home = tempfile::tempdir().expect("create temp home");

    let output = talos(
        &root,
        home.path(),
        &[
            "storage:push",
            "--provider=bunny",
            "--from=.",
            "--destination=assets",
        ],
    );

    assert!(!output.status.success());
    assert!(
        text(&output).contains("credentials:create --provider=bunny"),
        "{}",
        text(&output)
    );
}

#[test]
fn pushing_a_path_that_is_not_there_stops_before_reading_the_profile() {
    let (_dir, root) = tree();
    let home = tempfile::tempdir().expect("create temp home");

    let output = talos(
        &root,
        home.path(),
        &[
            "storage:push",
            "--provider=s3",
            "--from=nowhere",
            "--destination=assets",
        ],
    );

    assert!(!output.status.success());
    assert!(text(&output).contains("No such file"), "{}", text(&output));
}
