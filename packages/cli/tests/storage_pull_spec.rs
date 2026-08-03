//! `storage:pull` — which keys land where locally, and what the run refuses to
//! write.
//!
//! The wire behaviour runs against a stub HTTP server standing in for an R2
//! endpoint: it answers the `ListObjectsV2` call with a canned listing and each
//! `GET` with the object body, so no bucket is ever touched.

use std::fs;
use std::io::{BufRead, BufReader, Cursor, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::mpsc::{Sender, channel};
use std::thread;

use cli::commands::storage_pull::{local_path, relative_key, strip_zip_extension, unzip_into};

// ---------------------------------------------------------------------------
// Keys to paths
// ---------------------------------------------------------------------------

#[test]
fn a_key_keeps_the_path_it_has_under_the_prefix() {
    assert_eq!(
        relative_key("site", "site/assets/app.css"),
        "assets/app.css"
    );
    assert_eq!(relative_key("/site/", "site/index.html"), "index.html");
    assert_eq!(relative_key("", "index.html"), "index.html");
}

#[test]
fn a_key_that_is_the_prefix_itself_keeps_only_its_name() {
    // `--from my-bucket/assets/app.css` names one object, not a folder.
    assert_eq!(relative_key("assets/app.css", "assets/app.css"), "app.css");
}

#[test]
fn a_key_lands_under_the_destination_folder() {
    let root = Path::new("/tmp/out");

    assert_eq!(
        local_path(root, "site", "site/assets/app.css"),
        Some(PathBuf::from("/tmp/out/assets/app.css"))
    );
    assert_eq!(
        local_path(root, "site", "site/index.html"),
        Some(PathBuf::from("/tmp/out/index.html"))
    );
}

#[test]
fn a_key_that_would_climb_out_of_the_destination_is_refused() {
    let root = Path::new("/tmp/out");

    assert_eq!(local_path(root, "site", "site/../../etc/passwd"), None);
    assert_eq!(local_path(root, "site", "site/a/../../../b"), None);
    assert_eq!(
        local_path(root, "site", "site/"),
        None,
        "a folder marker names no file"
    );
    // A key that looks absolute is still a key: it lands inside the
    // destination rather than at the root of the disk.
    assert_eq!(
        local_path(root, "", "/etc/passwd"),
        Some(PathBuf::from("/tmp/out/etc/passwd"))
    );
}

#[test]
fn an_archive_unpacks_into_a_folder_named_after_it() {
    assert_eq!(
        strip_zip_extension(Path::new("/tmp/out/dist.zip")),
        PathBuf::from("/tmp/out/dist")
    );
    assert_eq!(
        strip_zip_extension(Path::new("/tmp/out/nested/site.zip")),
        PathBuf::from("/tmp/out/nested/site")
    );
}

// ---------------------------------------------------------------------------
// Unzipping
// ---------------------------------------------------------------------------

fn archive(entries: &[(&str, &str)]) -> Vec<u8> {
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (name, content) in entries {
        writer
            .start_file(*name, zip::write::SimpleFileOptions::default())
            .expect("start the entry");
        writer
            .write_all(content.as_bytes())
            .expect("write the entry");
    }

    writer.finish().expect("finish the archive").into_inner()
}

#[test]
fn an_archive_is_written_out_entry_by_entry() {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().join("dist");

    unzip_into(
        &root,
        &archive(&[("index.html", "<h1>hi</h1>"), ("assets/app.css", "body{}")]),
    )
    .expect("the archive unpacks");

    assert_eq!(
        fs::read_to_string(root.join("index.html")).expect("the entry was written"),
        "<h1>hi</h1>"
    );
    assert_eq!(
        fs::read_to_string(root.join("assets/app.css")).expect("the nested entry was written"),
        "body{}"
    );
}

#[test]
fn an_entry_pointing_outside_the_folder_is_dropped_and_the_rest_still_lands() {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().join("dist");

    unzip_into(
        &root,
        &archive(&[("../escaped.txt", "nope"), ("kept.txt", "yes")]),
    )
    .expect("the archive unpacks");

    assert!(
        !dir.path().join("escaped.txt").exists(),
        "a zip-slip entry is never written"
    );
    assert_eq!(
        fs::read_to_string(root.join("kept.txt")).expect("the safe entry was written"),
        "yes"
    );
}

// ---------------------------------------------------------------------------
// The command, against a stub endpoint
// ---------------------------------------------------------------------------

/// What the stub server was asked for.
struct Received {
    line: String,
}

/// A bucket the stub server serves: key -> body.
type Objects = Vec<(String, Vec<u8>)>;

/// An HTTP server answering `ListObjectsV2` with a canned listing and every
/// other `GET` with the matching object.
fn stub_server(objects: Objects, sender: Sender<Received>) -> (String, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind a port");
    let endpoint = format!("http://{}", listener.local_addr().expect("an address"));
    let handle = thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            if !serve(stream, &objects, &sender) {
                break;
            }
        }
    });

    (endpoint, handle)
}

fn serve(mut stream: TcpStream, objects: &Objects, sender: &Sender<Received>) -> bool {
    let mut reader = BufReader::new(stream.try_clone().expect("clone the stream"));
    let mut line = String::new();
    if reader.read_line(&mut line).unwrap_or(0) == 0 {
        return true;
    }
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).unwrap_or(0) == 0 || header.trim_end().is_empty() {
            break;
        }
    }

    let target = line.split_whitespace().nth(1).unwrap_or("").to_string();
    let (status, body) = respond(&target, objects);
    let _ = stream.write_all(
        format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .as_bytes(),
    );
    let _ = stream.write_all(&body);
    let _ = stream.flush();

    let stop = target.starts_with("/stop");
    let _ = sender.send(Received {
        line: line.trim_end().to_string(),
    });

    !stop
}

fn respond(target: &str, objects: &Objects) -> (&'static str, Vec<u8>) {
    if target.contains("list-type=2") {
        // Filter by `prefix=`, the way a real bucket does.
        let prefix = target
            .split('&')
            .find_map(|part| part.strip_prefix("prefix="))
            .unwrap_or_default()
            .replace("%2F", "/");
        let keys: String = objects
            .iter()
            .filter(|(key, _)| key.starts_with(&prefix))
            .map(|(key, _)| format!("<Contents><Key>{key}</Key></Contents>"))
            .collect();
        return (
            "200 OK",
            format!("<ListBucketResult><IsTruncated>false</IsTruncated>{keys}</ListBucketResult>")
                .into_bytes(),
        );
    }

    // `/my-bucket/site/index.html` -> `site/index.html`
    let key = target.trim_start_matches('/');
    let key = key.split_once('/').map(|(_, rest)| rest).unwrap_or(key);
    match objects.iter().find(|(name, _)| name == key) {
        Some((_, body)) => ("200 OK", body.clone()),
        None => ("404 Not Found", b"<Error>NoSuchKey</Error>".to_vec()),
    }
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

fn stop(endpoint: &str, handle: thread::JoinHandle<()>) {
    let _ = ureq::get(format!("{endpoint}/stop")).call();
    let _ = handle.join();
}

#[test]
fn a_pull_writes_every_listed_object_under_the_destination() {
    let dir = tempfile::tempdir().expect("create temp dir");
    let (sender, receiver) = channel();
    let (endpoint, handle) = stub_server(
        vec![
            ("site/index.html".to_string(), b"<h1>hi</h1>".to_vec()),
            ("site/assets/app.css".to_string(), b"body{}".to_vec()),
        ],
        sender,
    );
    let home = home_with_r2(&endpoint);

    let output = talos(
        dir.path(),
        home.path(),
        &[
            "storage:pull",
            "--provider=cloudflare",
            "--from=my-bucket/site",
            "--destination=out",
            "--silent",
        ],
    );

    assert!(output.status.success(), "{}", text(&output));
    assert_eq!(
        fs::read_to_string(dir.path().join("out/index.html")).expect("the object was written"),
        "<h1>hi</h1>"
    );
    assert_eq!(
        fs::read_to_string(dir.path().join("out/assets/app.css"))
            .expect("the nested object was written"),
        "body{}"
    );

    let first = receiver
        .recv_timeout(std::time::Duration::from_secs(10))
        .expect("the stub server saw the listing");
    assert!(
        first.line.contains("list-type=2") && first.line.contains("prefix=site%2F"),
        "the run lists the prefix first: {}",
        first.line
    );

    stop(&endpoint, handle);
}

#[test]
fn unzipping_unpacks_an_archive_instead_of_writing_it() {
    let dir = tempfile::tempdir().expect("create temp dir");
    let (sender, _receiver) = channel();
    let (endpoint, handle) = stub_server(
        vec![(
            "releases/dist.zip".to_string(),
            archive(&[("index.html", "<h1>hi</h1>")]),
        )],
        sender,
    );
    let home = home_with_r2(&endpoint);

    let output = talos(
        dir.path(),
        home.path(),
        &[
            "storage:pull",
            "--provider=cloudflare",
            "--from=my-bucket/releases",
            "--destination=out",
            "--unzip",
            "--silent",
        ],
    );

    assert!(output.status.success(), "{}", text(&output));
    assert_eq!(
        fs::read_to_string(dir.path().join("out/dist/index.html")).expect("the entry was written"),
        "<h1>hi</h1>"
    );
    assert!(
        !dir.path().join("out/dist.zip").exists(),
        "the archive itself is not kept"
    );

    stop(&endpoint, handle);
}

#[test]
fn without_unzip_the_archive_is_written_as_a_file() {
    let dir = tempfile::tempdir().expect("create temp dir");
    let (sender, _receiver) = channel();
    let (endpoint, handle) = stub_server(
        vec![(
            "releases/dist.zip".to_string(),
            archive(&[("index.html", "<h1>hi</h1>")]),
        )],
        sender,
    );
    let home = home_with_r2(&endpoint);

    let output = talos(
        dir.path(),
        home.path(),
        &[
            "storage:pull",
            "--provider=cloudflare",
            "--from=my-bucket/releases",
            "--destination=out",
            "--silent",
        ],
    );

    assert!(output.status.success(), "{}", text(&output));
    assert!(dir.path().join("out/dist.zip").is_file());
    assert!(!dir.path().join("out/dist").exists());

    stop(&endpoint, handle);
}

#[test]
fn an_object_that_cannot_be_fetched_fails_the_run_and_says_what_came_back() {
    let dir = tempfile::tempdir().expect("create temp dir");
    let (sender, _receiver) = channel();
    let (endpoint, handle) = stub_server(vec![("site/index.html".to_string(), Vec::new())], sender);
    let home = home_with_r2(&endpoint);

    // Nothing is listed under this prefix, so the run falls back to treating it
    // as one object's key — and the stub has no such object.
    let output = talos(
        dir.path(),
        home.path(),
        &[
            "storage:pull",
            "--provider=cloudflare",
            "--from=my-bucket/missing/file.txt",
            "--destination=out",
        ],
    );

    assert!(!output.status.success(), "{}", text(&output));
    assert!(text(&output).contains("404"), "{}", text(&output));

    stop(&endpoint, handle);
}

#[test]
fn pulling_without_a_stored_profile_says_which_command_creates_one() {
    let dir = tempfile::tempdir().expect("create temp dir");
    let home = tempfile::tempdir().expect("create temp home");

    let output = talos(
        dir.path(),
        home.path(),
        &[
            "storage:pull",
            "--provider=bunny",
            "--from=assets",
            "--destination=out",
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
fn an_r2_source_without_a_bucket_is_rejected_before_the_network() {
    let dir = tempfile::tempdir().expect("create temp dir");
    let home = home_with_r2("http://127.0.0.1:1");

    let output = talos(
        dir.path(),
        home.path(),
        &[
            "storage:pull",
            "--provider=cloudflare",
            "--from=/",
            "--destination=out",
        ],
    );

    assert!(!output.status.success());
    assert!(text(&output).contains("bucket"), "{}", text(&output));
}
