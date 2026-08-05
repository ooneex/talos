use std::time::Duration;

#[cfg(test)]
use portable_pty::native_pty_system;
use portable_pty::{Child, CommandBuilder, MasterPty};

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

pub(super) enum LogEvent {
    Line { index: usize, text: String },
}

pub(super) struct RunningCommand {
    pub(super) index: usize,
    pub(super) name: String,
    pub(super) command_line: String,
    pub(super) color: PrefixColor,
    pub(super) pid: Option<u32>,
    pub(super) restarts_left: u32,
    pub(super) child: Box<dyn Child + Send + Sync>,
    pub(super) _master: Box<dyn MasterPty + Send>,
}

mod labels;
pub use labels::{colorize, prefix_label, truncate_command};
#[cfg(test)]
use labels::{forward_stream, pty_size, spawn_process};

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

mod engine;
pub use engine::run;

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use std::sync::mpsc;
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    fn quiet() -> ConcurrentlyOptions {
        ConcurrentlyOptions {
            prefix: PrefixStyle::None,
            ..ConcurrentlyOptions::default()
        }
    }

    /// A shell command pinned to a directory that is certain to outlive the run.
    ///
    /// `CommandBuilder` snapshots the environment when it is built and, with no
    /// cwd of its own, spawns the child in `$HOME`. Another test in this binary
    /// points `HOME` at a temp directory it then deletes, so a command left to
    /// pick its own directory can fail to start for reasons of its own.
    fn sh(script: &str) -> CommandBuilder {
        let mut builder = CommandBuilder::new("sh");
        builder.args(["-c", script]);
        builder.cwd(std::env::temp_dir());
        builder
    }

    fn exit_with(name: &'static str, code: u8) -> ConcurrentCommand {
        ConcurrentCommand::new(name, format!("exit {code}"), move || {
            sh(&format!("exit {code}"))
        })
    }

    #[test]
    fn pty_size_uses_zero_pixels() {
        let size = pty_size();

        assert_eq!(size.pixel_width, 0);
        assert_eq!(size.pixel_height, 0);
    }

    #[test]
    fn forward_stream_sends_each_line() {
        let (sender, receiver) = mpsc::channel();

        forward_stream(2, Cursor::new(b"first\nsecond\n".to_vec()), sender);

        assert!(matches!(
            receiver.recv_timeout(Duration::from_secs(1)).expect("first line"),
            LogEvent::Line { index: 2, text } if text == "first"
        ));
        assert!(matches!(
            receiver.recv_timeout(Duration::from_secs(1)).expect("second line"),
            LogEvent::Line { index: 2, text } if text == "second"
        ));
    }

    #[test]
    fn spawn_process_returns_an_error_for_missing_binaries() {
        let system = native_pty_system();
        let size = pty_size();
        let (sender, _receiver) = mpsc::channel();

        let result = spawn_process(
            &*system,
            size,
            CommandBuilder::new("definitely-not-a-real-binary"),
            0,
            sender,
        );

        assert!(result.is_err());
    }

    #[test]
    fn run_reports_a_start_failure_and_stops_started_commands() {
        let long = ConcurrentCommand::new("long", "sleep 30", || sh("sleep 30"));
        let missing = ConcurrentCommand::new("missing", "missing-binary", || {
            CommandBuilder::new("definitely-not-a-real-binary")
        });

        let outcome = run(vec![long, missing], quiet());

        assert!(!outcome.success);
        assert_eq!(outcome.exit_code, 1);
        assert!(outcome.events.is_empty());
    }

    #[test]
    fn run_kills_other_processes_after_a_success_when_requested() {
        let long = ConcurrentCommand::new("long", "sleep 30", || sh("sleep 30"));

        let outcome = run(
            vec![exit_with("ok", 0), long],
            ConcurrentlyOptions {
                kill_others_on: vec![KillCondition::Success],
                success_condition: SuccessCondition::First,
                ..quiet()
            },
        );

        assert!(outcome.success);
        assert_eq!(outcome.events.len(), 2);
        assert!(outcome.events.iter().any(|event| event.killed));
    }

    #[test]
    fn run_supports_raw_output() {
        let command = ConcurrentCommand::new("echo", "printf hello", || sh("printf 'hello\\n'"));

        let outcome = run(
            vec![command],
            ConcurrentlyOptions {
                raw: true,
                ..quiet()
            },
        );

        assert!(outcome.success);
        assert_eq!(outcome.exit_code, 0);
        assert_eq!(outcome.events.len(), 1);
    }

    #[test]
    fn run_stops_the_startup_spinner_after_the_first_output() {
        let command = ConcurrentCommand::new("echo", "printf ready", || sh("printf 'ready\\n'"));

        let outcome = run(
            vec![command],
            ConcurrentlyOptions {
                startup: Some(StartupNotice {
                    starting_label: "Booting".to_string(),
                    started_message: "Booted".to_string(),
                }),
                ..quiet()
            },
        );

        assert!(outcome.success);
        assert_eq!(outcome.events.len(), 1);
    }

    #[test]
    fn run_reports_when_a_restart_cannot_be_spawned() {
        let attempts = Arc::new(AtomicUsize::new(0));
        let command = ConcurrentCommand::new("flaky", "flaky command", {
            let attempts = attempts.clone();
            move || {
                if attempts.fetch_add(1, Ordering::SeqCst) == 0 {
                    sh("exit 1")
                } else {
                    CommandBuilder::new("definitely-not-a-real-binary")
                }
            }
        });

        let outcome = run(
            vec![command],
            ConcurrentlyOptions {
                restart_tries: 1,
                restart_delay: Duration::from_millis(1),
                ..quiet()
            },
        );

        assert!(!outcome.success);
        assert_eq!(outcome.events.len(), 1);
        assert!(attempts.load(Ordering::SeqCst) >= 2);
    }
}
