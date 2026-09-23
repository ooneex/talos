// `talos update` — updates one or more of the workspace's dependencies with
// `bun update`, but audits the resolved versions for known vulnerabilities
// before they ever reach node_modules. The dependency graph is resolved
// first with `bun update --lockfile-only`, audited in place, and rolled back
// if it's found unsafe — so a blocked update never leaves package.json or
// the lockfile bumped.
//
// `--logs` prints the output of every step that fails. `--output` leaves the
// same report behind as a file, for an agent to fix what it lists — see
// [`output`].

mod output;

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

use clap::Args;
use console::style;

use crate::commands::install;
use crate::commands::security_check::{self, SecurityAudit, Severity};
use crate::utils::{
    Loader, LoaderGroup, OutputFormat, Spinner, announce_agent_report, current_dir, ensure_bin,
    error, step, success, warn, write_agent_report,
};

const AUDIT_CACHE_PATH: &str = "var/cache/security/update-audit.json";

/// How many lines a failed step's output shows before it is truncated.
const LOG_TAIL_LINES: usize = 40;

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

    /// Print the output of every step that fails.
    #[arg(long, default_value_t = false)]
    pub logs: bool,

    /// Also write the report to var/outputs/talos_update.md or
    /// var/outputs/talos_update.json, in the shape an AI agent is handed to
    /// fix what it lists.
    #[arg(long, value_enum)]
    pub output: Option<OutputFormat>,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

/// How one bun step ended, kept so `--logs` and `--output` can show it after
/// the loader has stopped.
#[derive(Clone, Debug, Default)]
pub struct CommandStep {
    pub ran: bool,
    pub passed: bool,
    pub output: String,
    pub error: Option<String>,
}

/// Outcome of an update, kept free of process exits and printing so `--output`
/// can render the same run the terminal drew.
#[derive(Clone, Debug, Default)]
pub struct UpdateResult {
    pub resolve: CommandStep,
    /// `None` when `--skip-audit`. `Some(Ok)` is a completed audit (findings
    /// may still be present). `Some(Err)` is an audit that could not run.
    pub audit: Option<Result<SecurityAudit, String>>,
    /// Whether vulnerabilities blocked the update (rolled back).
    pub blocked: bool,
    /// Whether `--force` let the update proceed despite findings or a failed
    /// audit.
    pub forced: bool,
    pub apply: CommandStep,
}

impl UpdateResult {
    /// Whether the command should exit zero — the same verdict `--output`
    /// writes: the dependencies were actually updated.
    pub fn passed(&self) -> bool {
        self.apply.passed
    }
}

pub fn run(args: &UpdateArgs) {
    if !execute(args) {
        std::process::exit(1);
    }
}

/// Audits and updates the workspace's dependencies, returning whether it
/// succeeded.
pub fn execute(args: &UpdateArgs) -> bool {
    let started = Instant::now();
    let root = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);

    if !ensure_bin("bun") {
        return false;
    }

    let result = run_update(args, &root);
    let elapsed_ms = started.elapsed().as_millis() as u64;

    // The file is written after the report and never instead of it: whatever
    // it does, the terminal has already said the same thing.
    if let Some(format) = args.output {
        let report = output::report(args, &result, elapsed_ms);
        announce_agent_report(write_agent_report(&root, format, &report));
    }

    result.passed()
}

fn run_update(args: &UpdateArgs, root: &Path) -> UpdateResult {
    let steps = if args.skip_audit { 1 } else { 3 };
    let loader = Loader::start(vec![LoaderGroup::new("Update", steps)]);
    let result = run_update_steps(args, root, &loader);
    loader.stop();
    result
}

fn run_update_steps(args: &UpdateArgs, root: &Path, loader: &Loader) -> UpdateResult {
    let mut result = UpdateResult::default();

    if !args.skip_audit {
        let snapshot = snapshot_files(root);

        result.resolve = resolve_lockfile_only(root, args, loader);
        if !result.resolve.passed {
            print_failed_output(args.logs, &result.resolve);
            return result;
        }

        if !audit_and_gate(root, args, loader, &snapshot, &mut result) {
            return result;
        }
    }

    result.apply = apply_update(root, args, loader);
    if !result.apply.passed {
        print_failed_output(args.logs, &result.apply);
    }
    result
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
fn resolve_lockfile_only(root: &Path, args: &UpdateArgs, loader: &Loader) -> CommandStep {
    loader.pause();
    let spinner = Spinner::start("Resolving updated dependency graph");
    let mut command = bun_update_command(root, args);
    command.arg("--lockfile-only");
    let step = run_command(&mut command);
    spinner.stop();
    loader.resume();
    loader.advance(0);

    if step.passed {
        return step;
    }

    if let Some(message) = &step.error {
        if step.output.trim().is_empty() {
            error(format!(
                "Failed to run \"bun update --lockfile-only\": {message}"
            ));
        } else {
            error("Failed to resolve updated dependencies");
        }
    } else {
        error("Failed to resolve updated dependencies");
    }
    step
}

/// Installs the already-resolved graph, or runs `bun update` directly when
/// the audit was skipped.
fn apply_update(root: &Path, args: &UpdateArgs, loader: &Loader) -> CommandStep {
    loader.pause();
    let program = apply_program(args);
    let step_label = if args.skip_audit {
        "Updating dependencies"
    } else {
        "Installing updated dependencies"
    };
    step(step_label);
    let mut command = if args.skip_audit {
        bun_update_command(root, args)
    } else {
        let mut command = Command::new("bun");
        command.arg("install").current_dir(root);
        command
    };
    let applied = run_command(&mut command);
    loader.resume();
    loader.advance(0);

    match (&applied.error, applied.passed) {
        (_, true) => success("Dependencies updated"),
        (Some(message), false) if applied.output.trim().is_empty() => {
            error(format!("Failed to run {program}: {message}"));
        }
        (Some(message), false) => {
            error(format!("{program} failed ({message})"));
        }
        (None, false) => {
            error(format!("{program} failed"));
        }
    }
    applied
}

fn apply_program(args: &UpdateArgs) -> &'static str {
    if args.skip_audit {
        "bun update"
    } else {
        "bun install"
    }
}

fn run_command(command: &mut Command) -> CommandStep {
    match command.output() {
        Ok(output) => CommandStep {
            ran: true,
            passed: output.status.success(),
            output: format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            ),
            error: (!output.status.success())
                .then(|| format!("exit code: {}", output.status.code().unwrap_or(-1))),
        },
        Err(err) => CommandStep {
            ran: true,
            passed: false,
            output: String::new(),
            error: Some(err.to_string()),
        },
    }
}

/// The captured output of a failed step, or a pointer at `--logs` when the
/// caller only wants the reminder.
fn print_failed_output(logs: bool, step: &CommandStep) {
    if step.output.trim().is_empty() {
        return;
    }
    if !logs {
        println!("  {}", style("re-run with --logs to see the output").dim());
        return;
    }
    println!();
    for line in tail(&step.output, LOG_TAIL_LINES) {
        println!("  {}", style(line).dim());
    }
}

fn tail(output: &str, lines: usize) -> Vec<&str> {
    let all: Vec<&str> = output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    let start = all.len().saturating_sub(lines);
    all[start..].to_vec()
}

/// Audits the just-resolved dependency graph and reports whether the update
/// should proceed, rolling package.json and the lockfile back to their
/// pre-resolve state when it's blocked.
fn audit_and_gate(
    root: &Path,
    args: &UpdateArgs,
    loader: &Loader,
    snapshot: &[(PathBuf, Option<Vec<u8>>)],
    result: &mut UpdateResult,
) -> bool {
    let min_severity = args
        .audit_level
        .as_deref()
        .map(Severity::from_label)
        .unwrap_or(Severity::High);

    let audit = match load_or_run_audit(root, args, min_severity.label(), loader) {
        Ok(audit) => audit,
        Err(message) => {
            error(&message);
            result.audit = Some(Err(message));
            if args.force {
                result.forced = true;
                warn("Could not complete the vulnerability audit — updating anyway (--force)");
                return true;
            }
            restore_files(snapshot);
            error(
                "Could not complete the vulnerability audit — rerun with --force to update anyway",
            );
            return false;
        }
    };

    loader.pause();
    install::print_audit_report(&audit);

    if audit.findings.is_empty() {
        success("No known vulnerabilities found");
        result.audit = Some(Ok(audit));
        loader.resume();
        return true;
    }

    if args.force {
        let count = audit.findings.len();
        result.forced = true;
        result.audit = Some(Ok(audit));
        warn(format!(
            "{} vulnerabilit{} found — updating anyway (--force)",
            count,
            if count == 1 { "y" } else { "ies" }
        ));
        loader.resume();
        return true;
    }

    result.blocked = true;
    result.audit = Some(Ok(audit));
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
) -> Result<SecurityAudit, String> {
    let cache_path = root.join(AUDIT_CACHE_PATH);
    let lockfile_hash = install::hash_lockfile(root);

    if !args.no_cache
        && let Some(hash) = lockfile_hash.as_deref()
        && let Some(cached) = install::read_cache(&cache_path, hash, audit_level)
    {
        loader.advance(0);
        return Ok(cached);
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
        Err(message) => return Err(message),
    };

    if let Some(hash) = lockfile_hash.as_deref() {
        install::write_cache(&cache_path, hash, audit_level, &audit);
    }

    Ok(audit)
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
