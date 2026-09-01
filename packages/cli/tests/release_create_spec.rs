use clap::Parser;
use cli::commands::release_create::ReleaseCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: ReleaseCreateArgs,
}

#[test]
fn release_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--modules",
        "user",
        "--packages",
        "core",
        "--publish",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.modules.as_deref(), Some("user"));
    assert_eq!(cli.args.packages.as_deref(), Some("core"));
    assert!(cli.args.publish);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn release_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.modules.is_none());
    assert!(cli.args.packages.is_none());
    assert!(!cli.args.publish);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn release_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// version + changelog helpers
// ---------------------------------------------------------------------------

use std::fs;
use std::path::{Path, PathBuf};

use cli::commands::release_create::{
    CommitInfo, bump_version, determine_bump_type, normalize_repo_url, update_cargo_version,
    update_changelog,
};

/// A scratch directory that removes itself when the test ends.
struct TempDir(PathBuf);

impl TempDir {
    fn new(tag: &str) -> Self {
        let base = std::env::temp_dir().join(format!(
            "talos-release-create-{tag}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).expect("temp dir should be creatable");
        Self(base)
    }

    fn path(&self) -> &Path {
        &self.0
    }

    fn write(&self, name: &str, content: &str) -> PathBuf {
        let target = self.0.join(name);
        fs::write(&target, content).expect("fixture should be writable");
        target
    }

    fn read(&self, name: &str) -> String {
        fs::read_to_string(self.0.join(name)).expect("file should be readable")
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn commit(ty: &str, subject: &str, breaking: bool) -> CommitInfo {
    CommitInfo {
        hash: "abc12345".to_string(),
        r#type: ty.to_string(),
        subject: subject.to_string(),
        author: "Franck".to_string(),
        breaking,
    }
}

#[test]
fn determine_bump_type_defaults_to_patch() {
    assert_eq!(determine_bump_type(&[]), "patch");
    assert_eq!(
        determine_bump_type(&[
            commit("fix", "a crash", false),
            commit("chore", "deps", false)
        ]),
        "patch"
    );
}

#[test]
fn determine_bump_type_promotes_feat_to_minor() {
    assert_eq!(
        determine_bump_type(&[
            commit("fix", "a crash", false),
            commit("feat", "a flag", false)
        ]),
        "minor"
    );
}

#[test]
fn determine_bump_type_lets_a_breaking_commit_win() {
    // A breaking change outranks a later feat, and returns immediately.
    assert_eq!(
        determine_bump_type(&[
            commit("fix", "a crash", true),
            commit("feat", "a flag", false)
        ]),
        "major"
    );
}

#[test]
fn bump_version_increments_the_right_component() {
    assert_eq!(bump_version("1.2.3", "major"), "2.0.0");
    assert_eq!(bump_version("1.2.3", "minor"), "1.3.0");
    assert_eq!(bump_version("1.2.3", "patch"), "1.2.4");
    // Anything unrecognised is treated as a patch.
    assert_eq!(bump_version("1.2.3", "nonsense"), "1.2.4");
}

#[test]
fn bump_version_treats_missing_components_as_zero() {
    assert_eq!(bump_version("1", "minor"), "1.1.0");
    assert_eq!(bump_version("", "patch"), "0.0.1");
    // A pre-release suffix is not a number, so that component reads as absent.
    assert_eq!(bump_version("1.2.3-beta", "patch"), "1.2.1");
}

#[test]
fn repository_urls_preserve_https_and_convert_scp_syntax() {
    assert_eq!(
        normalize_repo_url("https://github.com/ooneex/talos.git"),
        "https://github.com/ooneex/talos"
    );
    assert_eq!(
        normalize_repo_url("git@github.com:ooneex/talos.git"),
        "https://github.com/ooneex/talos"
    );
}

#[test]
fn update_cargo_version_rewrites_only_the_package_version() {
    let dir = TempDir::new("cargo-version");
    let path = dir.write(
        "Cargo.toml",
        "[package]\nname = \"cli\"\nversion = \"1.0.0\"\n\n[dependencies]\nserde = { version = \"1.0.200\" }\n",
    );

    update_cargo_version(&path, "1.1.0");

    let out = dir.read("Cargo.toml");
    assert!(out.contains("version = \"1.1.0\""));
    // The dependency's own version must be left alone.
    assert!(out.contains("serde = { version = \"1.0.200\" }"));
}

#[test]
fn update_cargo_version_preserves_the_trailing_newline() {
    let dir = TempDir::new("cargo-newline");
    let path = dir.write("Cargo.toml", "[package]\nversion = \"1.0.0\"\n");

    update_cargo_version(&path, "2.0.0");

    assert!(dir.read("Cargo.toml").ends_with('\n'));
}

#[test]
fn update_cargo_version_does_nothing_without_a_package_version() {
    let dir = TempDir::new("cargo-noop");
    let original = "[dependencies]\nversion = \"9.9.9\"\n";
    let path = dir.write("Cargo.toml", original);

    update_cargo_version(&path, "2.0.0");

    // `version` outside a [package] table is not the crate's version.
    assert_eq!(dir.read("Cargo.toml"), original);
}

#[test]
fn update_cargo_version_ignores_a_missing_file() {
    let dir = TempDir::new("cargo-missing");

    update_cargo_version(&dir.path().join("Cargo.toml"), "2.0.0");

    assert!(!dir.path().join("Cargo.toml").exists());
}

#[test]
fn update_changelog_creates_the_file_with_grouped_sections() {
    let dir = TempDir::new("changelog-new");
    let commits = [
        commit("feat", "add a flag", false),
        commit("fix", "stop a crash", false),
        commit("chore", "bump deps", false),
        commit("revert", "undo the thing", false),
    ];

    update_changelog(dir.path(), "1.1.0", "cli@1.1.0", &commits, None);

    let out = dir.read("CHANGELOG.md");
    assert!(out.starts_with("# Changelog\n"));
    assert!(out.contains("## [1.1.0] - "));
    assert!(out.contains("### Added\n\n- add a flag — Franck"));
    assert!(out.contains("### Fixed\n\n- stop a crash — Franck"));
    assert!(out.contains("### Changed\n\n- bump deps — Franck"));
    assert!(out.contains("### Removed\n\n- undo the thing — Franck"));
}

#[test]
fn update_changelog_links_the_version_and_commits_to_the_repo() {
    let dir = TempDir::new("changelog-links");
    let commits = [commit("feat", "add a flag", false)];

    update_changelog(
        dir.path(),
        "1.1.0",
        "cli@1.1.0",
        &commits,
        Some("https://github.com/acme/repo"),
    );

    let out = dir.read("CHANGELOG.md");
    assert!(out.contains("[1.1.0](https://github.com/acme/repo/releases/tag/cli@1.1.0)"));
    assert!(out.contains("([abc12345](https://github.com/acme/repo/commit/abc12345))"));
}

#[test]
fn update_changelog_inserts_under_an_existing_unreleased_heading() {
    let dir = TempDir::new("changelog-unreleased");
    dir.write(
        "CHANGELOG.md",
        "# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n\n### Added\n\n- the first thing\n",
    );

    update_changelog(
        dir.path(),
        "1.1.0",
        "cli@1.1.0",
        &[commit("feat", "add a flag", false)],
        None,
    );

    let out = dir.read("CHANGELOG.md");
    let unreleased = out.find("## [Unreleased]").expect("heading is kept");
    let new_section = out.find("## [1.1.0]").expect("new section is written");
    let old_section = out.find("## [1.0.0]").expect("old section is kept");

    // The new release lands between [Unreleased] and the previous release.
    assert!(unreleased < new_section);
    assert!(new_section < old_section);
}

#[test]
fn update_changelog_appends_when_there_is_no_unreleased_heading() {
    let dir = TempDir::new("changelog-append");
    dir.write("CHANGELOG.md", "# Changelog\n\n## [1.0.0] - 2026-01-01\n");

    update_changelog(
        dir.path(),
        "1.1.0",
        "cli@1.1.0",
        &[commit("fix", "stop a crash", false)],
        None,
    );

    let out = dir.read("CHANGELOG.md");
    assert!(
        out.find("## [1.0.0]").expect("old section is kept")
            < out.find("## [1.1.0]").expect("new section is written")
    );
}

#[test]
fn update_changelog_omits_categories_with_no_commits() {
    let dir = TempDir::new("changelog-sparse");

    update_changelog(
        dir.path(),
        "1.0.1",
        "cli@1.0.1",
        &[commit("fix", "stop a crash", false)],
        None,
    );

    let out = dir.read("CHANGELOG.md");
    assert!(out.contains("### Fixed"));
    assert!(!out.contains("### Added"));
    assert!(!out.contains("### Deprecated"));
    assert!(!out.contains("### Security"));
}
