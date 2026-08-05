use std::path::{Path, PathBuf};
use std::process::Command;

use clap::Args;
use serde_json::Value;

use crate::utils::{Spinner, current_dir, run_spinner_step};

const CLI_PACKAGE_NAME: &str = "@talos/cli";
const LATEST_RELEASE_URL: &str = "https://api.github.com/repos/ooneex/talos/releases/latest";
const INSTALL_SH_URL: &str =
    "https://raw.githubusercontent.com/ooneex/talos/main/packages/cli/scripts/install.sh";
const INSTALL_PS1_URL: &str =
    "https://raw.githubusercontent.com/ooneex/talos/main/packages/cli/scripts/install.ps1";
const RELEASE_URL_ENV: &str = "TALOS_LATEST_RELEASE_URL";
const INSTALL_SH_URL_ENV: &str = "TALOS_INSTALL_SH_URL";
const INSTALL_PS1_URL_ENV: &str = "TALOS_INSTALL_PS1_URL";

#[derive(Args, Debug)]
pub struct UpgradeArgs {
    #[arg(long)]
    pub cwd: Option<String>,
}

// The binary is distributed via GitHub releases (see scripts/install.sh), not
// npm, so the latest version is resolved from the newest GitHub release tag.
fn fetch_latest_version() -> Option<String> {
    let value: Value = ureq::get(&release_url())
        .header("accept", "application/vnd.github+json")
        .header("user-agent", CLI_PACKAGE_NAME)
        .call()
        .ok()?
        .into_body()
        .read_json()
        .ok()?;
    parse_latest_version_value(&value)
}

// Release tags look like `@talos/cli@1.2.3` (optionally `v`-prefixed); keep
// only the semver part.
pub fn parse_version_from_tag(tag: &str) -> String {
    tag.rsplit('@')
        .next()
        .unwrap_or(tag)
        .trim_start_matches('v')
        .to_string()
}

pub fn parse_latest_version_value(value: &Value) -> Option<String> {
    let tag = value.get("tag_name").and_then(Value::as_str)?;
    Some(parse_version_from_tag(tag))
}

fn release_url() -> String {
    std::env::var(RELEASE_URL_ENV).unwrap_or_else(|_| LATEST_RELEASE_URL.to_string())
}

fn install_sh_url() -> String {
    std::env::var(INSTALL_SH_URL_ENV).unwrap_or_else(|_| INSTALL_SH_URL.to_string())
}

fn install_ps1_url() -> String {
    std::env::var(INSTALL_PS1_URL_ENV).unwrap_or_else(|_| INSTALL_PS1_URL.to_string())
}

pub fn build_install_command(cwd: &Path) -> Command {
    let mut command = if cfg!(windows) {
        let mut command = Command::new("powershell");
        command.args([
            "-NoProfile",
            "-Command",
            &format!("irm {} | iex", install_ps1_url()),
        ]);
        command
    } else {
        let mut command = Command::new("bash");
        command.args(["-c", &format!("curl -fsSL {} | bash", install_sh_url())]);
        command
    };
    command.current_dir(cwd);
    command
}

pub fn manual_install_command() -> String {
    if cfg!(windows) {
        format!("powershell -c \"irm {} | iex\"", install_ps1_url())
    } else {
        format!("curl -fsSL {} | bash", install_sh_url())
    }
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
    let mut install_command = build_install_command(&cwd);
    let succeeded = run_spinner_step(
        false,
        &format!("Upgrading from v{current_version} to v{latest_version}"),
        &mut install_command,
    );
    if !succeeded {
        crate::utils::error(format!(
            "Upgrade failed. You can upgrade manually with: {}",
            manual_install_command()
        ));
        return;
    }
    crate::utils::success(format!("Upgraded to v{latest_version}"));
}
