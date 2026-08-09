// `talos update` — updates one or more of the workspace's dependencies with
// `bun update`, but audits the resolved versions for known vulnerabilities
// before they ever reach node_modules. The dependency graph is resolved
// first with `bun update --lockfile-only`, audited in place, and rolled back
// if it's found unsafe — so a blocked update never leaves package.json or
// the lockfile bumped.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use clap::Args;

use crate::commands::install;
use crate::commands::security_check::{self, SecurityAudit, Severity};
use crate::utils::{
    Loader, LoaderGroup, Spinner, current_dir, ensure_bin, error, step, success, warn,
};

const AUDIT_CACHE_PATH: &str = "var/cache/security/update-audit.json";

/// Files captured before `bun update --lockfile-only` resolves target
/// versions, so a blocked update can be rolled back cleanly.
const RESTORE_CANDIDATES: [&str; 4] =
    ["package.json", "bun.lock", "bun.lockb", "package-lock.json"];

#[derive(Args, Debug)]
pub struct UpdateArgs {
    /// Dependencies to update, comma-separated (updates every dependency when omitted).
    #[arg(long)]
    pub deps: Option<String>,

    /// Update to the latest version, ignoring the range in package.json.
    #[arg(long, default_value_t = false)]
    pub latest: bool,

    /// Update anyway even when the audit finds vulnerable dependencies.
    #[arg(long, default_value_t = false)]
    pub force: bool,

    /// Minimum severity that blocks the update (low, moderate, high, critical). Defaults to high.
    #[arg(long = "audit-level")]
    pub audit_level: Option<String>,

    /// Skip the vulnerability audit and update directly.
    #[arg(long = "skip-audit", default_value_t = false)]
    pub skip_audit: bool,

    /// Bypass the cached audit result and re-query OSV.dev.
    #[arg(long = "no-cache", default_value_t = false)]
    pub no_cache: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &UpdateArgs) {
    if !execute(args) {
        std::process::exit(1);
    }
}

/// Audits and updates the workspace's dependencies, returning whether it
/// succeeded.
pub fn execute(args: &UpdateArgs) -> bool {
    let root = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);

    if !ensure_bin("bun") {
        return false;
    }

    let steps = if args.skip_audit { 1 } else { 3 };
    let loader = Loader::start(vec![LoaderGroup::new("Update", steps)]);

    if !args.skip_audit {
        let snapshot = snapshot_files(&root);

        if !resolve_lockfile_only(&root, args, &loader) {
            return false;
        }

        if !audit_and_gate(&root, args, &loader, &snapshot) {
            return false;
        }
    }

    loader.pause();
    let status = if args.skip_audit {
        step("Updating dependencies");
        bun_update_command(&root, args).status()
    } else {
        step("Installing updated dependencies");
        Command::new("bun")
            .arg("install")
            .current_dir(&root)
            .status()
    };
    loader.resume();
    loader.advance(0);
    loader.stop();

    let program = if args.skip_audit {
        "bun update"
    } else {
        "bun install"
    };
    match status {
        Ok(status) if status.success() => {
            success("Dependencies updated");
            true
        }
        Ok(status) => {
            error(format!(
                "{program} failed (exit code: {})",
                status.code().unwrap_or(-1)
            ));
            false
        }
        Err(err) => {
            error(format!("Failed to run {program}: {err}"));
            false
        }
    }
}

fn bun_update_command(root: &Path, args: &UpdateArgs) -> Command {
    let mut command = Command::new("bun");
    command.arg("update").current_dir(root);
    if args.latest {
        command.arg("--latest");
    }
    command.args(split_deps(args.deps.as_deref()));
    command
}

/// Splits the `--deps` flag into individual package names.
pub fn split_deps(value: Option<&str>) -> Vec<String> {
    value
        .map(|deps| {
            deps.split(',')
                .map(|dep| dep.trim().to_string())
                .filter(|dep| !dep.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// Resolves the target dependency graph into package.json and the lockfile
/// without installing anything, so it can be audited before it's applied.
fn resolve_lockfile_only(root: &Path, args: &UpdateArgs, loader: &Loader) -> bool {
    loader.pause();
    let spinner = Spinner::start("Resolving updated dependency graph");
    let mut command = bun_update_command(root, args);
    let resolved = command.arg("--lockfile-only").output();
    spinner.stop();
    loader.resume();
    loader.advance(0);

    match resolved {
        Ok(output) if output.status.success() => true,
        Ok(output) => {
            error("Failed to resolve updated dependencies");
            let combined = format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            if !combined.trim().is_empty() {
                eprintln!("{}", combined.trim_end());
            }
            false
        }
        Err(err) => {
            error(format!(
                "Failed to run \"bun update --lockfile-only\": {err}"
            ));
            false
        }
    }
}

/// Audits the just-resolved dependency graph and reports whether the update
/// should proceed, rolling package.json and the lockfile back to their
/// pre-resolve state when it's blocked.
fn audit_and_gate(
    root: &Path,
    args: &UpdateArgs,
    loader: &Loader,
    snapshot: &[(PathBuf, Option<Vec<u8>>)],
) -> bool {
    let min_severity = args
        .audit_level
        .as_deref()
        .map(Severity::from_label)
        .unwrap_or(Severity::High);

    let Some(audit) = load_or_run_audit(root, args, min_severity.label(), loader) else {
        if args.force {
            warn("Could not complete the vulnerability audit — updating anyway (--force)");
            return true;
        }
        restore_files(snapshot);
        error("Could not complete the vulnerability audit — rerun with --force to update anyway");
        return false;
    };

    loader.pause();
    install::print_audit_report(&audit);

    if audit.findings.is_empty() {
        success("No known vulnerabilities found");
        loader.resume();
        return true;
    }

    if args.force {
        warn(format!(
            "{} vulnerabilit{} found — updating anyway (--force)",
            audit.findings.len(),
            if audit.findings.len() == 1 {
                "y"
            } else {
                "ies"
            }
        ));
        loader.resume();
        return true;
    }

    restore_files(snapshot);
    error("Update blocked — vulnerable dependencies found (use --force to update anyway)");
    false
}

/// Reuses a fresh cached audit for the same resolved lockfile and audit
/// level when available, otherwise queries OSV.dev and caches the result.
fn load_or_run_audit(
    root: &Path,
    args: &UpdateArgs,
    audit_level: &str,
    loader: &Loader,
) -> Option<SecurityAudit> {
    let cache_path = root.join(AUDIT_CACHE_PATH);
    let lockfile_hash = install::hash_lockfile(root);

    if !args.no_cache
        && let Some(hash) = lockfile_hash.as_deref()
        && let Some(cached) = install::read_cache(&cache_path, hash, audit_level)
    {
        loader.advance(0);
        return Some(cached);
    }

    loader.pause();
    let spinner = Spinner::start("Auditing updated dependencies for known vulnerabilities");
    let audit = security_check::audit(root, None, None, Some(audit_level));
    spinner.stop();
    loader.resume();
    loader.advance(0);

    let audit = match audit {
        Ok(audit) => audit,
        Err(message) if message.is_empty() => SecurityAudit::default(),
        Err(message) => {
            error(message);
            return None;
        }
    };

    if let Some(hash) = lockfile_hash.as_deref() {
        install::write_cache(&cache_path, hash, audit_level, &audit);
    }

    Some(audit)
}

/// Captures the current bytes of every file `bun update --lockfile-only`
/// might touch, so a blocked update can restore the pre-resolve state.
pub fn snapshot_files(root: &Path) -> Vec<(PathBuf, Option<Vec<u8>>)> {
    RESTORE_CANDIDATES
        .iter()
        .map(|name| {
            let path = root.join(name);
            let bytes = fs::read(&path).ok();
            (path, bytes)
        })
        .collect()
}

/// Restores files to their captured state, removing any that didn't exist
/// beforehand (e.g. a lockfile format bun switched to during resolution).
pub fn restore_files(snapshot: &[(PathBuf, Option<Vec<u8>>)]) {
    for (path, bytes) in snapshot {
        match bytes {
            Some(bytes) => {
                let _ = fs::write(path, bytes);
            }
            None => {
                let _ = fs::remove_file(path);
            }
        }
    }
}
