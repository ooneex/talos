use std::path::PathBuf;
use std::process::Command;

use clap::Args;
use serde_json::Value;

use crate::utils::{Spinner, current_dir, run_spinner_step};

const CLI_PACKAGE_NAME: &str = "@talosjs/cli";
const LATEST_RELEASE_URL: &str = "https://api.github.com/repos/ooneex/talos/releases/latest";
const INSTALL_SH_URL: &str =
    "https://raw.githubusercontent.com/ooneex/talos/main/packages/cli/scripts/install.sh";
const INSTALL_PS1_URL: &str =
    "https://raw.githubusercontent.com/ooneex/talos/main/packages/cli/scripts/install.ps1";

#[derive(Args, Debug)]
pub struct UpgradeArgs {
    #[arg(long)]
    pub cwd: Option<String>,
}

// The binary is distributed via GitHub releases (see scripts/install.sh), not
// npm, so the latest version is resolved from the newest GitHub release tag.
fn fetch_latest_version() -> Option<String> {
    let value: Value = ureq::get(LATEST_RELEASE_URL)
        .header("accept", "application/vnd.github+json")
        .header("user-agent", CLI_PACKAGE_NAME)
        .call()
        .ok()?
        .into_body()
        .read_json()
        .ok()?;
    let tag = value.get("tag_name").and_then(Value::as_str)?;
    Some(parse_version_from_tag(tag))
}

// Release tags look like `@talosjs/cli@1.2.3` (optionally `v`-prefixed); keep
// only the semver part.
pub fn parse_version_from_tag(tag: &str) -> String {
    tag.rsplit('@')
        .next()
        .unwrap_or(tag)
        .trim_start_matches('v')
        .to_string()
}

pub fn run(args: &UpgradeArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let current_version = env!("CARGO_PKG_VERSION");
    let version_spinner = Spinner::start("Checking for updates...");
    let latest = fetch_latest_version();
    version_spinner.stop();
    let Some(latest_version) = latest else {
        crate::utils::error(format!(
            "Unable to determine the latest version for {CLI_PACKAGE_NAME}"
        ));
        std::process::exit(1);
    };
    if current_version == latest_version {
        crate::utils::success(format!(
            "Already on the latest version (v{current_version})"
        ));
        return;
    }
    let mut install_command = if cfg!(windows) {
        let mut command = Command::new("powershell");
        command.args([
            "-NoProfile",
            "-Command",
            &format!("irm {INSTALL_PS1_URL} | iex"),
        ]);
        command
    } else {
        let mut command = Command::new("bash");
        command.args(["-c", &format!("curl -fsSL {INSTALL_SH_URL} | bash")]);
        command
    };
    install_command.current_dir(&cwd);
    let succeeded = run_spinner_step(
        false,
        &format!("Upgrading from v{current_version} to v{latest_version}"),
        &mut install_command,
    );
    if !succeeded {
        let manual = if cfg!(windows) {
            format!("powershell -c \"irm {INSTALL_PS1_URL} | iex\"")
        } else {
            format!("curl -fsSL {INSTALL_SH_URL} | bash")
        };
        crate::utils::error(format!(
            "Upgrade failed. You can upgrade manually with: {manual}"
        ));
        return;
    }
    crate::utils::success(format!("Upgraded to v{latest_version}"));
}
