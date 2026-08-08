use std::fs;
use std::path::{Path, PathBuf};

use clap::Parser;

use cli::commands::install::{AuditCache, InstallArgs, hash_lockfile, read_cache, write_cache};
use cli::commands::security_check::SecurityAudit;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: InstallArgs,
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/// A scratch directory that removes itself when the test ends.
struct TempDir(PathBuf);

impl TempDir {
    fn new(tag: &str) -> Self {
        let base = std::env::temp_dir().join(format!(
            "talos-install-{tag}-{}-{:?}",
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

fn sample_audit() -> SecurityAudit {
    SecurityAudit {
        findings: Vec::new(),
        modules: 1,
        dependencies: 3,
        llm_files: 0,
    }
}

// ---------------------------------------------------------------------------
// argument parsing
// ---------------------------------------------------------------------------

#[test]
fn install_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--force",
        "--audit-level",
        "critical",
        "--skip-audit",
        "--no-cache",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert!(cli.args.force);
    assert_eq!(cli.args.audit_level.as_deref(), Some("critical"));
    assert!(cli.args.skip_audit);
    assert!(cli.args.no_cache);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn install_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(!cli.args.force);
    assert!(cli.args.audit_level.is_none());
    assert!(!cli.args.skip_audit);
    assert!(!cli.args.no_cache);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn install_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// lockfile hashing
// ---------------------------------------------------------------------------

#[test]
fn hash_lockfile_prefers_bun_lock_over_package_lock() {
    let tmp = TempDir::new("hash-prefers-bun-lock");
    fs::write(tmp.path().join("bun.lock"), "a").expect("write bun.lock");
    fs::write(tmp.path().join("package-lock.json"), "b").expect("write package-lock.json");

    let expected = blake3::hash(b"a").to_hex().to_string();
    assert_eq!(hash_lockfile(tmp.path()), Some(expected));
}

#[test]
fn hash_lockfile_is_none_without_a_lockfile() {
    let tmp = TempDir::new("hash-none-without-lockfile");
    assert_eq!(hash_lockfile(tmp.path()), None);
}

// ---------------------------------------------------------------------------
// audit cache
// ---------------------------------------------------------------------------

#[test]
fn cache_round_trips_a_fresh_audit() {
    let tmp = TempDir::new("cache-round-trip");
    let path = tmp.path().join("audit.json");

    write_cache(&path, "hash-a", "high", &sample_audit());
    let cached = read_cache(&path, "hash-a", "high").expect("cache hit");

    assert_eq!(cached.dependencies, 3);
}

#[test]
fn cache_misses_when_the_lockfile_hash_changes() {
    let tmp = TempDir::new("cache-miss-hash");
    let path = tmp.path().join("audit.json");

    write_cache(&path, "hash-a", "high", &sample_audit());

    assert!(read_cache(&path, "hash-b", "high").is_none());
}

#[test]
fn cache_misses_when_the_audit_level_changes() {
    let tmp = TempDir::new("cache-miss-level");
    let path = tmp.path().join("audit.json");

    write_cache(&path, "hash-a", "high", &sample_audit());

    assert!(read_cache(&path, "hash-a", "critical").is_none());
}

#[test]
fn cache_misses_when_stale() {
    let tmp = TempDir::new("cache-miss-stale");
    let path = tmp.path().join("audit.json");

    let stale = AuditCache {
        lockfile_hash: "hash-a".to_string(),
        audit_level: "high".to_string(),
        checked_at: 0,
        audit: sample_audit(),
    };
    fs::write(&path, serde_json::to_vec(&stale).expect("serialize")).expect("write cache");

    assert!(read_cache(&path, "hash-a", "high").is_none());
}
