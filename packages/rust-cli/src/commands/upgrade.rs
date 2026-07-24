use std::path::PathBuf;
use std::process::Command;

use clap::Args;
use serde_json::Value;

use crate::commands::{completion_bash, completion_fish, completion_zsh};
use crate::utils::{Spinner, current_dir, run_spinner_step};

const CLI_PACKAGE_NAME: &str = "@talosjs/cli";

#[derive(Args, Debug)]
pub struct UpgradeArgs {
    #[arg(long)]
    pub cwd: Option<String>,
}

fn fetch_latest_version() -> Option<String> {
    let value: Value = ureq::get(&format!(
        "https://registry.npmjs.org/{CLI_PACKAGE_NAME}/latest"
    ))
    .set("accept", "application/json")
    .call()
    .ok()?
    .into_json()
    .ok()?;
    value
        .get("version")
        .and_then(Value::as_str)
        .map(str::to_string)
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
    let succeeded = run_spinner_step(
        false,
        &format!("Upgrading from v{current_version} to v{latest_version}"),
        Command::new("bun")
            .args(["add", "-g", &format!("{CLI_PACKAGE_NAME}@latest")])
            .current_dir(&cwd),
    );
    if !succeeded {
        crate::utils::error(format!(
            "Upgrade failed. You can upgrade manually with: bun add -g {CLI_PACKAGE_NAME}@latest"
        ));
        return;
    }
    crate::utils::success(format!("Upgraded to v{latest_version}"));
    let shell = std::env::var("SHELL")
        .ok()
        .and_then(|shell| {
            std::path::Path::new(&shell)
                .file_name()
                .and_then(|name| name.to_str())
                .map(str::to_string)
        })
        .unwrap_or_default();
    match shell.as_str() {
        "zsh" => completion_zsh::run(&completion_zsh::CompletionZshArgs {}),
        "bash" => completion_bash::run(&completion_bash::CompletionBashArgs {}),
        "fish" => completion_fish::run(&completion_fish::CompletionFishArgs {}),
        _ => crate::utils::info(
            "Could not detect your shell; run `talosrs completion:zsh`, `talosrs completion:bash`, or `talosrs completion:fish` to refresh completions.",
        ),
    }
}
