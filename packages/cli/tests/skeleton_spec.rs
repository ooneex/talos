use cli::utils::{
    SKELETON_CACHE_MAX_AGE, SKELETON_REPO_URL, clone_skeleton, is_cache_stale, read_template,
    skeleton_templates_dir,
};
use filetime::{FileTime, set_file_mtime};
use flate2::Compression;
use flate2::write::GzEncoder;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

static ENV_GUARD: Mutex<()> = Mutex::new(());

#[test]
fn skeleton_repo_url_points_at_the_ooneex_skeleton_repo() {
    assert_eq!(SKELETON_REPO_URL, "https://github.com/ooneex/skeleton.git");
}

#[test]
fn read_template_returns_the_file_contents_for_a_nested_template() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let templates_dir = tmp.path();
    std::fs::create_dir_all(templates_dir.join("module")).unwrap();
    std::fs::write(
        templates_dir.join("module/module.txt"),
        "export class {{NAME}}Module {}\n",
    )
    .unwrap();

    let content = read_template(templates_dir, "module/module.txt");

    assert_eq!(content.as_deref(), Some("export class {{NAME}}Module {}\n"));
}

#[test]
fn read_template_returns_none_when_the_template_is_missing() {
    let tmp = tempfile::tempdir().expect("tempdir");

    assert!(read_template(tmp.path(), "does-not-exist.txt").is_none());
}

#[test]
#[ignore = "requires network access to clone the real skeleton repository"]
fn clone_skeleton_clones_into_the_user_cache() {
    let cloned = clone_skeleton(true, true).expect("clone should succeed");
    assert!(cloned.ends_with(".talos/skeleton"));
    assert!(cloned.join("package.json").is_file());
}

#[test]
fn is_cache_stale_is_true_when_the_directory_is_missing() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let missing = tmp.path().join("does-not-exist");

    assert!(is_cache_stale(&missing));
}

#[test]
fn is_cache_stale_is_false_for_a_freshly_created_directory() {
    let tmp = tempfile::tempdir().expect("tempdir");

    assert!(!is_cache_stale(tmp.path()));
}

#[test]
fn is_cache_stale_is_true_when_older_than_the_max_age() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let stale = SystemTime::now() - SKELETON_CACHE_MAX_AGE - Duration::from_secs(60);
    set_file_mtime(tmp.path(), FileTime::from_system_time(stale)).expect("set mtime");

    assert!(is_cache_stale(tmp.path()));
}

#[test]
fn is_cache_stale_is_false_when_within_the_max_age() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let recent = SystemTime::now() - SKELETON_CACHE_MAX_AGE + Duration::from_secs(60 * 60);
    set_file_mtime(tmp.path(), FileTime::from_system_time(recent)).expect("set mtime");

    assert!(!is_cache_stale(tmp.path()));
}

#[test]
fn clone_skeleton_reuses_a_fresh_cache_from_home() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let home = tempfile::tempdir().expect("tempdir");
    let cache = home.path().join(".talos").join("skeleton");
    std::fs::create_dir_all(cache.join("templates")).expect("templates dir");
    std::fs::write(cache.join("templates/module.txt"), "template").expect("template");

    let previous_home = std::env::var_os("HOME");
    unsafe {
        std::env::set_var("HOME", home.path());
    }

    let cloned = clone_skeleton(true, true).expect("cache hit should be reused");

    match previous_home {
        Some(value) => unsafe {
            std::env::set_var("HOME", value);
        },
        None => unsafe {
            std::env::remove_var("HOME");
        },
    }

    assert_eq!(cloned, cache);
}

#[test]
fn skeleton_templates_dir_honours_the_override_env_var() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let dir = tempfile::tempdir().expect("tempdir");
    let previous = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, dir.path());
    }

    let resolved = skeleton_templates_dir(true, true);

    match previous {
        Some(value) => unsafe {
            std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, value);
        },
        None => unsafe {
            std::env::remove_var(cli::utils::TEMPLATES_DIR_ENV);
        },
    }

    assert_eq!(resolved.as_deref(), Some(dir.path()));
}

#[test]
fn clone_skeleton_clones_the_configured_repository_when_the_archive_download_fails() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let source = tempfile::tempdir().expect("tempdir");
    std::fs::write(source.path().join("package.json"), "{}\n").expect("package");
    std::process::Command::new("git")
        .args(["init", "-q"])
        .current_dir(source.path())
        .output()
        .expect("git init");
    std::process::Command::new("git")
        .args(["config", "user.email", "tests@example.com"])
        .current_dir(source.path())
        .output()
        .expect("git config");
    std::process::Command::new("git")
        .args(["config", "user.name", "Tests"])
        .current_dir(source.path())
        .output()
        .expect("git config");
    std::process::Command::new("git")
        .args(["add", "."])
        .current_dir(source.path())
        .output()
        .expect("git add");
    std::process::Command::new("git")
        .args(["commit", "-qm", "init"])
        .current_dir(source.path())
        .output()
        .expect("git commit");

    let home = tempfile::tempdir().expect("tempdir");
    let previous_home = std::env::var_os("HOME");
    let previous_repo = std::env::var_os("TALOS_SKELETON_REPO_URL");
    let previous_archive = std::env::var_os("TALOS_SKELETON_ARCHIVE_URL");
    unsafe {
        std::env::set_var("HOME", home.path());
        std::env::set_var("TALOS_SKELETON_REPO_URL", source.path());
        std::env::set_var("TALOS_SKELETON_ARCHIVE_URL", "http://127.0.0.1:1/archive");
    }

    let cloned = clone_skeleton(true, false).expect("clone should succeed");

    unsafe {
        match previous_home {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }
        match previous_repo {
            Some(value) => std::env::set_var("TALOS_SKELETON_REPO_URL", value),
            None => std::env::remove_var("TALOS_SKELETON_REPO_URL"),
        }
        match previous_archive {
            Some(value) => std::env::set_var("TALOS_SKELETON_ARCHIVE_URL", value),
            None => std::env::remove_var("TALOS_SKELETON_ARCHIVE_URL"),
        }
    }

    assert!(cloned.join("package.json").is_file());
}

#[test]
fn clone_skeleton_downloads_and_unpacks_the_configured_archive() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    use std::io::Write;
    use std::net::TcpListener;

    let archive = tempfile::tempdir().expect("tempdir");
    let tarball_path = archive.path().join("skeleton.tar.gz");
    let tarball = std::fs::File::create(&tarball_path).expect("tarball");
    let mut builder = tar::Builder::new(GzEncoder::new(tarball, Compression::default()));
    let mut header = tar::Header::new_gnu();
    let content = b"{}\n";
    header.set_size(content.len() as u64);
    header.set_mode(0o644);
    header.set_cksum();
    builder
        .append_data(&mut header, "skeleton-main/package.json", &content[..])
        .expect("append");
    builder
        .into_inner()
        .expect("finish tar")
        .finish()
        .expect("finish gzip");
    let bytes = std::fs::read(&tarball_path).expect("archive bytes");

    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let address = listener.local_addr().expect("address");
    let body = bytes.clone();
    let handle = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept");
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        stream.write_all(response.as_bytes()).expect("headers");
        stream.write_all(&body).expect("body");
    });

    let home = tempfile::tempdir().expect("tempdir");
    let previous_home = std::env::var_os("HOME");
    let previous_archive = std::env::var_os("TALOS_SKELETON_ARCHIVE_URL");
    unsafe {
        std::env::set_var("HOME", home.path());
        std::env::set_var(
            "TALOS_SKELETON_ARCHIVE_URL",
            format!("http://{address}/archive"),
        );
    }

    let cloned = clone_skeleton(true, false).expect("download should succeed");
    let _ = handle.join();

    unsafe {
        match previous_home {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }
        match previous_archive {
            Some(value) => std::env::set_var("TALOS_SKELETON_ARCHIVE_URL", value),
            None => std::env::remove_var("TALOS_SKELETON_ARCHIVE_URL"),
        }
    }

    assert!(cloned.join("package.json").is_file());
}
