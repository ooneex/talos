//! Runs `release:create` over a scratch git repository.
//!
//! The command reads the history to decide a bump, rewrites the manifests and
//! the changelog, then commits and tags. Everything it reads comes from git, so
//! the fixture is a real repository: `git init`, a few conventional commits, and
//! a bare repository standing in for the remote so the push at the end has
//! somewhere local to go.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

use cli::commands::release_create::{
    CommitInfo, bump_version, determine_bump_type, update_cargo_version, update_changelog,
};

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("a parent")).expect("create parent");
    fs::write(path, content).expect("write file");
}

fn git(root: &Path, args: &[&str]) {
    let status = Command::new("git")
        .args(args)
        .current_dir(root)
        .env("GIT_AUTHOR_NAME", "Tester")
        .env("GIT_AUTHOR_EMAIL", "tester@example.com")
        .env("GIT_COMMITTER_NAME", "Tester")
        .env("GIT_COMMITTER_EMAIL", "tester@example.com")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .expect("git should run");
    assert!(status.success(), "git {args:?} failed");
}

/// Stage everything and commit it with the given subject.
fn commit(root: &Path, subject: &str) {
    git(root, &["add", "-A"]);
    git(root, &["commit", "--no-verify", "-m", subject]);
}

/// A repository with one package and one module, both already released once so
/// the run has a baseline version to bump.
fn repository() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().to_path_buf();
    let bare = root.join(".remote.git");

    git(&root, &["init", "--initial-branch=main"]);
    git(&root, &["config", "user.name", "Tester"]);
    git(&root, &["config", "user.email", "tester@example.com"]);
    git(&root, &["config", "commit.gpgsign", "false"]);
    git(&root, &["config", "tag.gpgsign", "false"]);

    write(&root.join("package.json"), "{ \"name\": \"scratch\" }\n");
    // The stand-in remote lives inside the scratch directory, so it has to be
    // ignored or the release would see it as a pending change.
    write(&root.join(".gitignore"), ".remote.git/\nnode_modules/\nbun.lock\n");
    write(
        &root.join("packages/core/package.json"),
        "{\n  \"name\": \"@scratch/core\",\n  \"version\": \"1.2.3\"\n}\n",
    );
    write(&root.join("packages/core/src/index.ts"), "export const one = 1;\n");
    write(
        &root.join("modules/user/package.json"),
        "{\n  \"name\": \"@module/user\",\n  \"version\": \"0.1.0\"\n}\n",
    );
    write(&root.join("modules/user/src/index.ts"), "export const two = 2;\n");
    commit(&root, "chore(common): Initial commit");

    Command::new("git")
        .args(["init", "--bare", bare.to_string_lossy().as_ref()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .expect("git init --bare should run");
    git(&root, &["remote", "add", "origin", bare.to_string_lossy().as_ref()]);
    git(&root, &["push", "-u", "origin", "main"]);

    (dir, root)
}

fn talos(root: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .arg(format!("--cwd={}", root.display()))
        .current_dir(root)
        .env("NO_COLOR", "1")
        .env("GIT_AUTHOR_NAME", "Tester")
        .env("GIT_AUTHOR_EMAIL", "tester@example.com")
        .env("GIT_COMMITTER_NAME", "Tester")
        .env("GIT_COMMITTER_EMAIL", "tester@example.com")
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

fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_else(|_| panic!("{} should exist", path.display()))
}

fn version(manifest: &Path) -> String {
    serde_json::from_str::<serde_json::Value>(&read(manifest))
        .expect("valid manifest")["version"]
        .as_str()
        .expect("a version")
        .to_string()
}

fn tags(root: &Path) -> String {
    let output = Command::new("git")
        .args(["tag", "--list"])
        .current_dir(root)
        .output()
        .expect("git tag should run");
    String::from_utf8_lossy(&output.stdout).to_string()
}

// ---------------------------------------------------------------------------
// The bump
// ---------------------------------------------------------------------------

fn commit_info(r#type: &str, breaking: bool) -> CommitInfo {
    CommitInfo {
        hash: "abc12345".to_string(),
        r#type: r#type.to_string(),
        subject: "Do the thing".to_string(),
        author: "Tester".to_string(),
        breaking,
    }
}

#[test]
fn a_fix_is_a_patch_a_feature_is_a_minor_and_a_break_is_a_major() {
    assert_eq!(determine_bump_type(&[commit_info("fix", false)]), "patch");
    assert_eq!(determine_bump_type(&[commit_info("chore", false)]), "patch");
    assert_eq!(
        determine_bump_type(&[commit_info("fix", false), commit_info("feat", false)]),
        "minor"
    );
    assert_eq!(
        determine_bump_type(&[commit_info("feat", false), commit_info("fix", true)]),
        "major",
        "one breaking commit outranks everything else"
    );
    assert_eq!(
        determine_bump_type(&[]),
        "patch",
        "no commit at all still bumps the patch"
    );
}

#[test]
fn bumping_resets_the_parts_below_the_one_it_raised() {
    assert_eq!(bump_version("1.2.3", "major"), "2.0.0");
    assert_eq!(bump_version("1.2.3", "minor"), "1.3.0");
    assert_eq!(bump_version("1.2.3", "patch"), "1.2.4");
    assert_eq!(
        bump_version("1.2", "patch"),
        "1.2.1",
        "a missing part reads as zero"
    );
    assert_eq!(bump_version("not-a-version", "minor"), "0.1.0");
}

// ---------------------------------------------------------------------------
// The changelog
// ---------------------------------------------------------------------------

#[test]
fn the_changelog_groups_commits_under_the_heading_their_type_belongs_to() {
    let dir = tempfile::tempdir().expect("create temp dir");

    update_changelog(
        dir.path(),
        "1.3.0",
        "@scratch/core@1.3.0",
        &[
            commit_info("feat", false),
            commit_info("fix", false),
            commit_info("chore", false),
            commit_info("revert", false),
        ],
        None,
    );

    let changelog = read(&dir.path().join("CHANGELOG.md"));
    assert!(changelog.starts_with("# Changelog"), "{changelog}");
    for heading in ["### Added", "### Fixed", "### Changed", "### Removed"] {
        assert!(changelog.contains(heading), "{heading} is missing:\n{changelog}");
    }
    assert!(changelog.contains("Do the thing — Tester"), "{changelog}");
}

#[test]
fn a_repository_url_turns_the_version_and_every_hash_into_a_link() {
    let dir = tempfile::tempdir().expect("create temp dir");

    update_changelog(
        dir.path(),
        "1.3.0",
        "@scratch/core@1.3.0",
        &[commit_info("feat", false)],
        Some("https://github.com/ooneex/scratch"),
    );

    let changelog = read(&dir.path().join("CHANGELOG.md"));
    assert!(
        changelog.contains("[1.3.0](https://github.com/ooneex/scratch/releases/tag/@scratch/core@1.3.0)"),
        "{changelog}"
    );
    assert!(
        changelog.contains("(https://github.com/ooneex/scratch/commit/abc12345)"),
        "{changelog}"
    );
}

#[test]
fn a_new_release_is_written_under_the_unreleased_heading_when_there_is_one() {
    let dir = tempfile::tempdir().expect("create temp dir");
    write(
        &dir.path().join("CHANGELOG.md"),
        "# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2020-01-01\n",
    );

    update_changelog(
        dir.path(),
        "1.1.0",
        "@scratch/core@1.1.0",
        &[commit_info("feat", false)],
        None,
    );

    let changelog = read(&dir.path().join("CHANGELOG.md"));
    let unreleased = changelog.find("## [Unreleased]").expect("kept");
    let new_release = changelog.find("## [1.1.0]").expect("added");
    let old_release = changelog.find("## [1.0.0]").expect("kept");
    assert!(
        unreleased < new_release && new_release < old_release,
        "the newest release sits between them:\n{changelog}"
    );
}

#[test]
fn a_changelog_without_an_unreleased_heading_gets_the_release_appended() {
    let dir = tempfile::tempdir().expect("create temp dir");
    write(&dir.path().join("CHANGELOG.md"), "# Changelog\n\n## [1.0.0] - 2020-01-01\n");

    update_changelog(dir.path(), "1.0.1", "x@1.0.1", &[commit_info("fix", false)], None);

    let changelog = read(&dir.path().join("CHANGELOG.md"));
    assert!(
        changelog.find("## [1.0.0]") < changelog.find("## [1.0.1]"),
        "{changelog}"
    );
}

// ---------------------------------------------------------------------------
// Cargo manifests
// ---------------------------------------------------------------------------

#[test]
fn only_the_package_sections_version_is_rewritten() {
    let dir = tempfile::tempdir().expect("create temp dir");
    let manifest = dir.path().join("Cargo.toml");
    write(
        &manifest,
        "[package]\nname = \"cli\"\nversion = \"0.1.0\"\n\n[dependencies]\nserde = { version = \"1.0\" }\n",
    );

    update_cargo_version(&manifest, "0.2.0");

    let updated = read(&manifest);
    assert!(updated.contains("version = \"0.2.0\""), "{updated}");
    assert!(
        updated.contains("serde = { version = \"1.0\" }"),
        "a dependency's version is left alone: {updated}"
    );
}

#[test]
fn a_manifest_with_no_package_version_is_left_untouched() {
    let dir = tempfile::tempdir().expect("create temp dir");
    let manifest = dir.path().join("Cargo.toml");
    let original = "[workspace]\nmembers = [\"cli\"]\n";
    write(&manifest, original);

    update_cargo_version(&manifest, "9.9.9");

    assert_eq!(read(&manifest), original);
}

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

#[test]
fn a_feature_commit_releases_a_minor_version_and_tags_it() {
    let (_dir, root) = repository();
    write(&root.join("packages/core/src/index.ts"), "export const one = 11;\n");
    commit(&root, "feat(core): Add the thing");

    let output = talos(&root, &["release:create", "--packages=core"]);

    assert!(output.status.success(), "{}", text(&output));
    assert_eq!(version(&root.join("packages/core/package.json")), "1.3.0");
    assert!(tags(&root).contains("@scratch/core@1.3.0"), "{}", tags(&root));
    let changelog = read(&root.join("packages/core/CHANGELOG.md"));
    assert!(changelog.contains("Add the thing"), "{changelog}");
}

#[test]
fn a_breaking_commit_releases_a_major_version() {
    let (_dir, root) = repository();
    write(&root.join("modules/user/src/index.ts"), "export const two = 22;\n");
    commit(&root, "feat(user)!: Rewrite the interface");

    let output = talos(&root, &["release:create", "--modules=user"]);

    assert!(output.status.success(), "{}", text(&output));
    assert_eq!(version(&root.join("modules/user/package.json")), "1.0.0");
}

#[test]
fn a_crate_beside_the_manifest_has_its_version_kept_in_step() {
    let (_dir, root) = repository();
    write(
        &root.join("packages/core/Cargo.toml"),
        "[package]\nname = \"core\"\nversion = \"1.2.3\"\n",
    );
    commit(&root, "fix(core): Repair the thing");

    talos(&root, &["release:create", "--packages=core"]);

    let cargo = read(&root.join("packages/core/Cargo.toml"));
    assert!(cargo.contains("version = \"1.2.4\""), "{cargo}");
    assert_eq!(version(&root.join("packages/core/package.json")), "1.2.4");
}

#[test]
fn a_package_with_no_commit_since_its_tag_is_left_alone() {
    let (_dir, root) = repository();
    write(&root.join("packages/core/src/index.ts"), "export const one = 11;\n");
    commit(&root, "feat(core): Add the thing");

    talos(&root, &["release:create", "--packages=core"]);
    let released = version(&root.join("packages/core/package.json"));

    let output = talos(&root, &["release:create", "--packages=core"]);

    assert!(text(&output).contains("No packages have unreleased commits"), "{}", text(&output));
    assert_eq!(version(&root.join("packages/core/package.json")), released);
}

#[test]
fn a_dirty_working_tree_stops_the_release_before_anything_is_written() {
    let (_dir, root) = repository();
    write(&root.join("packages/core/src/index.ts"), "export const one = 11;\n");

    let output = talos(&root, &["release:create", "--packages=core"]);

    assert!(!output.status.success());
    assert!(text(&output).contains("pending changes"), "{}", text(&output));
    assert_eq!(version(&root.join("packages/core/package.json")), "1.2.3");
}

#[test]
fn asking_for_a_package_that_is_not_there_stops_the_release() {
    let (_dir, root) = repository();

    let output = talos(&root, &["release:create", "--packages=nowhere"]);

    assert!(!output.status.success());
    assert!(
        text(&output).contains("nowhere"),
        "the run names the package it could not find: {}",
        text(&output)
    );
}

#[test]
fn a_repository_with_no_packages_or_modules_stops_the_release() {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().to_path_buf();
    git(&root, &["init", "--initial-branch=main"]);
    git(&root, &["config", "user.name", "Tester"]);
    git(&root, &["config", "user.email", "tester@example.com"]);
    write(&root.join("README.md"), "# Nothing here\n");
    commit(&root, "chore(common): Initial commit");

    let output = talos(&root, &["release:create"]);

    assert!(!output.status.success());
    assert!(
        text(&output).contains("No packages or modules found"),
        "{}",
        text(&output)
    );
}
