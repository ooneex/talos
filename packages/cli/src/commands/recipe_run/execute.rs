use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;

use console::style;
use serde::Serialize;

use super::RecipeRunArgs;
use super::browser::{Browser, default_browser};
use super::plan::{
    RecipeLoader, RunPlan, discover_recipes, drop_covered_runs, plan_recipe, select_recipes,
};
use super::report::{Report, RunOutcome};
use crate::utils::{OUTPUT_DIR, RecipeStep, current_dir, ensure_bin, format_duration};

const RUNNER: &str = include_str!("../../templates/recipe/run.ts");

pub const BASE_URL_ENV: &str = "E2E_BASE_URL";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunnerOptions {
    pub base_url: Option<String>,
    pub timeout: u64,
    pub width: u32,
    pub height: u32,
    pub screenshot_dir: PathBuf,
    /// The browser `--headed` replays in; headless when `None`.
    pub browser: Option<Browser>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunnerPlan<'a> {
    base_url: Option<&'a str>,
    timeout: u64,
    width: u32,
    height: u32,
    screenshot_dir: String,
    browser: Option<&'a Browser>,
    runs: Vec<RunnerRun<'a>>,
}

#[derive(Serialize)]
struct RunnerRun<'a> {
    id: &'a str,
    steps: Vec<&'a RecipeStep>,
}

/// The JSON plan the runner script reads: its settings and every run's steps.
pub fn runner_plan_json(runs: &[RunPlan], options: &RunnerOptions) -> String {
    let plan = RunnerPlan {
        base_url: options.base_url.as_deref(),
        timeout: options.timeout,
        width: options.width,
        height: options.height,
        screenshot_dir: options.screenshot_dir.display().to_string(),
        browser: options.browser.as_ref(),
        runs: runs
            .iter()
            .map(|run| RunnerRun {
                id: &run.id,
                steps: run.steps.iter().map(|planned| &planned.step).collect(),
            })
            .collect(),
    };
    serde_json::to_string(&plan).unwrap_or_default()
}

/// `--base-url`, else `E2E_BASE_URL`, ignoring blank values.
pub fn resolve_base_url(flag: Option<&str>, env: Option<&str>) -> Option<String> {
    [flag, env]
        .into_iter()
        .flatten()
        .map(str::trim)
        .find(|value| !value.is_empty())
        .map(str::to_string)
}

/// Replays `runs` with the Bun runner, rendering its progress as it streams in.
pub fn replay(
    root: &Path,
    runs: &[RunPlan],
    options: &RunnerOptions,
) -> Result<Vec<RunOutcome>, String> {
    std::fs::create_dir_all(&options.screenshot_dir).map_err(|error| {
        format!(
            "Could not create {}: {error}",
            options.screenshot_dir.display()
        )
    })?;
    // A screenshot left by an earlier failure would outlive a passing run.
    for run in runs {
        let _ = std::fs::remove_file(options.screenshot_dir.join(format!("{}.png", run.id)));
    }

    // The runner lives outside the project so its bunfig, .env and
    // tsconfig stay out of the browser session.
    let workdir = tempfile::tempdir()
        .map_err(|error| format!("Could not create a temporary directory: {error}"))?;
    let script = workdir.path().join("run.ts");
    let plan = workdir.path().join("plan.json");
    std::fs::write(&script, RUNNER)
        .and_then(|()| std::fs::write(&plan, runner_plan_json(runs, options)))
        .map_err(|error| format!("Could not write the recipe runner: {error}"))?;

    let mut child = Command::new("bun")
        .arg(&script)
        .arg(&plan)
        .current_dir(workdir.path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| format!("Could not start bun: {error}"))?;

    let mut report = Report::new(runs, root);
    let mut out = std::io::stdout();
    if let Some(stdout) = child.stdout.take() {
        // Read to the end whatever the bytes, so the runner never blocks on a full pipe.
        let mut reader = BufReader::new(stdout);
        let mut buffer = Vec::new();
        while reader
            .read_until(b'\n', &mut buffer)
            .is_ok_and(|read| read > 0)
        {
            let line = String::from_utf8_lossy(&buffer);
            let _ = report.handle_line(line.trim_end_matches(['\r', '\n']), &mut out);
            buffer.clear();
        }
    }

    let reason = match child.wait() {
        Ok(status) if status.success() => "The runner stopped before finishing".to_string(),
        Ok(status) => format!("The runner exited with {status}"),
        Err(error) => format!("The runner failed: {error}"),
    };
    let _ = report.finish(&reason, &mut out);
    Ok(report.outcomes().to_vec())
}

fn plural(count: usize) -> &'static str {
    if count == 1 { "recipe" } else { "recipes" }
}

pub fn run(args: &RecipeRunArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    // The runner works from a temporary directory, so every path it gets is absolute.
    let root = std::fs::canonicalize(&cwd).unwrap_or(cwd);

    let files = discover_recipes(&root);
    let targets = match select_recipes(&root, &files, &args.module, &args.id) {
        Ok(targets) => targets,
        Err(message) => {
            crate::utils::error(message);
            std::process::exit(1);
        }
    };
    if targets.is_empty() {
        crate::utils::warn("No recipes to run — create one with `talos recipe:create`");
        return;
    }

    let started = Instant::now();
    let mut loader = RecipeLoader::default();
    let mut runs = Vec::new();
    let mut failed = 0;
    let mut skipped = 0;
    for target in &targets {
        match plan_recipe(&files, target, &mut loader) {
            Ok(plan) if plan.steps.is_empty() => {
                crate::utils::warn(format!("{} has no steps to run; skipped", plan.id));
                skipped += 1;
            }
            Ok(plan) => runs.push(plan),
            Err(message) => {
                crate::utils::error(format!("{}: {message}", target.id));
                failed += 1;
            }
        }
    }

    // Recipes picked with --id all run as asked; otherwise a recipe another
    // run replays first, as its dependency, is not replayed again on its own.
    let covered = if args.id.is_empty() {
        let (kept, covered) = drop_covered_runs(runs);
        runs = kept;
        covered
    } else {
        Vec::new()
    };
    for run in &covered {
        crate::utils::info(format!(
            "{} runs at the start of {}; not replayed on its own",
            run.id, run.by
        ));
    }
    let total = targets.len() - covered.len();

    if !runs.is_empty() {
        if !ensure_bin("bun") {
            std::process::exit(1);
        }
        let browser = if args.headed {
            match default_browser() {
                Ok(browser) => {
                    crate::utils::info(format!(
                        "Replaying in {} — each recipe opens in a new tab",
                        browser.name
                    ));
                    Some(browser)
                }
                Err(message) => {
                    crate::utils::error(message);
                    std::process::exit(1);
                }
            }
        } else {
            None
        };
        let env_base_url = std::env::var(BASE_URL_ENV).ok();
        let options = RunnerOptions {
            base_url: resolve_base_url(args.base_url.as_deref(), env_base_url.as_deref()),
            timeout: args.timeout,
            width: args.width,
            height: args.height,
            screenshot_dir: root.join(OUTPUT_DIR).join("recipes"),
            browser,
        };
        match replay(&root, &runs, &options) {
            Ok(outcomes) => {
                failed += outcomes
                    .iter()
                    .filter(|outcome| **outcome != RunOutcome::Passed)
                    .count();
            }
            Err(message) => {
                crate::utils::error(message);
                failed += runs.len();
            }
        }
        println!();
    }

    let passed = total - failed - skipped;
    let elapsed = style(format!(
        "({})",
        format_duration(started.elapsed().as_millis() as u64)
    ))
    .dim();
    let skipped_note = if skipped > 0 {
        format!(", {skipped} skipped")
    } else {
        String::new()
    };
    if failed > 0 {
        eprintln!(
            "{} {} {elapsed}",
            style("✖").red().bold(),
            style(format!(
                "{failed} of {total} {} failed{skipped_note}",
                plural(total)
            ))
            .red()
        );
        std::process::exit(1);
    }
    println!(
        "{} {} {elapsed}",
        style("✔").green().bold(),
        style(format!("{passed} {} passed{skipped_note}", plural(passed))).green()
    );
}
