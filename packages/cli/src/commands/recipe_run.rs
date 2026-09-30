// Replays recipes — `modules/<module>/recipes/<ID>.yml`, written by
// `recipe:create` — in a headless Bun.WebView browser, or with `--headed` in a
// new tab of the user's default browser, in the window they have open, so they
// can watch. A headed run shares that browser's profile, so it starts signed in
// wherever the user already is, and only ever closes the tabs it opened.
//
// Each target runs in a fresh view: the steps of its dependencies first (depth
// first, each recipe once), then its own. The first failing step stops that
// run and leaves a screenshot in `var/outputs/recipes/<ID>.png`. The browser
// work happens in an embedded Bun script (`templates/recipe/run.ts`) that
// streams one JSON event per line, which this command renders.

use clap::Args;

pub(super) mod browser;
pub(super) mod execute;
pub(super) mod plan;
pub(super) mod report;

pub use browser::{Browser, chromium_browser, default_browser, parse_devtools_active_port};
pub use execute::{BASE_URL_ENV, RunnerOptions, replay, resolve_base_url, run, runner_plan_json};
pub use plan::{
    PlannedStep, RecipeFile, RecipeLoader, RunPlan, discover_recipes, plan_recipe, select_recipes,
};
pub use report::{Report, RunOutcome, RunnerEvent, StepStatus};

#[derive(Args, Debug)]
pub struct RecipeRunArgs {
    /// Recipe IDs to run, in this order (comma-separated; defaults to every recipe).
    #[arg(long, value_delimiter = ',', num_args = 1..)]
    pub id: Vec<String>,

    /// Only run recipes of these modules (comma-separated). Dependencies still
    /// resolve across every module.
    #[arg(long, value_delimiter = ',', num_args = 1..)]
    pub module: Vec<String>,

    /// Origin that relative `navigate` URLs resolve against (defaults to $E2E_BASE_URL).
    #[arg(long)]
    pub base_url: Option<String>,

    /// Milliseconds a step may wait for its page or element.
    #[arg(long, default_value_t = 10_000, value_parser = clap::value_parser!(u64).range(1..))]
    pub timeout: u64,

    /// Replay in a new tab of your default browser's open window, where you can
    /// watch, instead of headless. It must be a Chromium browser with remote debugging on
    /// (chrome://inspect/#remote-debugging); runs reuse the session you are
    /// signed in with and leave it, the browser and your tabs untouched.
    #[arg(long)]
    pub headed: bool,

    /// Viewport width in pixels (with `--headed`, the tab keeps the window's size).
    #[arg(long, default_value_t = 1440, value_parser = clap::value_parser!(u32).range(1..))]
    pub width: u32,

    /// Viewport height in pixels (with `--headed`, the tab keeps the window's size).
    #[arg(long, default_value_t = 900, value_parser = clap::value_parser!(u32).range(1..))]
    pub height: u32,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}
