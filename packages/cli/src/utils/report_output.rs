//! `--output` — the file a check leaves behind for an agent to work from.
//!
//! `check` and `project:check` both print a report meant for someone watching
//! the terminal, and both can be asked for the same report as a file instead:
//! markdown to hand an AI agent as a prompt, or JSON for something that parses
//! before it reads. What each one writes is its own — this is only where they
//! agree: the formats the flag accepts, the directory the file lands in, and
//! what the terminal says about it afterwards.

use std::fs;
use std::path::{Path, PathBuf};

use clap::ValueEnum;

use super::style::{error, info, success, warn};

/// Where a report is written, relative to the workspace root.
pub const OUTPUT_DIR: &str = "var/outputs";

/// The format `--output` writes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, ValueEnum)]
pub enum OutputFormat {
    /// Markdown — the report an agent is handed as a prompt.
    Md,
    /// JSON — the same report, for something that parses it first.
    Json,
}

impl OutputFormat {
    pub fn extension(self) -> &'static str {
        match self {
            OutputFormat::Md => "md",
            OutputFormat::Json => "json",
        }
    }

    /// `talos_check` + `md` → `talos_check.md`.
    pub fn file_name(self, stem: &str) -> String {
        format!("{stem}.{}", self.extension())
    }
}

/// Write a report under `var/outputs`, returning where it landed.
pub fn write_report_file(
    root: &Path,
    stem: &str,
    format: OutputFormat,
    content: &str,
) -> Result<PathBuf, String> {
    let dir = root.join(OUTPUT_DIR);
    fs::create_dir_all(&dir).map_err(|err| format!("Failed to create {}: {err}", dir.display()))?;

    let path = dir.join(format.file_name(stem));
    fs::write(&path, content)
        .map_err(|err| format!("Failed to write {}: {err}", path.display()))?;
    Ok(path)
}

/// Say where the report landed, or why it could not be written.
///
/// A report that could not be written is a warning rather than a failure: the
/// verdict is about the workspace, not about a file the run was asked to leave
/// behind, and the console has already carried every finding.
///
/// `quiet` is for the caller holding stdout for a payload of its own —
/// `project:check --json`, where a line printed beside the JSON would break
/// whatever is parsing it. A failure is still reported there, on stderr.
pub fn announce_report_file(written: Result<PathBuf, String>, quiet: bool) {
    match written {
        Ok(_) if quiet => {}
        Ok(path) => {
            println!();
            success(format!("Report written to {}", path.display()));
            info("Hand this file to an AI agent to fix what it lists");
        }
        Err(message) if quiet => error(message),
        Err(message) => warn(message),
    }
}
