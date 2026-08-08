// `talos install` — installs the workspace's dependencies with `bun
// install`, but audits every package for known vulnerabilities before it
// ever reaches node_modules. The audit result is cached against the
// lockfile's content hash so unchanged dependencies skip the OSV.dev round
// trip on the next run.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime};

use clap::Args;
use console::style;
use serde::{Deserialize, Serialize};

use crate::commands::security_check::{self, SecurityAudit, Severity};
use crate::utils::{Spinner, current_dir, ensure_bin, error, success, warn};

/// How long a cached audit is trusted before it is re-queried from OSV.dev,
/// even when the lockfile it was computed from hasn't changed.
pub const AUDIT_CACHE_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);

const AUDIT_CACHE_PATH: &str = "var/cache/security/install-audit.json";

/// Lockfiles checked, in order, to fingerprint what would be installed.
const LOCKFILE_CANDIDATES: [&str; 3] = ["bun.lock", "bun.lockb", "package-lock.json"];

#[derive(Args, Debug)]
pub struct InstallArgs {
    /// Install anyway even when the audit finds vulnerable dependencies.
    #[arg(long, default_value_t = false)]
    pub force: bool,

    /// Minimum severity that blocks the install (low, moderate, high, critical). Defaults to high.
    #[arg(long = "audit-level")]
    pub audit_level: Option<String>,

    /// Skip the vulnerability audit and install directly.
    #[arg(long = "skip-audit", default_value_t = false)]
    pub skip_audit: bool,

    /// Bypass the cached audit result and re-query OSV.dev.
    #[arg(long = "no-cache", default_value_t = false)]
    pub no_cache: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct AuditCache {
    pub lockfile_hash: String,
    pub audit_level: String,
    pub checked_at: u64,
    pub audit: SecurityAudit,
}

pub fn run(args: &InstallArgs) {
    if !execute(args) {
        std::process::exit(1);
    }
}

/// Audits and installs the workspace's dependencies, returning whether it
/// succeeded — so [`workspace_check`](crate::commands::workspace_check) can
/// run it as one step of its gate without a process exit of its own.
pub fn execute(args: &InstallArgs) -> bool {
    let root = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);

    if !ensure_bin("bun") {
        return false;
    }

    if !args.skip_audit && !resolve_and_audit(&root, args) {
        return false;
    }

    let spinner = Spinner::start("Installing dependencies");
    let status = Command::new("bun")
        .arg("install")
        .current_dir(&root)
        .status();
    spinner.stop();

    match status {
        Ok(status) if status.success() => {
            success("Dependencies installed");
            true
        }
        Ok(status) => {
            error(format!(
                "bun install failed (exit code: {})",
                status.code().unwrap_or(-1)
            ));
            false
        }
        Err(err) => {
            error(format!("Failed to run bun install: {err}"));
            false
        }
    }
}

/// Resolves the dependency graph without touching `node_modules`, audits it,
/// and reports whether the install should proceed.
fn resolve_and_audit(root: &Path, args: &InstallArgs) -> bool {
    let spinner = Spinner::start("Resolving dependency graph");
    let resolved = Command::new("bun")
        .args(["install", "--lockfile-only"])
        .current_dir(root)
        .output();
    spinner.stop();

    match resolved {
        Ok(output) if output.status.success() => {}
        Ok(output) => {
            error("Failed to resolve dependencies");
            let combined = format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            if !combined.trim().is_empty() {
                eprintln!("{}", combined.trim_end());
            }
            return false;
        }
        Err(err) => {
            error(format!(
                "Failed to run \"bun install --lockfile-only\": {err}"
            ));
            return false;
        }
    }

    let min_severity = args
        .audit_level
        .as_deref()
        .map(Severity::from_label)
        .unwrap_or(Severity::High);

    let Some(audit) = load_or_run_audit(root, args, min_severity.label()) else {
        if args.force {
            warn("Could not complete the vulnerability audit — installing anyway (--force)");
            return true;
        }
        error("Could not complete the vulnerability audit — rerun with --force to install anyway");
        return false;
    };

    print_audit_report(&audit);

    if audit.findings.is_empty() {
        success("No known vulnerabilities found");
        return true;
    }

    if args.force {
        warn(format!(
            "{} vulnerabilit{} found — installing anyway (--force)",
            audit.findings.len(),
            if audit.findings.len() == 1 {
                "y"
            } else {
                "ies"
            }
        ));
        return true;
    }

    error("Install blocked — vulnerable dependencies found (use --force to install anyway)");
    false
}

/// Reuses a fresh cached audit for the same lockfile and audit level when
/// available, otherwise queries OSV.dev and caches the result.
fn load_or_run_audit(root: &Path, args: &InstallArgs, audit_level: &str) -> Option<SecurityAudit> {
    let cache_path = root.join(AUDIT_CACHE_PATH);
    let lockfile_hash = hash_lockfile(root);

    if !args.no_cache
        && let Some(hash) = lockfile_hash.as_deref()
        && let Some(cached) = read_cache(&cache_path, hash, audit_level)
    {
        return Some(cached);
    }

    let spinner = Spinner::start("Auditing dependencies for known vulnerabilities");
    let audit = security_check::audit(root, None, None, Some(audit_level));
    spinner.stop();

    let audit = match audit {
        Ok(audit) => audit,
        Err(message) if message.is_empty() => SecurityAudit::default(),
        Err(message) => {
            error(message);
            return None;
        }
    };

    if let Some(hash) = lockfile_hash.as_deref() {
        write_cache(&cache_path, hash, audit_level, &audit);
    }

    Some(audit)
}

/// Content hash of the first lockfile found at the workspace root, used to
/// invalidate the audit cache the moment dependencies actually change.
pub fn hash_lockfile(root: &Path) -> Option<String> {
    for name in LOCKFILE_CANDIDATES {
        if let Ok(bytes) = fs::read(root.join(name)) {
            return Some(blake3::hash(&bytes).to_hex().to_string());
        }
    }
    None
}

pub fn read_cache(path: &Path, lockfile_hash: &str, audit_level: &str) -> Option<SecurityAudit> {
    let bytes = fs::read(path).ok()?;
    let cache: AuditCache = serde_json::from_slice(&bytes).ok()?;
    if cache.lockfile_hash != lockfile_hash || cache.audit_level != audit_level {
        return None;
    }

    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .ok()?
        .as_secs();
    if now.saturating_sub(cache.checked_at) > AUDIT_CACHE_MAX_AGE.as_secs() {
        return None;
    }

    Some(cache.audit)
}

pub fn write_cache(path: &Path, lockfile_hash: &str, audit_level: &str, audit: &SecurityAudit) {
    let Some(parent) = path.parent() else {
        return;
    };
    if fs::create_dir_all(parent).is_err() {
        return;
    }

    let checked_at = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();

    let cache = AuditCache {
        lockfile_hash: lockfile_hash.to_string(),
        audit_level: audit_level.to_string(),
        checked_at,
        audit: audit.clone(),
    };

    if let Ok(json) = serde_json::to_vec_pretty(&cache) {
        let _ = fs::write(path, json);
    }
}

fn print_audit_report(audit: &SecurityAudit) {
    println!(
        "{}{}",
        style("▸ Security audit").magenta().bold(),
        style(format!(
            "  {} module{} · {} dependenc{} scanned",
            audit.modules,
            if audit.modules == 1 { "" } else { "s" },
            audit.dependencies,
            if audit.dependencies == 1 { "y" } else { "ies" }
        ))
        .dim()
    );

    let mut current_module: Option<&str> = None;
    for finding in &audit.findings {
        if current_module != Some(finding.module.as_str()) {
            println!();
            println!("{}", style(&finding.module).bold().underlined());
            current_module = Some(finding.module.as_str());
        }

        let subject = if finding.version.is_empty() {
            finding.subject.clone()
        } else {
            format!("{}@{}", finding.subject, finding.version)
        };
        println!(
            "  {} {}  {}",
            Severity::from_label(&finding.severity).styled(),
            style(subject).bold(),
            finding.title
        );

        let mut meta = vec![finding.source.clone(), finding.id.clone()];
        if !finding.remediation.is_empty() {
            meta.push(format!("patched {}", finding.remediation));
        }
        meta.push(finding.url.clone());
        println!("      {}", style(meta.join("  ·  ")).dim());
    }

    if !audit.findings.is_empty() {
        println!();
    }
}
