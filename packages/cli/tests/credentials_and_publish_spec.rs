//! The commands gated on a credentials file or on an external binary.
//!
//! `credentials:create` and its three siblings write a profile under
//! `$HOME/.talos`; `npm:publish`, `docker:publish` and `app:stop` refuse to do
//! anything until the binary they drive and the profile they need are both
//! there. A scratch `HOME` and a `PATH` with nothing on it cover both sides
//! without touching a registry.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

use cli::commands::npm_publish::{
    discover, percent_encode, remove_tgz_files, resolve_targets, split_csv,
};

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("a parent")).expect("create parent");
    fs::write(path, content).expect("write file");
}

/// A workspace with one package and one module, both publishable.
fn workspace() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().to_path_buf();
    write(&root.join("package.json"), "{ \"name\": \"scratch\" }\n");
    write(
        &root.join("packages/core/package.json"),
        "{ \"name\": \"@scratch/core\", \"version\": \"1.0.0\" }\n",
    );
    write(
        &root.join("modules/user/package.json"),
        "{ \"name\": \"@module/user\", \"version\": \"0.1.0\" }\n",
    );
    write(&root.join("modules/user/user.yml"), "type: \"module\"\n");
    (dir, root)
}

fn home() -> tempfile::TempDir {
    tempfile::tempdir().expect("create temp home")
}

/// Run the binary with the given `HOME`, and with `PATH` emptied unless the
/// test wants the real one.
fn talos(root: &Path, home: &Path, with_path: bool, args: &[&str]) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_talos"));
    command
        .args(args)
        .arg(format!("--cwd={}", root.display()))
        .env("HOME", home)
        .env("NO_COLOR", "1")
        .stdin(Stdio::null());
    if !with_path {
        command.env("PATH", "/nonexistent");
    }
    command.output().expect("the talos binary should run")
}

/// The same, for a command that takes no `--cwd`.
fn talos_bare(home: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
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

// ---------------------------------------------------------------------------
// credentials:create
// ---------------------------------------------------------------------------

#[test]
fn a_provider_profile_is_written_under_the_home_directory() {
    let home = home();

    let output = talos_bare(
        home.path(),
        &[
            "credentials:create",
            "--provider=linear",
            "--token=lin_api_secret",
            "--silent",
        ],
    );

    assert!(output.status.success(), "{}", text(&output));
    let profile = fs::read_to_string(home.path().join(".talos/credentials/linear.yml"))
        .expect("the profile was written");
    assert!(profile.contains("lin_api_secret"), "{profile}");
}

#[test]
fn a_provider_asking_for_several_fields_writes_all_of_them() {
    let home = home();

    talos_bare(
        home.path(),
        &[
            "credentials:create",
            "--provider=jira",
            "--base-url=https://example.atlassian.net",
            "--email=me@example.com",
            "--token=jira-token",
            "--silent",
        ],
    );

    let profile = fs::read_to_string(home.path().join(".talos/credentials/jira.yml"))
        .expect("the profile was written");
    assert!(
        profile.contains("https://example.atlassian.net"),
        "{profile}"
    );
    assert!(profile.contains("me@example.com"), "{profile}");
    assert!(profile.contains("jira-token"), "{profile}");
}

#[test]
fn a_field_the_run_cannot_ask_for_leaves_no_profile_behind() {
    let home = home();

    // `--provider=x` needs four secrets and only one is given, and stdin is
    // closed, so the run gives up rather than writing half a profile.
    talos_bare(
        home.path(),
        &[
            "credentials:create",
            "--provider=x",
            "--client-id=abc",
            "--silent",
        ],
    );

    assert!(
        !home.path().join(".talos/credentials/x.yml").exists(),
        "a half-answered profile is not saved"
    );
}

#[test]
fn the_three_dedicated_credential_commands_each_write_their_own_profile() {
    let home = home();

    talos_bare(
        home.path(),
        &["npm:credentials:create", "--token=npm_token", "--silent"],
    );
    talos_bare(
        home.path(),
        &[
            "docker:credentials:create",
            "--registry=docker.io",
            "--username=me",
            "--token=docker_token",
            "--silent",
        ],
    );
    talos_bare(
        home.path(),
        &[
            "bitbucket:credentials:create",
            "--username=me",
            "--token=bb_token",
            "--silent",
        ],
    );

    assert!(
        fs::read_to_string(home.path().join(".talos/credentials/npm.yml"))
            .expect("npm profile")
            .contains("npm_token")
    );
    assert!(
        fs::read_to_string(home.path().join(".talos/credentials/docker.yml"))
            .expect("docker profile")
            .contains("docker_token")
    );
    assert!(
        fs::read_to_string(home.path().join(".talos/credentials/bitbucket.yml"))
            .expect("bitbucket profile")
            .contains("bb_token")
    );
}

// ---------------------------------------------------------------------------
// npm:publish
// ---------------------------------------------------------------------------

#[test]
fn publishing_without_the_npm_binary_stops_before_anything_else() {
    let (_dir, root) = workspace();
    let home = home();

    let output = talos(&root, home.path(), false, &["npm:publish"]);

    assert!(text(&output).contains("npm"), "{}", text(&output));
}

#[test]
fn publishing_without_a_stored_token_says_which_command_creates_one() {
    let (_dir, root) = workspace();
    let home = home();

    let output = talos(
        &root,
        home.path(),
        true,
        &["npm:publish", "--packages=core"],
    );

    assert!(!output.status.success());
    assert!(
        text(&output).contains("npm:credentials:create"),
        "{}",
        text(&output)
    );
}

#[test]
fn publishing_a_workspace_with_nothing_in_it_is_an_error() {
    let dir = tempfile::tempdir().expect("create temp dir");
    let home = home();

    let output = talos(dir.path(), home.path(), true, &["npm:publish"]);

    assert!(!output.status.success());
    assert!(
        text(&output).contains("No packages or modules found"),
        "{}",
        text(&output)
    );
}

#[test]
fn targets_come_from_the_flags_when_they_are_given_and_from_disk_when_they_are_not() {
    let (_dir, root) = workspace();

    let discovered = resolve_targets(&root, None, None);
    let names: Vec<&str> = discovered.iter().map(|t| t.name.as_str()).collect();
    assert!(names.contains(&"core"), "{names:?}");
    assert!(names.contains(&"user"), "{names:?}");

    let asked = resolve_targets(&root, Some("core"), Some("user,order"));
    assert_eq!(asked.len(), 3, "a name is taken on trust, not checked");
    assert_eq!(asked[0].base, "packages/core");
    assert_eq!(asked[0].kind, "package");
    assert_eq!(asked[2].base, "modules/order");
    assert_eq!(asked[2].kind, "module");
}

#[test]
fn discovery_only_looks_in_the_group_it_is_pointed_at() {
    let (_dir, root) = workspace();

    let packages = discover(&root, "packages", "package");
    assert_eq!(packages.len(), 1);
    assert_eq!(packages[0].name, "core");

    assert!(
        discover(&root, "nowhere", "package").is_empty(),
        "a group that does not exist yields nothing"
    );
}

#[test]
fn a_comma_separated_list_drops_the_blanks_around_it() {
    assert_eq!(split_csv(None), Vec::<String>::new());
    assert_eq!(split_csv(Some("  ")), Vec::<String>::new());
    assert_eq!(
        split_csv(Some(" core , user ,, ")),
        vec!["core".to_string(), "user".to_string()]
    );
}

#[test]
fn a_package_name_is_percent_encoded_for_the_registry_url() {
    assert_eq!(percent_encode("left-pad"), "left-pad");
    assert_eq!(percent_encode("@scope/name"), "%40scope%2Fname");
    assert_eq!(percent_encode("1.0.0"), "1.0.0");
}

#[test]
fn only_the_tarballs_are_swept_out_of_a_package_directory() {
    let dir = tempfile::tempdir().expect("create temp dir");
    write(&dir.path().join("core-1.0.0.tgz"), "");
    write(&dir.path().join("package.json"), "{}\n");

    remove_tgz_files(dir.path());

    assert!(!dir.path().join("core-1.0.0.tgz").exists());
    assert!(dir.path().join("package.json").is_file());
}

// ---------------------------------------------------------------------------
// The other binary-gated commands
// ---------------------------------------------------------------------------

#[test]
fn docker_publish_without_the_docker_binary_stops_before_anything_else() {
    let (_dir, root) = workspace();
    let home = home();

    let output = talos(&root, home.path(), false, &["docker:publish"]);

    assert!(text(&output).contains("docker"), "{}", text(&output));
}

#[test]
fn app_stop_needs_an_app_module_before_it_needs_docker() {
    let (_dir, root) = workspace();
    let home = home();

    let output = talos(&root, home.path(), true, &["app:stop"]);

    assert!(!output.status.success());
    assert!(text(&output).contains("app"), "{}", text(&output));
}

#[test]
fn bitbucket_secret_push_without_a_stored_profile_says_which_command_creates_one() {
    let (_dir, root) = workspace();
    let home = home();

    let output = talos(
        &root,
        home.path(),
        true,
        &["bitbucket:secret:push", "--name=API_KEY", "--value=secret"],
    );

    assert!(
        text(&output).contains("bitbucket:credentials:create"),
        "{}",
        text(&output)
    );
}

// ---------------------------------------------------------------------------
// issue:create
// ---------------------------------------------------------------------------

#[test]
fn issue_create_writes_a_todo_issue_the_checker_accepts() {
    let (_dir, root) = workspace();
    let home = home();

    let output = talos(
        &root,
        home.path(),
        true,
        &[
            "issue:create",
            "--module=user",
            "--title=Add pagination",
            "--priority=High",
            "--label=Feature",
            "--description=Page the list",
        ],
    );

    assert!(output.status.success(), "{}", text(&output));
    let entry = fs::read_dir(root.join("modules/user/issues"))
        .expect("the issues directory was created")
        .flatten()
        .next()
        .expect("one issue was written");
    let issue = fs::read_to_string(entry.path()).expect("read the issue");
    assert!(issue.contains("Add pagination"), "{issue}");
    assert!(issue.contains("High"), "{issue}");
    assert!(issue.contains("Feature"), "{issue}");
    assert!(
        issue.contains("Todo"),
        "a new issue always starts in Todo: {issue}"
    );
}

/// Every provider, with the flags that answer all of its fields and the file
/// the profile lands in.
const PROVIDERS: &[(&str, &[&str], &str)] = &[
    (
        "jira",
        &[
            "--base-url=https://x.atlassian.net",
            "--email=me@x.com",
            "--token=t",
        ],
        "jira.yml",
    ),
    ("linear", &["--token=t"], "linear.yml"),
    (
        "x",
        &[
            "--client-id=a",
            "--client-secret=b",
            "--access-token=c",
            "--client-key=d",
        ],
        "x.yml",
    ),
    (
        "instagram",
        &["--app-id=a", "--app-secret=b", "--access-token=c"],
        "instagram.yml",
    ),
    (
        "facebook",
        &[
            "--app-id=a",
            "--app-secret=b",
            "--access-token=c",
            "--page-id=d",
        ],
        "facebook.yml",
    ),
    (
        "linkedin",
        &["--client-id=a", "--client-secret=b", "--access-token=c"],
        "linkedin.yml",
    ),
    (
        "tiktok",
        &["--client-key=a", "--client-secret=b", "--access-token=c"],
        "tiktok.yml",
    ),
    (
        "threads",
        &["--app-id=a", "--app-secret=b", "--access-token=c"],
        "threads.yml",
    ),
    (
        "whatsapp",
        &["--phone-number-id=a", "--access-token=b"],
        "whatsapp.yml",
    ),
    ("telegram", &["--bot-token=a"], "telegram.yml"),
    (
        "messenger",
        &["--page-id=a", "--app-secret=b", "--access-token=c"],
        "messenger.yml",
    ),
    (
        "discord",
        &["--application-id=a", "--bot-token=b"],
        "discord.yml",
    ),
    (
        "reddit",
        &[
            "--client-id=a",
            "--client-secret=b",
            "--username=c",
            "--password=d",
        ],
        "reddit.yml",
    ),
    ("medium", &["--token=t"], "medium.yml"),
];

#[test]
fn every_provider_writes_the_profile_the_commands_that_use_it_read() {
    for (provider, flags, file) in PROVIDERS {
        let home = home();
        let mut args = vec!["credentials:create", "--silent"];
        let provider_flag = format!("--provider={provider}");
        args.push(&provider_flag);
        args.extend(flags.iter().copied());

        let output = talos_bare(home.path(), &args);

        assert!(output.status.success(), "{provider}: {}", text(&output));
        let profile = fs::read_to_string(home.path().join(".talos/credentials").join(file))
            .unwrap_or_else(|_| panic!("{provider} wrote no profile"));
        assert!(profile.contains("default:"), "{provider} wrote {profile}");
    }
}
