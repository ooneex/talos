use std::path::PathBuf;
use std::process::Command;

use clap::Args;
use serde_json::Value;

use crate::commands::{completion_bash, completion_fish, completion_zsh};
use crate::utils::current_dir;

const CLI_PACKAGE_NAME: &str = "@talosjs/cli";

/// Rust port of `packages/cli/src/commands/UpgradeCommand.ts`.
#[derive(Args, Debug)]
pub struct UpgradeArgs {
    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

fn fetch_latest_version() -> Option<String> {
    let output = Command::new("curl")
        .args([
            "-sS",
            "-H",
            "accept: application/json",
            &format!("https://registry.npmjs.org/{CLI_PACKAGE_NAME}/latest"),
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value: Value = serde_json::from_slice(&output.stdout).ok()?;
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
    let Some(latest_version) = fetch_latest_version() else {
        eprintln!("✖ Unable to determine the latest version for {CLI_PACKAGE_NAME}");
        std::process::exit(1);
    };
    if current_version == latest_version {
        println!("✔ Already on the latest version (v{current_version})");
        return;
    }
    println!("Upgrading from v{current_version} to v{latest_version}...");
    let succeeded = Command::new("bun")
        .args(["add", "-g", &format!("{CLI_PACKAGE_NAME}@latest")])
        .current_dir(&cwd)
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !succeeded {
        eprintln!(
            "✖ Upgrade failed. You can upgrade manually with: bun add -g {CLI_PACKAGE_NAME}@latest"
        );
        return;
    }
    println!("✔ Upgraded to v{latest_version}");
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
        _ => println!(
            "→ Could not detect your shell; run `talosrs completion:zsh`, `talosrs completion:bash`, or `talosrs completion:fish` to refresh completions."
        ),
    }
}
