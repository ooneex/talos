// `project:check` — run every health check the CLI knows about and print a
// single, readable report.
//
// The command is a thin orchestrator: each check reuses the very same code the
// dedicated command uses (`workspace:check`, `security:check`, `issue:check`,
// `commitlint:check`), so a project can never drift between `project:check`
// and the individual commands. The checks that only read the repository live
// in the submodules next to this file.

#[path = "project_check/artifacts.rs"]
pub mod artifacts;
#[path = "project_check/assets.rs"]
pub mod assets;
#[path = "project_check/asynchrony.rs"]
pub mod asynchrony;
#[path = "project_check/boundaries.rs"]
pub mod boundaries;
#[path = "project_check/branches.rs"]
pub mod branches;
#[path = "project_check/bundle.rs"]
pub mod bundle;
#[path = "project_check/cache.rs"]
pub mod cache;
#[path = "project_check/complexity.rs"]
pub mod complexity;
#[path = "project_check/container.rs"]
pub mod container;
#[path = "project_check/contrast.rs"]
pub mod contrast;
#[path = "project_check/conventions.rs"]
pub mod conventions;
#[path = "project_check/crons.rs"]
pub mod crons;
#[path = "project_check/dependencies.rs"]
pub mod dependencies;
#[path = "project_check/docker.rs"]
pub mod docker;
#[path = "project_check/docs.rs"]
pub mod docs;
#[path = "project_check/duplication.rs"]
pub mod duplication;
#[path = "project_check/e2e_coverage.rs"]
pub mod e2e_coverage;
#[path = "project_check/entities.rs"]
pub mod entities;
#[path = "project_check/env.rs"]
pub mod env;
#[path = "project_check/events.rs"]
pub mod events;
#[path = "project_check/exceptions.rs"]
pub mod exceptions;
#[path = "project_check/flags.rs"]
pub mod flags;
#[path = "project_check/folders.rs"]
pub mod folders;
#[path = "project_check/git.rs"]
pub mod git;
#[path = "project_check/graph.rs"]
pub mod graph;
#[path = "project_check/health.rs"]
pub mod health;
#[path = "project_check/imports.rs"]
pub mod imports;
#[path = "project_check/indexes.rs"]
pub mod indexes;
#[path = "project_check/lockfile.rs"]
pub mod lockfile;
#[path = "project_check/logging.rs"]
pub mod logging;
#[path = "project_check/mailers.rs"]
pub mod mailers;
#[path = "project_check/middlewares.rs"]
pub mod middlewares;
#[path = "project_check/migrations.rs"]
pub mod migrations;
#[path = "project_check/modules.rs"]
pub mod modules;
#[path = "project_check/openapi.rs"]
pub mod openapi;
#[path = "project_check/orphans.rs"]
pub mod orphans;
#[path = "project_check/outdated.rs"]
pub mod outdated;
#[path = "project_check/pagination.rs"]
pub mod pagination;
#[path = "project_check/permissions.rs"]
pub mod permissions;
#[path = "project_check/queries.rs"]
pub mod queries;
#[path = "project_check/queues.rs"]
pub mod queues;
#[path = "project_check/registration.rs"]
pub mod registration;
#[path = "project_check/repositories.rs"]
pub mod repositories;
#[path = "project_check/restricted.rs"]
pub mod restricted;
#[path = "project_check/roles.rs"]
pub mod roles;
#[path = "project_check/router.rs"]
pub mod router;
#[path = "project_check/routes.rs"]
pub mod routes;
#[path = "project_check/sdk.rs"]
pub mod sdk;
#[path = "project_check/secrets.rs"]
pub mod secrets;
#[path = "project_check/sql.rs"]
pub mod sql;
#[path = "project_check/stories.rs"]
pub mod stories;
#[path = "project_check/structure.rs"]
pub mod structure;
#[path = "project_check/tests.rs"]
pub mod tests;
#[path = "project_check/todos.rs"]
pub mod todos;
#[path = "project_check/tokens.rs"]
pub mod tokens;
#[path = "project_check/transactions.rs"]
pub mod transactions;
#[path = "project_check/translations.rs"]
pub mod translations;
#[path = "project_check/tsconfig.rs"]
pub mod tsconfig;
#[path = "project_check/validation.rs"]
pub mod validation;
#[path = "project_check/workflows.rs"]
pub mod workflows;

use clap::Args;

/// Command the end-to-end check runs.
pub(super) const E2E_COMMANDS: &str = "e2e";

/// Module types that ship a user interface and therefore need an a11y audit.
pub(super) const UI_MODULE_TYPES: &[&str] = &["design", "spa", "admin", "storybook"];

/// Directories never descended into while scanning sources.
pub(super) const EXCLUDED_DIRS: &[&str] = &[
    "node_modules",
    "dist",
    "build",
    "target",
    "coverage",
    "var",
    "vendor",
    "storybook-static",
    "__pycache__",
    "site-packages",
    "venv",
    ".git",
    ".turbo",
    ".cache",
    ".temp",
    ".venv",
    ".tox",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
];

/// Extensions scanned by the hygiene check.
pub(super) const SCANNED_EXTENSIONS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "rs", "py", "css", "scss", "json", "jsonc", "yml",
    "yaml", "md", "sql", "toml",
];

/// Commits inspected by the commit check when no upstream branch is configured.
pub(super) const COMMIT_HISTORY_LIMIT: usize = 20;

/// Detail lines kept per check so a broken project still prints a usable report.
pub const MAX_DETAILS: usize = 12;

pub(super) const MAX_SCANNED_FILE_BYTES: u64 = 512 * 1024;

#[derive(Args, Debug, Default, Clone)]
pub struct ProjectCheckArgs {
    /// Only run these checks (comma-separated). Accepts a category — foundation, architecture, api, data, runtime, frontend, quality, supply-chain, process — or a check: workspace, structure, folders, tsconfig, lockfile, conventions, imports, boundaries, restricted, container, registration, middlewares, routes, openapi, pagination, validation, roles, permissions, entities, indexes, repositories, transactions, sql, async, exceptions, logging, complexity, duplication, orphans, events, queues, crons, workflows, mailers, flags, env, dependencies, outdated, docker, migrations, accessibility, contrast, tokens, assets, translations, stories, router, queries, sdk, tests, coverage, e2e-coverage, docs, bundle, security, secrets, git, issues, todos, branches, commits, hygiene, e2e.
    #[arg(long)]
    pub only: Option<String>,

    /// Skip these checks or categories (comma-separated).
    #[arg(long)]
    pub skip: Option<String>,

    /// Also run the end-to-end suite, which is opt-in because it boots the app.
    #[arg(long, default_value_t = false)]
    pub e2e: bool,

    /// Also compare every dependency against the public registries.
    #[arg(long, default_value_t = false)]
    pub outdated: bool,

    /// Restrict the workspace, accessibility, security and issue checks to these packages.
    #[arg(long)]
    pub packages: Option<String>,

    /// Restrict the workspace, accessibility, security and issue checks to these modules.
    #[arg(long)]
    pub modules: Option<String>,

    /// Minimum vulnerability severity to report (low, moderate, high, critical).
    #[arg(long = "audit-level")]
    pub audit_level: Option<String>,

    /// Minimum line and function coverage a module must reach, in percent.
    #[arg(long)]
    pub threshold: Option<f64>,

    /// How many suites the workspace check runs at once (defaults to the core
    /// count, capped at 8).
    #[arg(long)]
    pub concurrency: Option<usize>,

    /// Stream plain workspace logs instead of the interactive view.
    #[arg(long, default_value_t = false)]
    pub logs: bool,

    /// Skip reading and writing the workspace task cache.
    #[arg(long, default_value_t = false)]
    pub no_cache: bool,

    /// Report every warning as a failure, and exit with a non-zero status.
    #[arg(long, default_value_t = false)]
    pub strict: bool,

    /// Print the report as JSON instead of the human report.
    #[arg(long, default_value_t = false)]
    pub json: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

mod accessibility;
mod check_id;
mod check_id_flags;
mod commits;
mod hygiene;
mod orchestrate;
mod outcome;
mod render;
mod security_issues;
mod types;
mod workspace;

pub use accessibility::{
    A11yDiagnostic, A11yReport, build_a11y_outcome, classify_a11y, disabled_a11y_rules,
    discover_ui_modules, json_message_to_string, json_path_to_string, parse_biome_a11y,
};
pub use commits::{CommitProblem, lint_commits};
pub use hygiene::{HygieneFinding, HygieneSeverity, bare_marker, scan_source};
pub use orchestrate::{execute, run};
pub use outcome::{
    CheckOutcome, CheckStatus, ERROR_DETAIL, ProjectReport, WARN_DETAIL, cap_details, harden,
    parse_ids, select_checks, split_csv, static_outcome,
};
pub use render::{render_json, render_report};
pub use types::{Category, CheckId, Reads};
pub use workspace::modules_with_e2e;
