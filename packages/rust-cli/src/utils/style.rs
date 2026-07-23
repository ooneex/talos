//! Colorized console output, mirroring the level colors/symbols used by
//! `packages/logger/src/TerminalLogger.ts` (`✔` green success, `✖` red error,
//! `⚠` yellow warn, `→`/`▸` blue/cyan informational steps). Built on top of
//! the `console` crate, which `dialoguer`'s `ColorfulTheme` already pulls in,
//! so prompts and status messages share one consistent, `NO_COLOR`-aware
//! terminal styling stack.

use console::style;

/// Prints a green `✔ message` success line to stdout.
pub fn success(message: impl AsRef<str>) {
    println!(
        "{} {}",
        style("✔").green().bold(),
        style(message.as_ref()).green()
    );
}

/// Prints a red `✖ message` error line to stderr.
pub fn error(message: impl AsRef<str>) {
    eprintln!(
        "{} {}",
        style("✖").red().bold(),
        style(message.as_ref()).red()
    );
}

/// Prints a yellow `⚠ message` warning line to stdout.
pub fn warn(message: impl AsRef<str>) {
    println!(
        "{} {}",
        style("⚠").yellow().bold(),
        style(message.as_ref()).yellow()
    );
}

/// Prints a blue `→ message` informational line to stdout.
pub fn info(message: impl AsRef<str>) {
    println!(
        "{} {}",
        style("→").blue().bold(),
        style(message.as_ref()).blue()
    );
}

/// Prints a cyan `▸ message` step/progress line to stdout.
pub fn step(message: impl AsRef<str>) {
    println!(
        "{} {}",
        style("▸").cyan().bold(),
        style(message.as_ref()).cyan()
    );
}
