use std::io::{BufRead, BufReader, Read};
use std::sync::mpsc::{self, Sender};
use std::thread;
use std::time::Duration;

use console::{Term, style};
use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};

use super::style::{Spinner, error, success};

/// How a process should be labelled in front of every output line.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrefixStyle {
    /// No prefix at all (equivalent to concurrently's `none`).
    None,
    /// The command's position among all commands, e.g. `[0]`.
    Index,
    /// The command's process id, e.g. `[12345]`.
    Pid,
    /// The command's name, e.g. `[api]`.
    Name,
    /// The (truncated) command line, e.g. `[bun run de…]`.
    Command,
}

/// Color used for a command's prefix.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrefixColor {
    /// Automatically pick a color based on the command index.
    Auto,
    Cyan,
    Magenta,
    Green,
    Yellow,
    Blue,
    Red,
    Gray,
}

/// Once the first command exits with one of these statuses, the remaining
/// commands are killed. Mirrors concurrently's `killOthersOn`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KillCondition {
    Success,
    Failure,
}

/// Condition that determines whether the whole run is considered successful.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SuccessCondition {
    /// Only the first command to exit determines success.
    First,
    /// Only the last command to exit determines success.
    Last,
    /// Every command must exit successfully.
    All,
}

/// Optional spinner shown while commands boot, replaced by a success message
/// as soon as the first line of output arrives (or all commands finish).
#[derive(Debug, Clone)]
pub struct StartupNotice {
    pub starting_label: String,
    pub started_message: String,
}

/// A single command to run concurrently.
pub struct ConcurrentCommand {
    name: String,
    command_line: String,
    color: PrefixColor,
    factory: Box<dyn Fn() -> CommandBuilder + Send>,
}

impl ConcurrentCommand {
    /// Creates a command. `factory` is called every time the command needs to
    /// be spawned, which allows the process to be restarted.
    pub fn new(
        name: impl Into<String>,
        command_line: impl Into<String>,
        factory: impl Fn() -> CommandBuilder + Send + 'static,
    ) -> Self {
        Self {
            name: name.into(),
            command_line: command_line.into(),
            color: PrefixColor::Auto,
            factory: Box::new(factory),
        }
    }

    pub fn with_color(mut self, color: PrefixColor) -> Self {
        self.color = color;
        self
    }
}

/// Options controlling how commands are run and reported.
pub struct ConcurrentlyOptions {
    pub prefix: PrefixStyle,
    pub prefix_length: usize,
    pub raw: bool,
    pub kill_others_on: Vec<KillCondition>,
    pub success_condition: SuccessCondition,
    pub restart_tries: u32,
    pub restart_delay: Duration,
    pub startup: Option<StartupNotice>,
}

impl Default for ConcurrentlyOptions {
    fn default() -> Self {
        Self {
            prefix: PrefixStyle::Name,
            prefix_length: 10,
            raw: false,
            kill_others_on: Vec::new(),
            success_condition: SuccessCondition::All,
            restart_tries: 0,
            restart_delay: Duration::from_millis(0),
            startup: None,
        }
    }
}

/// Information about a command's termination.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CloseEvent {
    pub name: String,
    pub index: usize,
    pub exit_code: i32,
    pub killed: bool,
}

/// Result of a concurrent run.
#[derive(Debug, Clone)]
pub struct ConcurrentlyOutcome {
    pub events: Vec<CloseEvent>,
    pub success: bool,
    pub exit_code: i32,
}

enum LogEvent {
    Line { index: usize, text: String },
}

struct RunningCommand {
    index: usize,
    name: String,
    command_line: String,
    color: PrefixColor,
    pid: Option<u32>,
    restarts_left: u32,
    child: Box<dyn Child + Send + Sync>,
    #[allow(dead_code)]
    master: Box<dyn MasterPty + Send>,
}

fn pty_size() -> PtySize {
    let (rows, cols) = Term::stdout().size();
    PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }
}

fn forward_stream<R: Read + Send + 'static>(index: usize, reader: R, sender: Sender<LogEvent>) {
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

fn spawn_process(
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
fn truncate_command(command_line: &str, prefix_length: usize) -> String {
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

fn colorize(color: PrefixColor, index: usize, text: &str) -> String {
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

fn print_line(options: &ConcurrentlyOptions, command: &RunningCommand, text: &str) {
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

fn find_command(running: &[RunningCommand], index: usize) -> Option<&RunningCommand> {
    running.iter().find(|command| command.index == index)
}

/// Determines whether a completed run should be considered successful.
/// Exposed for testing.
pub fn run_is_successful(condition: SuccessCondition, events: &[CloseEvent]) -> bool {
    let is_ok = |event: &CloseEvent| event.exit_code == 0 && !event.killed;
    match condition {
        SuccessCondition::First => events.first().is_some_and(is_ok),
        SuccessCondition::Last => events.last().is_some_and(is_ok),
        SuccessCondition::All => !events.is_empty() && events.iter().all(is_ok),
    }
}

/// Returns whether other commands should be killed given the exit result of a
/// finished command. Exposed for testing.
pub fn should_kill_others(options: &ConcurrentlyOptions, exit_ok: bool) -> bool {
    let condition = if exit_ok {
        KillCondition::Success
    } else {
        KillCondition::Failure
    };
    options.kill_others_on.contains(&condition)
}

/// Runs the given commands concurrently, streaming their prefixed output, and
/// returns once the run finishes according to `options`.
pub fn run(commands: Vec<ConcurrentCommand>, options: ConcurrentlyOptions) -> ConcurrentlyOutcome {
    if commands.is_empty() {
        return ConcurrentlyOutcome {
            events: Vec::new(),
            success: true,
            exit_code: 0,
        };
    }

    let pty_system = native_pty_system();
    let size = pty_size();
    let (sender, receiver) = mpsc::channel::<LogEvent>();

    let mut factories: Vec<Box<dyn Fn() -> CommandBuilder + Send>> = Vec::new();
    let mut running: Vec<RunningCommand> = Vec::new();

    for (index, command) in commands.into_iter().enumerate() {
        let builder = (command.factory)();
        match spawn_process(&*pty_system, size, builder, index, sender.clone()) {
            Ok((child, master)) => {
                let pid = child.process_id();
                factories.push(command.factory);
                running.push(RunningCommand {
                    index,
                    name: command.name,
                    command_line: command.command_line,
                    color: command.color,
                    pid,
                    restarts_left: options.restart_tries,
                    child,
                    master,
                });
            }
            Err(message) => {
                error(format!("Failed to start {}: {message}", command.name));
                for mut running_command in running {
                    let _ = running_command.child.kill();
                }
                return ConcurrentlyOutcome {
                    events: Vec::new(),
                    success: false,
                    exit_code: 1,
                };
            }
        }
    }

    let mut spinner = options
        .startup
        .as_ref()
        .map(|notice| Spinner::start(format!("{}...", notice.starting_label)));
    let mut events: Vec<CloseEvent> = Vec::new();
    let mut killed_others = false;

    loop {
        while let Ok(LogEvent::Line { index, text }) = receiver.try_recv() {
            if let Some(active) = spinner.take() {
                active.stop();
                if let Some(notice) = &options.startup {
                    success(&notice.started_message);
                }
            }
            if let Some(command) = find_command(&running, index) {
                print_line(&options, command, &text);
            }
        }

        let mut terminated: Option<(usize, i32, bool)> = None;
        let mut position = 0;
        while position < running.len() {
            match running[position].child.try_wait() {
                Ok(Some(status)) => {
                    terminated = Some((position, status.exit_code() as i32, status.success()));
                    break;
                }
                Ok(None) => position += 1,
                Err(err) => {
                    error(format!(
                        "Failed while waiting for {}: {err}",
                        running[position].name
                    ));
                    terminated = Some((position, 1, false));
                    break;
                }
            }
        }

        if let Some((position, exit_code, exit_ok)) = terminated {
            if !exit_ok
                && running[position].restarts_left > 0
                && !should_kill_others(&options, exit_ok)
            {
                running[position].restarts_left -= 1;
                if !options.restart_delay.is_zero() {
                    thread::sleep(options.restart_delay);
                }
                let index = running[position].index;
                let builder = (factories[index])();
                match spawn_process(&*pty_system, size, builder, index, sender.clone()) {
                    Ok((child, master)) => {
                        running[position].pid = child.process_id();
                        running[position].child = child;
                        running[position].master = master;
                        continue;
                    }
                    Err(message) => {
                        error(format!(
                            "Failed to restart {}: {message}",
                            running[position].name
                        ));
                    }
                }
            }

            let command = running.remove(position);
            if !exit_ok {
                if let Some(active) = spinner.take() {
                    active.stop();
                }
                error(format!("{} exited with code {exit_code}", command.name));
            }
            events.push(CloseEvent {
                name: command.name,
                index: command.index,
                exit_code,
                killed: false,
            });

            if should_kill_others(&options, exit_ok) {
                if let Some(active) = spinner.take() {
                    active.stop();
                }
                for mut other in running.drain(..) {
                    let _ = other.child.kill();
                    events.push(CloseEvent {
                        name: other.name,
                        index: other.index,
                        exit_code: 1,
                        killed: true,
                    });
                }
                killed_others = true;
            }
        }

        if running.is_empty() {
            break;
        }

        thread::sleep(Duration::from_millis(60));
    }

    while let Ok(LogEvent::Line { index, text }) = receiver.try_recv() {
        if let Some(command) = events.iter().find(|event| event.index == index) {
            let text = text.trim_end_matches('\r');
            if options.raw || options.prefix == PrefixStyle::None {
                println!("{text}");
            } else if let Some(label) = prefix_label(
                options.prefix,
                command.index,
                &command.name,
                "",
                None,
                options.prefix_length,
            ) {
                println!("{}", format_args!("{label} {text}"));
            }
        }
    }

    let success_run = run_is_successful(options.success_condition, &events);

    if let Some(active) = spinner.take() {
        active.stop();
        if success_run
            && !killed_others
            && let Some(notice) = &options.startup
        {
            success(&notice.started_message);
        }
    }

    let exit_code = if success_run {
        0
    } else {
        events
            .iter()
            .find(|event| event.exit_code != 0 && !event.killed)
            .map(|event| event.exit_code)
            .unwrap_or(1)
    };

    ConcurrentlyOutcome {
        events,
        success: success_run,
        exit_code,
    }
}
