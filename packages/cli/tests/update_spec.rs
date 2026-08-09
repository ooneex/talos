use std::fs;
use std::path::{Path, PathBuf};

use clap::Parser;

use cli::commands::update::{UpdateArgs, restore_files, snapshot_files, split_deps};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: UpdateArgs,
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/// A scratch directory that removes itself when the test ends.
struct TempDir(PathBuf);

impl TempDir {
    fn new(tag: &str) -> Self {
        let base = std::env::temp_dir().join(format!(
            "talos-update-{tag}-{}-{:?}",
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
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

// ---------------------------------------------------------------------------
// argument parsing
// ---------------------------------------------------------------------------

#[test]
fn update_parses_all_flags_and_deps() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--deps",
        "lodash,zod",
        "--latest",
        "--force",
        "--audit-level",
        "critical",
        "--skip-audit",
        "--no-cache",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.deps.as_deref(), Some("lodash,zod"));
    assert!(cli.args.latest);
    assert!(cli.args.force);
    assert_eq!(cli.args.audit_level.as_deref(), Some("critical"));
    assert!(cli.args.skip_audit);
    assert!(cli.args.no_cache);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn update_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.deps.is_none());
    assert!(!cli.args.latest);
    assert!(!cli.args.force);
    assert!(cli.args.audit_level.is_none());
    assert!(!cli.args.skip_audit);
    assert!(!cli.args.no_cache);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn update_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// --deps splitting
// ---------------------------------------------------------------------------

#[test]
fn split_deps_trims_and_drops_empty_entries() {
    assert_eq!(
        split_deps(Some(" lodash ,zod,, react ")),
        vec!["lodash", "zod", "react"]
    );
}

#[test]
fn split_deps_is_empty_when_unset() {
    assert!(split_deps(None).is_empty());
}

// ---------------------------------------------------------------------------
// snapshot / restore rollback
// ---------------------------------------------------------------------------

#[test]
fn restore_files_reverts_modified_files_to_their_snapshot() {
    let tmp = TempDir::new("restore-reverts");
    fs::write(tmp.path().join("package.json"), "before").expect("write package.json");
    fs::write(tmp.path().join("bun.lock"), "before").expect("write bun.lock");

    let snapshot = snapshot_files(tmp.path());

    fs::write(tmp.path().join("package.json"), "after").expect("mutate package.json");
    fs::write(tmp.path().join("bun.lock"), "after").expect("mutate bun.lock");

    restore_files(&snapshot);

    assert_eq!(
        fs::read_to_string(tmp.path().join("package.json")).expect("read package.json"),
        "before"
    );
    assert_eq!(
        fs::read_to_string(tmp.path().join("bun.lock")).expect("read bun.lock"),
        "before"
    );
}

#[test]
fn restore_files_removes_files_that_did_not_exist_before() {
    let tmp = TempDir::new("restore-removes-new");
    fs::write(tmp.path().join("package.json"), "before").expect("write package.json");

    let snapshot = snapshot_files(tmp.path());

    // A resolve that switched lockfile formats and created one that wasn't
    // there before the snapshot was taken.
    fs::write(tmp.path().join("bun.lock"), "new-lockfile").expect("create bun.lock");

    restore_files(&snapshot);

    assert!(!tmp.path().join("bun.lock").exists());
}
