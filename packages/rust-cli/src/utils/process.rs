//! Subprocess helpers, mirroring `packages/cli/src/utils.ts`'s `ensureBin` and
//! `spawnStep`.

use std::process::Command;

/// Mirrors `ensureBin`: checks a binary is reachable on the `PATH`.
pub fn ensure_bin(bin: &str) -> bool {
    let available = Command::new(bin)
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);

    if !available {
        super::style::error(format!(
            "\"{bin}\" is required but was not found on the PATH"
        ));
    }

    available
}

/// Mirrors `spawnStep`: runs a command, optionally announcing it, and reports
/// failures uniformly.
pub fn run_step(silent: bool, start_message: &str, command: &mut Command) -> bool {
    if !silent {
        println!("{start_message}");
    }

    match command.status() {
        Ok(status) if status.success() => true,
        Ok(status) => {
            super::style::error(format!(
                "Failed (exit code: {})",
                status.code().unwrap_or(-1)
            ));
            false
        }
        Err(error) => {
            super::style::error(format!("Failed to run command: {error}"));
            false
        }
    }
}
