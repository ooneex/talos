//! Forwarding a module's script output line by line while it runs.
//!
//! The scripts report one line per file — `✔ 20240101120000  12ms`, `✔
//! UserSeed  up to date (cached)` — and a module can carry dozens of them.
//! Waiting for the module to end before showing any of that says nothing about
//! where a slow run actually is, so every line is printed as it arrives, above
//! the loader, and kept for the report all the same.

use std::io::{BufRead, BufReader, Read};
use std::process::{Command, ExitStatus, Stdio};
use std::sync::mpsc::{Sender, channel};
use std::thread::{self, JoinHandle};

use console::style;

use super::super::Loader;

/// Run the command with its output piped, printing every line it writes and
/// returning how it exited alongside everything it printed.
///
/// `label` names the module the lines belong to, padded to `width` so a run's
/// log reads as one column whichever module is talking.
pub(super) fn run_streamed(
    command: &mut Command,
    label: &str,
    width: usize,
    loader: &Loader,
) -> std::io::Result<(ExitStatus, String)> {
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    // Both pipes are drained on their own thread: a script that fills one while
    // the reader is blocked on the other would deadlock.
    let (sender, receiver) = channel::<String>();
    let mut readers: Vec<JoinHandle<()>> = Vec::new();
    if let Some(stdout) = child.stdout.take() {
        readers.push(forward(stdout, sender.clone()));
    }
    if let Some(stderr) = child.stderr.take() {
        readers.push(forward(stderr, sender.clone()));
    }
    // The receiver ends when the last sender goes, so the one kept here must
    // not outlive the threads holding the clones.
    std::mem::drop(sender);

    let mut output = String::new();
    for line in receiver {
        output.push_str(&line);
        output.push('\n');
        if !line.trim().is_empty() {
            loader.log(entry(label, width, &line));
        }
    }
    for reader in readers {
        let _ = reader.join();
    }

    Ok((child.wait()?, output))
}

/// `  modules/user  ✔ 20240101120000  12ms` — one printed line, under the
/// module that wrote it.
fn entry(label: &str, width: usize, line: &str) -> String {
    format!(
        "  {}  {}",
        style(format!("{label:<width$}")).dim(),
        line.trim_end()
    )
}

/// Read one pipe to its end, sending a line at a time.
fn forward<R: Read + Send + 'static>(reader: R, sender: Sender<String>) -> JoinHandle<()> {
    thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            if sender.send(line).is_err() {
                break;
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::Loader;

    #[test]
    fn entry_pads_the_label_and_trims_the_line() {
        let printed = entry("modules/user", 16, "✔ 20240101120000  12ms\r");

        assert!(printed.contains("modules/user"));
        assert!(printed.ends_with("12ms"));
    }

    #[test]
    fn run_streamed_collects_every_line_and_the_exit_status() {
        let mut command = Command::new("sh");
        command.args(["-c", "echo first; echo second >&2; exit 3"]);

        let (status, output) =
            run_streamed(&mut command, "modules/user", 12, &Loader::hidden()).unwrap();

        assert_eq!(status.code(), Some(3));
        assert!(output.contains("first"));
        assert!(output.contains("second"));
    }

    #[test]
    fn run_streamed_reports_a_command_that_cannot_start() {
        let mut command = Command::new("talos-no-such-binary");

        assert!(run_streamed(&mut command, "modules/user", 12, &Loader::hidden()).is_err());
    }
}
