// The concurrent-run scheduler: spawning every command, restarting the
// ones configured to retry, and driving the loop that polls for output
// and termination until every process has finished — split out of the
// parent module to keep it under the file-size budget.

use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::Duration;

use portable_pty::{CommandBuilder, PtySize, native_pty_system};

use super::labels::{find_command, print_line, pty_size, spawn_process};
use super::{
    CloseEvent, ConcurrentCommand, ConcurrentlyOptions, ConcurrentlyOutcome, LogEvent, PrefixStyle,
    RunningCommand, prefix_label, run_is_successful, should_kill_others,
};
use crate::utils::style::{Spinner, error, success};

fn try_restart(
    pty_system: &dyn portable_pty::PtySystem,
    size: PtySize,
    factories: &[Box<dyn Fn() -> CommandBuilder + Send>],
    sender: &Sender<LogEvent>,
    running: &mut [RunningCommand],
    position: usize,
) -> bool {
    let index = running[position].index;
    let builder = (factories[index])();
    match spawn_process(pty_system, size, builder, index, sender.clone()) {
        Ok((child, master)) => {
            running[position].pid = child.process_id();
            running[position].child = child;
            running[position]._master = master;
            true
        }
        Err(message) => {
            error(format!(
                "Failed to restart {}: {message}",
                running[position].name
            ));
            false
        }
    }
}

/// Spawns every command's process, returning the running commands and the
/// factories kept around for restarts. On the first spawn failure, every
/// process already started is killed and an early failing outcome is
/// returned instead.
fn spawn_all(
    commands: Vec<ConcurrentCommand>,
    options: &ConcurrentlyOptions,
    pty_system: &dyn portable_pty::PtySystem,
    size: PtySize,
    sender: &Sender<LogEvent>,
) -> Result<
    (
        Vec<Box<dyn Fn() -> CommandBuilder + Send>>,
        Vec<RunningCommand>,
    ),
    ConcurrentlyOutcome,
> {
    let mut factories: Vec<Box<dyn Fn() -> CommandBuilder + Send>> = Vec::new();
    let mut running: Vec<RunningCommand> = Vec::new();

    for (index, command) in commands.into_iter().enumerate() {
        let builder = (command.factory)();
        match spawn_process(pty_system, size, builder, index, sender.clone()) {
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
                    _master: master,
                });
            }
            Err(message) => {
                error(format!("Failed to start {}: {message}", command.name));
                for mut running_command in running {
                    let _ = running_command.child.kill();
                }
                return Err(ConcurrentlyOutcome {
                    events: Vec::new(),
                    success: false,
                    exit_code: 1,
                });
            }
        }
    }

    Ok((factories, running))
}

/// Prints every log line pending on the channel, waking a startup spinner
/// the first time output arrives.
fn flush_pending_lines(
    receiver: &Receiver<LogEvent>,
    running: &[RunningCommand],
    spinner: &mut Option<Spinner>,
    options: &ConcurrentlyOptions,
) {
    while let Ok(LogEvent::Line { index, text }) = receiver.try_recv() {
        if let Some(active) = spinner.take() {
            active.stop();
            if let Some(notice) = &options.startup {
                success(&notice.started_message);
            }
        }
        if let Some(command) = find_command(running, index) {
            print_line(options, command, &text);
        }
    }
}

/// The first running command found to have exited, and how it exited.
fn poll_terminated(running: &mut [RunningCommand]) -> Option<(usize, i32, bool)> {
    let mut position = 0;
    while position < running.len() {
        match running[position].child.try_wait() {
            Ok(Some(status)) => {
                return Some((position, status.exit_code() as i32, status.success()));
            }
            Ok(None) => position += 1,
            Err(err) => {
                error(format!(
                    "Failed while waiting for {}: {err}",
                    running[position].name
                ));
                return Some((position, 1, false));
            }
        }
    }
    None
}

/// Handles one command's exit: restarts it in place when eligible, otherwise
/// records it as closed and, if its exit should end the run, kills every
/// other command still running. Returns `true` when a restart succeeded and
/// the caller's poll loop should simply continue.
#[allow(clippy::too_many_arguments)]
fn handle_terminated(
    position: usize,
    exit_code: i32,
    exit_ok: bool,
    pty_system: &dyn portable_pty::PtySystem,
    size: PtySize,
    factories: &[Box<dyn Fn() -> CommandBuilder + Send>],
    sender: &Sender<LogEvent>,
    running: &mut Vec<RunningCommand>,
    spinner: &mut Option<Spinner>,
    options: &ConcurrentlyOptions,
    events: &mut Vec<CloseEvent>,
    killed_others: &mut bool,
) -> bool {
    if !exit_ok && running[position].restarts_left > 0 && !should_kill_others(options, exit_ok) {
        running[position].restarts_left -= 1;
        if !options.restart_delay.is_zero() {
            thread::sleep(options.restart_delay);
        }
        if try_restart(pty_system, size, factories, sender, running, position) {
            return true;
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

    if should_kill_others(options, exit_ok) {
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
        *killed_others = true;
    }

    false
}

/// Prints whatever log lines arrived from a command between its final read
/// and the moment its exit was recorded.
fn drain_final_lines(
    receiver: &Receiver<LogEvent>,
    events: &[CloseEvent],
    options: &ConcurrentlyOptions,
) {
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
}

/// Computes the final outcome once every command has stopped running,
/// clearing the startup spinner and reporting the first meaningful failing
/// exit code (if any).
fn finalize(
    events: Vec<CloseEvent>,
    killed_others: bool,
    mut spinner: Option<Spinner>,
    options: &ConcurrentlyOptions,
) -> ConcurrentlyOutcome {
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

    let (factories, mut running) = match spawn_all(commands, &options, &*pty_system, size, &sender)
    {
        Ok(spawned) => spawned,
        Err(outcome) => return outcome,
    };

    let mut spinner = options
        .startup
        .as_ref()
        .map(|notice| Spinner::start(format!("{}...", notice.starting_label)));
    let mut events: Vec<CloseEvent> = Vec::new();
    let mut killed_others = false;

    loop {
        flush_pending_lines(&receiver, &running, &mut spinner, &options);

        if let Some((position, exit_code, exit_ok)) = poll_terminated(&mut running) {
            let restarted = handle_terminated(
                position,
                exit_code,
                exit_ok,
                &*pty_system,
                size,
                &factories,
                &sender,
                &mut running,
                &mut spinner,
                &options,
                &mut events,
                &mut killed_others,
            );
            if restarted {
                continue;
            }
        }

        if running.is_empty() {
            break;
        }

        thread::sleep(Duration::from_millis(60));
    }

    drain_final_lines(&receiver, &events, &options);

    finalize(events, killed_others, spinner, &options)
}
