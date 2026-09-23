use std::io::{self, Write};
use std::path::Path;

use console::style;
use serde::Deserialize;

use super::plan::{PlannedStep, RunPlan};
use crate::utils::format_duration;

/// Longest step label the columns stretch to; longer labels overflow.
const LABEL_WIDTH: usize = 60;

/// A progress line the runner script prints on stdout.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum RunnerEvent {
    Run {
        run: usize,
    },
    Step {
        run: usize,
        step: usize,
        status: StepStatus,
        duration: u64,
        #[serde(default)]
        error: Option<String>,
        #[serde(default)]
        screenshot: Option<String>,
    },
    Fatal {
        #[serde(default)]
        run: Option<usize>,
        error: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StepStatus {
    Passed,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunOutcome {
    Pending,
    /// Started; `next` is the position of the step it is on.
    Running {
        next: usize,
    },
    Passed,
    Failed,
}

/// Renders the runner's events as they arrive and tracks how each run ends.
pub struct Report<'a> {
    runs: &'a [RunPlan],
    root: &'a Path,
    outcomes: Vec<RunOutcome>,
    started_any: bool,
}

impl<'a> Report<'a> {
    pub fn new(runs: &'a [RunPlan], root: &'a Path) -> Self {
        Self {
            runs,
            root,
            outcomes: vec![RunOutcome::Pending; runs.len()],
            started_any: false,
        }
    }

    pub fn outcomes(&self) -> &[RunOutcome] {
        &self.outcomes
    }

    /// Renders one stdout line: an event, or — for anything else the runner
    /// printed — the raw line, dimmed.
    pub fn handle_line(&mut self, line: &str, out: &mut impl Write) -> io::Result<()> {
        match serde_json::from_str::<RunnerEvent>(line) {
            Ok(event) => self.handle(event, out),
            Err(_) if line.trim().is_empty() => Ok(()),
            Err(_) => writeln!(out, "  {}", style(line).dim()),
        }
    }

    pub fn handle(&mut self, event: RunnerEvent, out: &mut impl Write) -> io::Result<()> {
        match event {
            RunnerEvent::Run { run } => {
                if run >= self.runs.len() {
                    return Ok(());
                }
                self.stop_others(run, out)?;
                self.start(run, out)
            }
            RunnerEvent::Step {
                run,
                step,
                status,
                duration,
                error,
                screenshot,
            } => {
                let Some(plan) = self.runs.get(run) else {
                    return Ok(());
                };
                let Some(planned) = plan.steps.get(step) else {
                    return Ok(());
                };
                if self.outcomes[run] == RunOutcome::Pending {
                    self.start(run, out)?;
                }
                let width = label_width(plan);
                match status {
                    StepStatus::Passed => {
                        writeln!(
                            out,
                            "  {} {}",
                            style("✔").green(),
                            step_line(plan, planned, width, duration)
                        )?;
                        self.outcomes[run] = if step + 1 == plan.steps.len() {
                            RunOutcome::Passed
                        } else {
                            RunOutcome::Running { next: step + 1 }
                        };
                        Ok(())
                    }
                    StepStatus::Failed => {
                        writeln!(
                            out,
                            "  {} {}",
                            style("✖").red().bold(),
                            step_line(plan, planned, width, duration)
                        )?;
                        if let Some(error) = error {
                            writeln!(out, "    {}", style(error).red())?;
                        }
                        if let Some(screenshot) = screenshot {
                            writeln!(
                                out,
                                "    {}",
                                style(format!("Screenshot: {}", self.relative(&screenshot))).dim()
                            )?;
                        }
                        self.fail(run, step + 1, out)
                    }
                }
            }
            RunnerEvent::Fatal {
                run: Some(run),
                error,
            } if run < self.runs.len() => self.abort(run, &error, out),
            RunnerEvent::Fatal { error, .. } => writeln!(
                out,
                "{} {}",
                style("✖").red().bold(),
                style(format!("Recipe runner: {error}")).red()
            ),
        }
    }

    /// Fails every run the runner left unfinished, giving `reason`.
    pub fn finish(&mut self, reason: &str, out: &mut impl Write) -> io::Result<()> {
        for run in 0..self.runs.len() {
            self.abort(run, reason, out)?;
        }
        Ok(())
    }

    fn start(&mut self, run: usize, out: &mut impl Write) -> io::Result<()> {
        if self.started_any {
            writeln!(out)?;
        }
        self.started_any = true;
        self.outcomes[run] = RunOutcome::Running { next: 0 };

        let plan = &self.runs[run];
        if plan.title.is_empty() {
            writeln!(
                out,
                "{} {}",
                style("▸").cyan().bold(),
                style(&plan.id).bold()
            )
        } else {
            writeln!(
                out,
                "{} {} {}",
                style("▸").cyan().bold(),
                style(&plan.id).bold(),
                plan.title
            )
        }
    }

    /// Runs are replayed one after another, so starting one ends any other
    /// the runner stopped reporting on.
    fn stop_others(&mut self, current: usize, out: &mut impl Write) -> io::Result<()> {
        for run in 0..self.runs.len() {
            if run != current && matches!(self.outcomes[run], RunOutcome::Running { .. }) {
                self.abort(run, "The runner stopped reporting on this recipe", out)?;
            }
        }
        Ok(())
    }

    /// Fails a pending or running run with `error`, listing what it had left.
    fn abort(&mut self, run: usize, error: &str, out: &mut impl Write) -> io::Result<()> {
        let next = match self.outcomes[run] {
            RunOutcome::Passed | RunOutcome::Failed => return Ok(()),
            RunOutcome::Pending => {
                self.start(run, out)?;
                0
            }
            RunOutcome::Running { next } => next,
        };
        writeln!(out, "  {} {}", style("✖").red().bold(), style(error).red())?;
        self.fail(run, next, out)
    }

    fn fail(&mut self, run: usize, from: usize, out: &mut impl Write) -> io::Result<()> {
        self.outcomes[run] = RunOutcome::Failed;
        let plan = &self.runs[run];
        let width = label_width(plan);
        for planned in plan.steps.iter().skip(from) {
            writeln!(
                out,
                "  {}",
                style(format!("○ {}", step_text(plan, planned, width, "skipped"))).dim()
            )?;
        }
        Ok(())
    }

    fn relative(&self, path: &str) -> String {
        Path::new(path)
            .strip_prefix(self.root)
            .map(|relative| relative.display().to_string())
            .unwrap_or_else(|_| path.to_string())
    }
}

fn label(plan: &RunPlan, planned: &PlannedStep) -> String {
    if planned.source == plan.id {
        planned.step.to_string()
    } else {
        format!("{} · {}", planned.step, planned.source)
    }
}

fn label_width(plan: &RunPlan) -> usize {
    plan.steps
        .iter()
        .map(|planned| label(plan, planned).chars().count())
        .max()
        .unwrap_or(0)
        .min(LABEL_WIDTH)
}

/// The step's label padded to `width`, then `trailer`.
fn step_text(plan: &RunPlan, planned: &PlannedStep, width: usize, trailer: &str) -> String {
    let label = label(plan, planned);
    let padding = width.saturating_sub(label.chars().count());
    format!("{label}{}  {trailer}", " ".repeat(padding))
}

fn step_line(plan: &RunPlan, planned: &PlannedStep, width: usize, duration: u64) -> String {
    let duration = style(format_duration(duration)).dim().to_string();
    step_text(plan, planned, width, &duration)
}
