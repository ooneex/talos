//! `docker:publish` against a stand-in `docker`.
//!
//! Everything the command does — logging in, building, tagging, pushing — goes
//! through the `docker` binary, so a script named `docker` at the front of
//! `PATH` covers the whole run and records what it was asked to do.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

use cli::commands::docker_publish::{discover, resolve_targets, split_csv};

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("a parent")).expect("create parent");
    fs::write(path, content).expect("write file");
}

/// A directory holding a `docker` script that logs its arguments and exits with
/// the given code for `build` and `push`.
fn stub_docker(tag: &str, exit_code: u8) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("talos-docker-{tag}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("create stub dir");

    let script = format!(
        r#"#!/bin/sh
printf '%s\n' "$*" >> "$(dirname "$0")/calls.log"
case "$1" in
  --version|login) exit 0 ;;
esac
exit {exit_code}
"#
    );
    let path = dir.join("docker");
    fs::write(&path, script).expect("write the stub");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).expect("make it executable");
    }
    dir
}

fn calls(stub: &Path) -> String {
    fs::read_to_string(stub.join("calls.log")).unwrap_or_default()
}

/// A `$HOME` holding a docker credentials profile.
fn home_with_credentials(registry: &str) -> tempfile::TempDir {
    let home = tempfile::tempdir().expect("create temp home");
    write(
        &home.path().join(".talos/credentials/docker.yml"),
        &format!(
            "profiles:\n  default:\n    registry: \"{registry}\"\n    username: \"me\"\n    token: \"secret\"\n"
        ),
    );
    home
}

/// A workspace with one module that has a Dockerfile and one that does not.
fn workspace() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().to_path_buf();
    write(&root.join("package.json"), "{ \"name\": \"scratch\" }\n");
    write(
        &root.join("modules/api/package.json"),
        "{ \"name\": \"@module/api\", \"version\": \"1.2.3\" }\n",
    );
    write(&root.join("modules/api/Dockerfile"), "FROM oven/bun\n");
    write(
        &root.join("modules/web/package.json"),
        "{ \"name\": \"@module/web\", \"version\": \"0.1.0\" }\n",
    );
    (dir, root)
}

fn talos(root: &Path, home: &Path, stub: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .arg(format!("--cwd={}", root.display()))
        .env("HOME", home)
        .env("PATH", format!("{}:/usr/bin:/bin", stub.display()))
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

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

#[test]
fn every_member_of_both_groups_is_a_target_when_none_is_asked_for() {
    let (_dir, root) = workspace();

    let targets = resolve_targets(&root, None, None);

    let names: Vec<&str> = targets.iter().map(|t| t.name.as_str()).collect();
    assert!(names.contains(&"api"), "{names:?}");
    assert!(names.contains(&"web"), "{names:?}");
}

#[test]
fn naming_a_target_takes_it_on_trust() {
    let (_dir, root) = workspace();

    let targets = resolve_targets(&root, Some("core"), Some("api"));

    assert_eq!(targets.len(), 2);
    assert_eq!(targets[0].base, "packages/core");
    assert_eq!(targets[1].base, "modules/api");
}

#[test]
fn discovery_of_a_group_that_is_not_there_yields_nothing() {
    let (_dir, root) = workspace();

    assert!(discover(&root, "packages", "package").is_empty());
    assert_eq!(discover(&root, "modules", "module").len(), 2);
}

#[test]
fn a_comma_separated_list_drops_the_blanks_around_it() {
    assert_eq!(split_csv(None), Vec::<String>::new());
    assert_eq!(
        split_csv(Some(" api , web ,, ")),
        vec!["api".to_string(), "web".to_string()]
    );
}

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

#[test]
fn a_module_with_a_dockerfile_is_built_and_pushed_under_its_package_version() {
    let (_dir, root) = workspace();
    let home = home_with_credentials("docker.io");
    let stub = stub_docker("publish", 0);

    let output = talos(&root, home.path(), &stub, &["docker:publish", "--modules=api"]);

    let log = calls(&stub);
    assert!(log.contains("login"), "{log}");
    assert!(log.contains("build -t me/api:1.2.3"), "{log}");
    assert!(log.contains("push me/api:1.2.3"), "{log}");
    assert!(text(&output).contains("1 published"), "{}", text(&output));
}

#[test]
fn a_registry_other_than_the_default_is_written_into_the_image_name() {
    let (_dir, root) = workspace();
    let home = home_with_credentials("ghcr.io");
    let stub = stub_docker("registry", 0);

    talos(&root, home.path(), &stub, &["docker:publish", "--modules=api"]);

    assert!(
        calls(&stub).contains("ghcr.io/me/api:1.2.3"),
        "{}",
        calls(&stub)
    );
}

#[test]
fn an_explicit_tag_wins_over_the_package_version() {
    let (_dir, root) = workspace();
    let home = home_with_credentials("docker.io");
    let stub = stub_docker("tag", 0);

    talos(
        &root,
        home.path(),
        &stub,
        &["docker:publish", "--modules=api", "--tag=edge"],
    );

    assert!(calls(&stub).contains("me/api:edge"), "{}", calls(&stub));
}

#[test]
fn a_module_with_no_dockerfile_is_counted_as_ignored() {
    let (_dir, root) = workspace();
    let home = home_with_credentials("docker.io");
    let stub = stub_docker("ignored", 0);

    let output = talos(&root, home.path(), &stub, &["docker:publish", "--modules=web"]);

    assert!(text(&output).contains("1 ignored"), "{}", text(&output));
    assert!(!calls(&stub).contains("build"), "{}", calls(&stub));
}

#[test]
fn a_build_that_fails_is_reported_rather_than_counted_as_published() {
    let (_dir, root) = workspace();
    let home = home_with_credentials("docker.io");
    let stub = stub_docker("failing", 1);

    let output = talos(&root, home.path(), &stub, &["docker:publish", "--modules=api"]);

    assert!(text(&output).contains("0 published"), "{}", text(&output));
}

#[test]
fn publishing_without_a_stored_profile_says_which_command_creates_one() {
    let (_dir, root) = workspace();
    let home = tempfile::tempdir().expect("create temp home");
    let stub = stub_docker("no-credentials", 0);

    let output = talos(&root, home.path(), &stub, &["docker:publish"]);

    assert!(!output.status.success());
    assert!(
        text(&output).contains("docker:credentials:create"),
        "{}",
        text(&output)
    );
}
