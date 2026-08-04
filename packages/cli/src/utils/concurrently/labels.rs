// Process spawning over a pty, and the prefix-label/color rendering for
// each command's output lines — split out of the parent module to keep
// it under the file-size budget.

use std::io::{BufRead, BufReader, Read};
use std::sync::mpsc::Sender;
use std::thread;

use console::{Term, style};
use portable_pty::{Child, CommandBuilder, MasterPty, PtySize};

use super::{ConcurrentlyOptions, LogEvent, PrefixColor, PrefixStyle, RunningCommand};

pub(super) fn pty_size() -> PtySize {
    let (rows, cols) = Term::stdout().size();
    PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }
}

pub(super) fn forward_stream<R: Read + Send + 'static>(
    index: usize,
    reader: R,
    sender: Sender<LogEvent>,
) {
    thread::spawn(move || {
        let buffered = BufReader::new(reader);
        for line in buffered.lines().map_while(Result::ok) {
            if sender.send(LogEvent::Line { index, text: line }).is_err() {
                break;
            }
        }
    });
}

type SpawnedProcess = (Box<dyn Child + Send + Sync>, Box<dyn MasterPty + Send>);

pub(super) fn spawn_process(
    pty_system: &dyn portable_pty::PtySystem,
    size: PtySize,
    command: CommandBuilder,
    index: usize,
    sender: Sender<LogEvent>,
) -> Result<SpawnedProcess, String> {
    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|e| e.to_string())?;
    drop(pair.slave);
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    forward_stream(index, reader, sender);
    Ok((child, pair.master))
}

/// Truncates a command line for the `command` prefix style.
pub fn truncate_command(command_line: &str, prefix_length: usize) -> String {
    if prefix_length == 0 || command_line.chars().count() <= prefix_length {
        return command_line.to_string();
    }
    let kept = prefix_length.saturating_sub(1).max(1);
    let truncated: String = command_line.chars().take(kept).collect();
    format!("{truncated}…")
}

/// Builds the plain (uncolored) prefix label for a command, or `None` when no
/// prefix should be shown. Exposed for testing.
pub fn prefix_label(
    style: PrefixStyle,
    index: usize,
    name: &str,
    command_line: &str,
    pid: Option<u32>,
    prefix_length: usize,
) -> Option<String> {
    match style {
        PrefixStyle::None => None,
        PrefixStyle::Index => Some(format!("[{index}]")),
        PrefixStyle::Pid => Some(format!("[{}]", pid.unwrap_or(0))),
        PrefixStyle::Name => Some(format!("[{name}]")),
        PrefixStyle::Command => Some(format!(
            "[{}]",
            truncate_command(command_line, prefix_length)
        )),
    }
}

pub fn colorize(color: PrefixColor, index: usize, text: &str) -> String {
    let base = style(text).bold();
    let resolved = match color {
        PrefixColor::Auto => match index % 6 {
            0 => PrefixColor::Cyan,
            1 => PrefixColor::Magenta,
            2 => PrefixColor::Green,
            3 => PrefixColor::Yellow,
            4 => PrefixColor::Blue,
            _ => PrefixColor::Red,
        },
        other => other,
    };
    let styled = match resolved {
        PrefixColor::Cyan => base.cyan(),
        PrefixColor::Magenta => base.magenta(),
        PrefixColor::Green => base.green(),
        PrefixColor::Yellow => base.yellow(),
        PrefixColor::Blue => base.blue(),
        PrefixColor::Red => base.red(),
        PrefixColor::Gray => base.color256(8),
        PrefixColor::Auto => base,
    };
    styled.to_string()
}

pub(super) fn print_line(options: &ConcurrentlyOptions, command: &RunningCommand, text: &str) {
    let text = text.trim_end_matches('\r');
    if options.raw {
        println!("{text}");
        return;
    }
    match prefix_label(
        options.prefix,
        command.index,
        &command.name,
        &command.command_line,
        command.pid,
        options.prefix_length,
    ) {
        Some(label) => println!("{} {text}", colorize(command.color, command.index, &label)),
        None => println!("{text}"),
    }
}

pub(super) fn find_command(running: &[RunningCommand], index: usize) -> Option<&RunningCommand> {
    running.iter().find(|command| command.index == index)
}
