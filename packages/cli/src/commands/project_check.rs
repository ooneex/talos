//! `project:check` — run every health check the CLI knows about and print a
//! single, readable report.
//!
//! The command is a thin orchestrator: each check reuses the very same code the
//! dedicated command uses (`monorepo:run`, `security:check`, `issue:check`,
//! `commitlint:check`), so a project can never drift between `project:check`
//! and the individual commands. The checks that only read the repository live
//! in the submodules next to this file.

pub mod artifacts;
pub mod assets;
pub mod asynchrony;
pub mod boundaries;
pub mod branches;
pub mod bundle;
pub mod cache;
pub mod complexity;
pub mod container;
pub mod contrast;
pub mod conventions;
pub mod crons;
pub mod dependencies;
pub mod docker;
pub mod docs;
pub mod e2e_coverage;
pub mod entities;
pub mod env;
pub mod events;
pub mod exceptions;
pub mod flags;
pub mod folders;
pub mod git;
pub mod graph;
pub mod imports;
pub mod indexes;
pub mod lockfile;
pub mod logging;
pub mod mailers;
pub mod middlewares;
pub mod migrations;
pub mod modules;
pub mod openapi;
pub mod orphans;
pub mod outdated;
pub mod pagination;
pub mod permissions;
pub mod queries;
pub mod queues;
pub mod registration;
pub mod repositories;
pub mod restricted;
pub mod roles;
pub mod router;
pub mod routes;
pub mod sdk;
pub mod secrets;
pub mod sql;
pub mod stories;
pub mod structure;
pub mod tests;
pub mod todos;
pub mod tokens;
pub mod transactions;
pub mod translations;
pub mod tsconfig;
pub mod validation;
pub mod workflows;

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

use clap::Args;
use console::style;
use rayon::prelude::*;
use serde_json::{Value, json};

use crate::commands::issue_check::{self, CheckOptions};
use crate::commands::monorepo_run::{self, MonorepoRunArgs};
use crate::commands::security_check;
use crate::utils::{
    Loader, LoaderGroup, Spinner, current_dir, error, format_duration, get_valid_scopes,
    lint_commit_message, resolve_biome_command, strip_jsonc,
};

/// Commands the workspace check runs, in order.
const WORKSPACE_COMMANDS: &str = "install,build,fmt,lint,test";

/// Command the end-to-end check runs.
const E2E_COMMANDS: &str = "e2e";

/// Module types that ship a user interface and therefore need an a11y audit.
const UI_MODULE_TYPES: &[&str] = &["design", "spa", "admin", "storybook"];

/// Directories never descended into while scanning sources.
const EXCLUDED_DIRS: &[&str] = &[
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
const SCANNED_EXTENSIONS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "rs", "py", "css", "scss", "json", "jsonc", "yml",
    "yaml", "md", "sql", "toml",
];

/// Commits inspected by the commit check when no upstream branch is configured.
const COMMIT_HISTORY_LIMIT: usize = 20;

/// Detail lines kept per check so a broken project still prints a usable report.
const MAX_DETAILS: usize = 12;

const MAX_SCANNED_FILE_BYTES: u64 = 512 * 1024;

#[derive(Args, Debug, Default, Clone)]
pub struct ProjectCheckArgs {
    /// Only run these checks (comma-separated). Accepts a category — foundation, architecture, api, data, runtime, frontend, quality, supply-chain, process — or a check: workspace, structure, folders, tsconfig, lockfile, conventions, imports, boundaries, restricted, container, registration, middlewares, routes, openapi, pagination, validation, roles, permissions, entities, indexes, repositories, transactions, sql, async, exceptions, logging, complexity, orphans, events, queues, crons, workflows, mailers, flags, env, dependencies, outdated, docker, migrations, accessibility, contrast, tokens, assets, translations, stories, router, queries, sdk, tests, e2e-coverage, docs, bundle, security, secrets, git, issues, todos, branches, commits, hygiene, e2e.
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

    /// Stream plain workspace logs instead of the interactive view.
    #[arg(long, default_value_t = false)]
    pub logs: bool,

    /// Skip reading and writing the workspace task cache.
    #[arg(long, default_value_t = false)]
    pub no_cache: bool,

    /// Exit with a non-zero status when a check only reports warnings.
    #[arg(long, default_value_t = false)]
    pub strict: bool,

    /// Print the report as JSON instead of the human report.
    #[arg(long, default_value_t = false)]
    pub json: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum CheckId {
    Workspace,
    Structure,
    Folders,
    Tsconfig,
    Lockfile,
    Conventions,
    Imports,
    Boundaries,
    Restricted,
    Container,
    Registration,
    Middlewares,
    Routes,
    Openapi,
    Pagination,
    Validation,
    Roles,
    Permissions,
    Entities,
    Indexes,
    Repositories,
    Transactions,
    Sql,
    Async,
    Exceptions,
    Logging,
    Complexity,
    Orphans,
    Events,
    Queues,
    Crons,
    Workflows,
    Mailers,
    Flags,
    Env,
    Dependencies,
    Outdated,
    Docker,
    Migrations,
    Accessibility,
    Contrast,
    Tokens,
    Assets,
    Translations,
    Stories,
    Router,
    Queries,
    Sdk,
    Tests,
    E2eCoverage,
    Docs,
    Bundle,
    Security,
    Secrets,
    Git,
    Issues,
    Todos,
    Branches,
    Commits,
    Hygiene,
    E2e,
}

/// How far into the workspace a check reaches.
///
/// This is what gives the cache its granularity: an entry only records the
/// fingerprints of the members its check could have read, so editing a design
/// system does not invalidate `entities`, and writing a migration does not
/// invalidate `tokens`.
///
/// **The reach must be a superset of what the check actually reads.** Narrowing
/// it wrongly is the one way this cache can serve a stale answer, which is why
/// `Workspace` is the default and why a check only earns a narrower one by
/// visibly filtering its module list down to that set.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reads {
    /// Every module and package, plus the root.
    Workspace,
    /// Only the modules the container loads — `module`, `api`, `microservice`,
    /// `swagger`.
    Backend,
    /// Only the modules that ship a browser bundle — `design`, `spa`, `admin`,
    /// `storybook`.
    Frontend,
}

/// The dimension a check belongs to.
///
/// At sixty checks a flat list is no longer something anyone reads, and
/// `--only` is no longer something anyone types in full. A category is both the
/// heading the report groups under and a name `--only` and `--skip` accept in
/// place of the checks it holds.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Category {
    Foundation,
    Architecture,
    Api,
    Data,
    Runtime,
    Frontend,
    Quality,
    SupplyChain,
    Process,
}

impl Category {
    pub const ALL: [Category; 9] = [
        Category::Foundation,
        Category::Architecture,
        Category::Api,
        Category::Data,
        Category::Runtime,
        Category::Frontend,
        Category::Quality,
        Category::SupplyChain,
        Category::Process,
    ];

    pub fn key(self) -> &'static str {
        match self {
            Category::Foundation => "foundation",
            Category::Architecture => "architecture",
            Category::Api => "api",
            Category::Data => "data",
            Category::Runtime => "runtime",
            Category::Frontend => "frontend",
            Category::Quality => "quality",
            Category::SupplyChain => "supply-chain",
            Category::Process => "process",
        }
    }

    pub fn title(self) -> &'static str {
        match self {
            Category::Foundation => "Foundation",
            Category::Architecture => "Architecture",
            Category::Api => "API",
            Category::Data => "Data",
            Category::Runtime => "Runtime",
            Category::Frontend => "Front-end",
            Category::Quality => "Quality",
            Category::SupplyChain => "Supply chain",
            Category::Process => "Process",
        }
    }

    /// Resolve a category name, accepting the obvious aliases.
    ///
    /// No category is spelled the way a check is: `workspace` and `security`
    /// already name one check each, so the groups holding them are `foundation`
    /// and `supply-chain` and the bare words keep meaning what they always did.
    pub fn from_key(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "foundation" | "workspace-group" | "monorepo-group" => Some(Category::Foundation),
            "architecture" | "arch" | "layers" => Some(Category::Architecture),
            "api" | "http" | "endpoints-group" => Some(Category::Api),
            "data" | "database" | "persistence" => Some(Category::Data),
            "runtime" | "framework" | "wiring" => Some(Category::Runtime),
            "frontend" | "front-end" | "ui" => Some(Category::Frontend),
            "quality" | "coverage-group" => Some(Category::Quality),
            "supply-chain" | "security-group" | "dependencies-group" => Some(Category::SupplyChain),
            "process" | "workflow-group" => Some(Category::Process),
            _ => None,
        }
    }

    /// The checks the category holds, in execution order.
    pub fn checks(self) -> Vec<CheckId> {
        CheckId::ALL
            .into_iter()
            .filter(|id| id.category() == self)
            .collect()
    }
}

impl CheckId {
    /// Every check, in execution order. The workspace runs first because the
    /// install it performs is what makes the other tools available, and the
    /// end-to-end suite runs last because it needs the build they produce.
    pub const ALL: [CheckId; 61] = [
        CheckId::Workspace,
        CheckId::Structure,
        CheckId::Folders,
        CheckId::Tsconfig,
        CheckId::Lockfile,
        CheckId::Conventions,
        CheckId::Imports,
        CheckId::Boundaries,
        CheckId::Restricted,
        CheckId::Container,
        CheckId::Registration,
        CheckId::Middlewares,
        CheckId::Routes,
        CheckId::Openapi,
        CheckId::Pagination,
        CheckId::Validation,
        CheckId::Roles,
        CheckId::Permissions,
        CheckId::Entities,
        CheckId::Indexes,
        CheckId::Repositories,
        CheckId::Transactions,
        CheckId::Sql,
        CheckId::Async,
        CheckId::Exceptions,
        CheckId::Logging,
        CheckId::Complexity,
        CheckId::Orphans,
        CheckId::Events,
        CheckId::Queues,
        CheckId::Crons,
        CheckId::Workflows,
        CheckId::Mailers,
        CheckId::Flags,
        CheckId::Env,
        CheckId::Dependencies,
        CheckId::Outdated,
        CheckId::Docker,
        CheckId::Migrations,
        CheckId::Accessibility,
        CheckId::Contrast,
        CheckId::Tokens,
        CheckId::Assets,
        CheckId::Translations,
        CheckId::Stories,
        CheckId::Router,
        CheckId::Queries,
        CheckId::Sdk,
        CheckId::Tests,
        CheckId::E2eCoverage,
        CheckId::Docs,
        CheckId::Bundle,
        CheckId::Security,
        CheckId::Secrets,
        CheckId::Git,
        CheckId::Issues,
        CheckId::Todos,
        CheckId::Branches,
        CheckId::Commits,
        CheckId::Hygiene,
        CheckId::E2e,
    ];

    /// Checks that run when nothing is requested explicitly. The end-to-end
    /// suite is opt-in because it boots the application, and the outdated check
    /// because it queries the public registries for every dependency.
    pub const DEFAULT: [CheckId; 59] = [
        CheckId::Workspace,
        CheckId::Structure,
        CheckId::Folders,
        CheckId::Tsconfig,
        CheckId::Lockfile,
        CheckId::Conventions,
        CheckId::Imports,
        CheckId::Boundaries,
        CheckId::Restricted,
        CheckId::Container,
        CheckId::Registration,
        CheckId::Middlewares,
        CheckId::Routes,
        CheckId::Openapi,
        CheckId::Pagination,
        CheckId::Validation,
        CheckId::Roles,
        CheckId::Permissions,
        CheckId::Entities,
        CheckId::Indexes,
        CheckId::Repositories,
        CheckId::Transactions,
        CheckId::Sql,
        CheckId::Async,
        CheckId::Exceptions,
        CheckId::Logging,
        CheckId::Complexity,
        CheckId::Orphans,
        CheckId::Events,
        CheckId::Queues,
        CheckId::Crons,
        CheckId::Workflows,
        CheckId::Mailers,
        CheckId::Flags,
        CheckId::Env,
        CheckId::Dependencies,
        CheckId::Docker,
        CheckId::Migrations,
        CheckId::Accessibility,
        CheckId::Contrast,
        CheckId::Tokens,
        CheckId::Assets,
        CheckId::Translations,
        CheckId::Stories,
        CheckId::Router,
        CheckId::Queries,
        CheckId::Sdk,
        CheckId::Tests,
        CheckId::E2eCoverage,
        CheckId::Docs,
        CheckId::Bundle,
        CheckId::Security,
        CheckId::Secrets,
        CheckId::Git,
        CheckId::Issues,
        CheckId::Todos,
        CheckId::Branches,
        CheckId::Commits,
        CheckId::Hygiene,
    ];

    /// The dimension the check belongs to.
    pub fn category(self) -> Category {
        match self {
            CheckId::Workspace
            | CheckId::Structure
            | CheckId::Tsconfig
            | CheckId::Lockfile
            | CheckId::Dependencies
            | CheckId::Outdated
            | CheckId::Docker
            | CheckId::Git
            | CheckId::Bundle => Category::Foundation,

            CheckId::Folders
            | CheckId::Conventions
            | CheckId::Imports
            | CheckId::Boundaries
            | CheckId::Restricted
            | CheckId::Container
            | CheckId::Registration
            | CheckId::Complexity
            | CheckId::Orphans => Category::Architecture,

            CheckId::Middlewares
            | CheckId::Routes
            | CheckId::Openapi
            | CheckId::Pagination
            | CheckId::Validation
            | CheckId::Roles
            | CheckId::Permissions
            | CheckId::Sdk => Category::Api,

            CheckId::Entities
            | CheckId::Indexes
            | CheckId::Repositories
            | CheckId::Transactions
            | CheckId::Sql
            | CheckId::Migrations => Category::Data,

            CheckId::Events
            | CheckId::Queues
            | CheckId::Crons
            | CheckId::Workflows
            | CheckId::Mailers
            | CheckId::Flags
            | CheckId::Async
            | CheckId::Exceptions
            | CheckId::Logging
            | CheckId::Env => Category::Runtime,

            CheckId::Accessibility
            | CheckId::Contrast
            | CheckId::Tokens
            | CheckId::Assets
            | CheckId::Translations
            | CheckId::Stories
            | CheckId::Router
            | CheckId::Queries => Category::Frontend,

            CheckId::Tests
            | CheckId::E2eCoverage
            | CheckId::Docs
            | CheckId::Hygiene
            | CheckId::Todos
            | CheckId::E2e => Category::Quality,

            CheckId::Security | CheckId::Secrets => Category::SupplyChain,

            CheckId::Issues | CheckId::Branches | CheckId::Commits => Category::Process,
        }
    }

    pub fn key(self) -> &'static str {
        match self {
            CheckId::Workspace => "workspace",
            CheckId::Structure => "structure",
            CheckId::Folders => "folders",
            CheckId::Tsconfig => "tsconfig",
            CheckId::Lockfile => "lockfile",
            CheckId::Conventions => "conventions",
            CheckId::Imports => "imports",
            CheckId::Boundaries => "boundaries",
            CheckId::Restricted => "restricted",
            CheckId::Container => "container",
            CheckId::Registration => "registration",
            CheckId::Middlewares => "middlewares",
            CheckId::Routes => "routes",
            CheckId::Openapi => "openapi",
            CheckId::Pagination => "pagination",
            CheckId::Validation => "validation",
            CheckId::Roles => "roles",
            CheckId::Permissions => "permissions",
            CheckId::Entities => "entities",
            CheckId::Indexes => "indexes",
            CheckId::Repositories => "repositories",
            CheckId::Transactions => "transactions",
            CheckId::Sql => "sql",
            CheckId::Async => "async",
            CheckId::Exceptions => "exceptions",
            CheckId::Logging => "logging",
            CheckId::Complexity => "complexity",
            CheckId::Orphans => "orphans",
            CheckId::Events => "events",
            CheckId::Queues => "queues",
            CheckId::Crons => "crons",
            CheckId::Workflows => "workflows",
            CheckId::Mailers => "mailers",
            CheckId::Flags => "flags",
            CheckId::Env => "env",
            CheckId::Dependencies => "dependencies",
            CheckId::Outdated => "outdated",
            CheckId::Docker => "docker",
            CheckId::Migrations => "migrations",
            CheckId::Accessibility => "accessibility",
            CheckId::Contrast => "contrast",
            CheckId::Tokens => "tokens",
            CheckId::Assets => "assets",
            CheckId::Translations => "translations",
            CheckId::Stories => "stories",
            CheckId::Router => "router",
            CheckId::Queries => "queries",
            CheckId::Sdk => "sdk",
            CheckId::Tests => "tests",
            CheckId::E2eCoverage => "e2e-coverage",
            CheckId::Docs => "docs",
            CheckId::Bundle => "bundle",
            CheckId::Security => "security",
            CheckId::Secrets => "secrets",
            CheckId::Git => "git",
            CheckId::Issues => "issues",
            CheckId::Todos => "todos",
            CheckId::Branches => "branches",
            CheckId::Commits => "commits",
            CheckId::Hygiene => "hygiene",
            CheckId::E2e => "e2e",
        }
    }

    pub fn title(self) -> &'static str {
        match self {
            CheckId::Workspace => "Workspace",
            CheckId::Structure => "Structure",
            CheckId::Folders => "Folders",
            CheckId::Tsconfig => "Tsconfig",
            CheckId::Lockfile => "Lockfile",
            CheckId::Conventions => "Conventions",
            CheckId::Imports => "Imports",
            CheckId::Boundaries => "Boundaries",
            CheckId::Restricted => "Restricted",
            CheckId::Container => "Container",
            CheckId::Registration => "Registration",
            CheckId::Middlewares => "Middlewares",
            CheckId::Routes => "Routes",
            CheckId::Openapi => "OpenAPI",
            CheckId::Pagination => "Pagination",
            CheckId::Validation => "Validation",
            CheckId::Roles => "Roles",
            CheckId::Permissions => "Permissions",
            CheckId::Entities => "Entities",
            CheckId::Indexes => "Indexes",
            CheckId::Repositories => "Repositories",
            CheckId::Transactions => "Transactions",
            CheckId::Sql => "SQL",
            CheckId::Async => "Async",
            CheckId::Exceptions => "Exceptions",
            CheckId::Logging => "Logging",
            CheckId::Complexity => "Complexity",
            CheckId::Orphans => "Orphans",
            CheckId::Events => "Events",
            CheckId::Queues => "Queues",
            CheckId::Crons => "Crons",
            CheckId::Workflows => "Workflows",
            CheckId::Mailers => "Mailers",
            CheckId::Flags => "Feature flags",
            CheckId::Env => "Env",
            CheckId::Dependencies => "Dependencies",
            CheckId::Outdated => "Outdated",
            CheckId::Docker => "Docker",
            CheckId::Migrations => "Migrations",
            CheckId::Accessibility => "Accessibility",
            CheckId::Contrast => "Contrast",
            CheckId::Tokens => "Tokens",
            CheckId::Assets => "Assets",
            CheckId::Translations => "Translations",
            CheckId::Stories => "Stories",
            CheckId::Router => "Router",
            CheckId::Queries => "Queries",
            CheckId::Sdk => "SDK",
            CheckId::Tests => "Tests",
            CheckId::E2eCoverage => "E2E coverage",
            CheckId::Docs => "Docs",
            CheckId::Bundle => "Bundle",
            CheckId::Security => "Security",
            CheckId::Secrets => "Secrets",
            CheckId::Git => "Git",
            CheckId::Issues => "Issues",
            CheckId::Todos => "Todos",
            CheckId::Branches => "Branches",
            CheckId::Commits => "Commits",
            CheckId::Hygiene => "Hygiene",
            CheckId::E2e => "End-to-end",
        }
    }

    /// What the check actually runs, shown while it is running.
    pub fn description(self) -> &'static str {
        match self {
            CheckId::Workspace => "install, build, fmt, lint and test every package and module",
            CheckId::Structure => "module manifests, package names and path aliases",
            CheckId::Folders => "every folder against the layout its module type allows",
            CheckId::Tsconfig => "compiler settings inherited from the root config",
            CheckId::Lockfile => "one lockfile, covering every manifest",
            CheckId::Conventions => "DI naming, typed env access and type conventions",
            CheckId::Imports => "resolvable imports, no cycles, no inverted layers",
            CheckId::Boundaries => "which module may know about which, by runtime",
            CheckId::Restricted => "packages imported where they do not belong",
            CheckId::Container => "every injected class bound into the container",
            CheckId::Registration => "classes listed in the module that loads them",
            CheckId::Middlewares => "middlewares that hand their context back",
            CheckId::Routes => "unique endpoints, named, versioned and guarded",
            CheckId::Openapi => "the published specification against the controllers",
            CheckId::Pagination => "collection routes that bound what they return",
            CheckId::Validation => "route types against the schemas that guard them",
            CheckId::Roles => "route guards against the declared role hierarchy",
            CheckId::Permissions => "permissions that decide something",
            CheckId::Entities => "entity tables and columns against the migrations",
            CheckId::Indexes => "key columns against the indexes the migrations create",
            CheckId::Repositories => "queries kept behind the repository layer",
            CheckId::Transactions => "methods writing more than once, atomically",
            CheckId::Sql => "values interpolated into a raw query",
            CheckId::Async => "awaits inside a loop and unawaited promises",
            CheckId::Exceptions => "failures thrown with a code, and none swallowed",
            CheckId::Logging => "console calls and secrets written to a log",
            CheckId::Complexity => "file, function, parameter and nesting budgets",
            CheckId::Orphans => "files and exports nothing reaches",
            CheckId::Events => "channels with one subscriber and a producer",
            CheckId::Queues => "queues that are named, served and monitored",
            CheckId::Crons => "schedules that convert to a crontab expression",
            CheckId::Workflows => "transitions belonging to a workflow that runs them",
            CheckId::Mailers => "senders against the templates they render",
            CheckId::Flags => "flag keys, and whether anything still reads them",
            CheckId::Env => "local .env.yml files against their examples",
            CheckId::Dependencies => "one version per dependency, declared where used",
            CheckId::Outdated => "declared versions against the public registries",
            CheckId::Docker => "compose services, pinned images and free host ports",
            CheckId::Migrations => "migration ordering, reversibility and seed data",
            CheckId::Accessibility => "a11y lint of every UI module",
            CheckId::Contrast => "WCAG contrast of every design token pair",
            CheckId::Tokens => "colours and sizes written outside the design system",
            CheckId::Assets => "shipped files nothing references, and their weight",
            CheckId::Translations => "locale parity and key usage of every dictionary",
            CheckId::Stories => "a story for every design-system component",
            CheckId::Router => "route files against the tree the router builds",
            CheckId::Queries => "cache keys read from a factory, and invalidated",
            CheckId::Sdk => "generated clients against the controllers they wrap",
            CheckId::Tests => "a spec for every source file that holds behaviour",
            CheckId::E2eCoverage => "an end-to-end suite for every module that serves",
            CheckId::Docs => "relative links in every markdown document",
            CheckId::Bundle => "build size, chunk weight and shipped assets",
            CheckId::Security => "dependency audit against OSV.dev",
            CheckId::Secrets => "credentials in the working tree",
            CheckId::Git => "build output and large files in the index",
            CheckId::Issues => "issue YAML conventions",
            CheckId::Todos => "markers against the issues they name",
            CheckId::Branches => "issue branches against the branches that exist",
            CheckId::Commits => "conventional commit messages",
            CheckId::Hygiene => "conflict markers, focused tests and bare TODOs",
            CheckId::E2e => "the end-to-end suite of every module",
        }
    }

    /// Whether the check only runs when it is asked for explicitly.
    pub fn opt_in(self) -> bool {
        !Self::DEFAULT.contains(&self)
    }

    /// Whether the check's result is a pure function of the working tree, and
    /// therefore worth caching.
    ///
    /// Four kinds are not. The workspace and end-to-end checks *do* something —
    /// install, build, lint, test, boot the app — so replaying a stored verdict
    /// would skip the work rather than repeat it, and both already cache
    /// themselves at the task level. The security and outdated checks ask the
    /// network, and an advisory published this morning changes their answer
    /// with no file having moved. The git, commits and branches checks read the
    /// repository rather than the files in it: staging a file, amending a
    /// commit or deleting a branch changes what they report while every
    /// fingerprint stays exactly where it was.
    pub fn cacheable(self) -> bool {
        !matches!(
            self,
            CheckId::Workspace
                | CheckId::E2e
                | CheckId::Security
                | CheckId::Outdated
                | CheckId::Git
                | CheckId::Commits
                | CheckId::Branches
        )
    }

    /// The members the check reads, which is what its cache entry is keyed on.
    ///
    /// Every check is listed, so adding one is a deliberate decision rather
    /// than an omission that silently gets the safe answer.
    pub fn reads(self) -> Reads {
        match self {
            // Filter their module list down to the backend with `is_backend`,
            // and read nothing outside it.
            CheckId::Middlewares
            | CheckId::Pagination
            | CheckId::Permissions
            | CheckId::Indexes
            | CheckId::Repositories
            | CheckId::Transactions
            | CheckId::Exceptions
            | CheckId::Events
            | CheckId::Queues
            | CheckId::Crons
            | CheckId::Workflows
            | CheckId::Mailers
            | CheckId::Registration => Reads::Backend,

            // Filter down to the modules that ship a browser bundle.
            CheckId::Accessibility
            | CheckId::Contrast
            | CheckId::Tokens
            | CheckId::Assets
            | CheckId::Stories
            | CheckId::Router
            | CheckId::Queries => Reads::Frontend,

            // Everything else reads whatever the workspace holds — either
            // because it genuinely walks every member, or because it reads a
            // manifest of one before deciding it is not interested.
            CheckId::Workspace
            | CheckId::Structure
            | CheckId::Folders
            | CheckId::Tsconfig
            | CheckId::Lockfile
            | CheckId::Conventions
            | CheckId::Imports
            | CheckId::Boundaries
            | CheckId::Restricted
            | CheckId::Container
            | CheckId::Routes
            | CheckId::Openapi
            | CheckId::Validation
            | CheckId::Roles
            | CheckId::Entities
            | CheckId::Sql
            | CheckId::Async
            | CheckId::Logging
            | CheckId::Complexity
            | CheckId::Orphans
            | CheckId::Flags
            | CheckId::Env
            | CheckId::Dependencies
            | CheckId::Outdated
            | CheckId::Docker
            | CheckId::Migrations
            | CheckId::Translations
            | CheckId::Sdk
            | CheckId::Tests
            | CheckId::E2eCoverage
            | CheckId::Docs
            | CheckId::Bundle
            | CheckId::Security
            | CheckId::Secrets
            | CheckId::Git
            | CheckId::Issues
            | CheckId::Todos
            | CheckId::Branches
            | CheckId::Commits
            | CheckId::Hygiene
            | CheckId::E2e => Reads::Workspace,
        }
    }

    /// Whether the check has to run on its own.
    ///
    /// The workspace check owns the terminal while it streams a task view, and
    /// its install is what puts the tools the other checks shell out to on
    /// disk. The end-to-end suite boots the application and binds its ports.
    /// Everything else is a read, and reads can all happen at once.
    pub fn is_serial(self) -> bool {
        matches!(self, CheckId::Workspace | CheckId::E2e)
    }

    /// Resolve a user-provided name, accepting the obvious aliases.
    pub fn from_key(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "workspace" | "monorepo" | "build" | "lint" => Some(CheckId::Workspace),
            "structure" | "layout" | "modules" => Some(CheckId::Structure),
            "folders" | "folder" | "tree" | "directories" => Some(CheckId::Folders),
            "tsconfig" | "typescript" | "compiler" => Some(CheckId::Tsconfig),
            "lockfile" | "lock" | "lockfiles" => Some(CheckId::Lockfile),
            "conventions" | "convention" | "naming" => Some(CheckId::Conventions),
            "imports" | "import" | "cycles" | "layers" => Some(CheckId::Imports),
            "boundaries" | "boundary" | "coupling" => Some(CheckId::Boundaries),
            "restricted" | "banned" | "forbidden" => Some(CheckId::Restricted),
            "container" | "di" | "injection" => Some(CheckId::Container),
            "registration" | "registry" | "wiring" => Some(CheckId::Registration),
            "middlewares" | "middleware" => Some(CheckId::Middlewares),
            "routes" | "route" | "endpoints" | "controllers" => Some(CheckId::Routes),
            "openapi" | "swagger" | "spec" => Some(CheckId::Openapi),
            "pagination" | "paging" | "limits" => Some(CheckId::Pagination),
            "validation" | "validate" | "assert" | "dto" => Some(CheckId::Validation),
            "roles" | "role" => Some(CheckId::Roles),
            "permissions" | "permission" | "abilities" => Some(CheckId::Permissions),
            "entities" | "entity" | "schema" => Some(CheckId::Entities),
            "indexes" | "index" | "indices" => Some(CheckId::Indexes),
            "repositories" | "repository" | "repos" => Some(CheckId::Repositories),
            "transactions" | "transaction" | "atomicity" => Some(CheckId::Transactions),
            "sql" | "injection-sql" => Some(CheckId::Sql),
            "async" | "await" | "concurrency" => Some(CheckId::Async),
            "exceptions" | "exception" | "errors" | "throw" => Some(CheckId::Exceptions),
            "logging" | "logs" | "logger" | "console" => Some(CheckId::Logging),
            "complexity" | "size" | "budgets" => Some(CheckId::Complexity),
            "orphans" | "orphan" | "dead-code" | "unused" => Some(CheckId::Orphans),
            "events" | "event" | "pubsub" => Some(CheckId::Events),
            "queues" | "queue" | "jobs" => Some(CheckId::Queues),
            "crons" | "cron" | "schedules" | "cron-jobs" => Some(CheckId::Crons),
            "workflows" | "workflow" | "transitions" => Some(CheckId::Workflows),
            "mailers" | "mailer" | "emails" => Some(CheckId::Mailers),
            "flags" | "flag" | "feature-flags" => Some(CheckId::Flags),
            "env" | "environment" | "dotenv" => Some(CheckId::Env),
            "dependencies" | "deps" | "packages" => Some(CheckId::Dependencies),
            "outdated" | "updates" | "upgrades" => Some(CheckId::Outdated),
            "docker" | "compose" | "services" => Some(CheckId::Docker),
            "migrations" | "migration" | "seeds" => Some(CheckId::Migrations),
            "accessibility" | "a11y" => Some(CheckId::Accessibility),
            "contrast" | "colors" | "colours" | "wcag" => Some(CheckId::Contrast),
            "tokens" | "token" | "design-tokens" => Some(CheckId::Tokens),
            "assets" | "asset" | "images" | "public" => Some(CheckId::Assets),
            "translations" | "translation" | "i18n" => Some(CheckId::Translations),
            "stories" | "story" | "storybook" => Some(CheckId::Stories),
            "router" | "routing" | "route-tree" => Some(CheckId::Router),
            "queries" | "query" | "tanstack" | "cache-keys" => Some(CheckId::Queries),
            "sdk" | "client" => Some(CheckId::Sdk),
            "tests" | "test" | "specs" | "coverage" => Some(CheckId::Tests),
            "e2e-coverage" | "e2e-specs" | "browser-coverage" => Some(CheckId::E2eCoverage),
            "docs" | "doc" | "documentation" | "markdown" => Some(CheckId::Docs),
            "bundle" | "bundles" | "dist" => Some(CheckId::Bundle),
            "security" | "audit" | "vulnerabilities" => Some(CheckId::Security),
            "secrets" | "credentials" => Some(CheckId::Secrets),
            "git" | "gitignore" => Some(CheckId::Git),
            "issues" | "issue" => Some(CheckId::Issues),
            "todos" | "todo" | "todos-issues" | "markers" => Some(CheckId::Todos),
            "branches" | "branch" | "worktree" => Some(CheckId::Branches),
            "commits" | "commit" | "commitlint" => Some(CheckId::Commits),
            "hygiene" | "cleanliness" => Some(CheckId::Hygiene),
            "e2e" | "end-to-end" | "endtoend" => Some(CheckId::E2e),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum CheckStatus {
    Passed,
    Skipped,
    Warned,
    Failed,
}

impl CheckStatus {
    pub fn label(self) -> &'static str {
        match self {
            CheckStatus::Passed => "passed",
            CheckStatus::Skipped => "skipped",
            CheckStatus::Warned => "warning",
            CheckStatus::Failed => "failed",
        }
    }

    /// Read a status back out of a cache entry.
    pub fn from_label(label: &str) -> Option<Self> {
        match label {
            "passed" => Some(CheckStatus::Passed),
            "skipped" => Some(CheckStatus::Skipped),
            "warning" => Some(CheckStatus::Warned),
            "failed" => Some(CheckStatus::Failed),
            _ => None,
        }
    }

    fn icon(self) -> String {
        match self {
            CheckStatus::Passed => style("✔").green().bold().to_string(),
            CheckStatus::Skipped => style("–").dim().to_string(),
            CheckStatus::Warned => style("⚠").yellow().bold().to_string(),
            CheckStatus::Failed => style("✖").red().bold().to_string(),
        }
    }

    fn paint(self, text: &str) -> String {
        match self {
            CheckStatus::Passed => style(text).green().to_string(),
            CheckStatus::Skipped => style(text).dim().to_string(),
            CheckStatus::Warned => style(text).yellow().to_string(),
            CheckStatus::Failed => style(text).red().to_string(),
        }
    }
}

/// The result of a single check — never exits the process so it stays testable.
#[derive(Clone, Debug)]
pub struct CheckOutcome {
    pub id: CheckId,
    pub status: CheckStatus,
    pub summary: String,
    pub details: Vec<String>,
    pub hints: Vec<String>,
    pub duration_ms: u64,
    /// Whether the outcome was replayed from `var/cache/project` rather than
    /// computed. It is the duration column that says so in the report.
    pub cached: bool,
}

impl CheckOutcome {
    fn new(id: CheckId, status: CheckStatus, summary: impl Into<String>) -> Self {
        Self {
            id,
            status,
            summary: summary.into(),
            details: Vec::new(),
            hints: Vec::new(),
            duration_ms: 0,
            cached: false,
        }
    }

    fn with_details(mut self, details: Vec<String>) -> Self {
        self.details = cap_details(details);
        self
    }

    fn with_hint(mut self, hint: impl Into<String>) -> Self {
        self.hints.push(hint.into());
        self
    }
}

#[derive(Clone, Debug, Default)]
pub struct ProjectReport {
    pub root: String,
    pub outcomes: Vec<CheckOutcome>,
    pub duration_ms: u64,
}

impl ProjectReport {
    pub fn count(&self, status: CheckStatus) -> usize {
        self.outcomes
            .iter()
            .filter(|outcome| outcome.status == status)
            .count()
    }

    pub fn failed(&self) -> bool {
        self.count(CheckStatus::Failed) > 0
    }

    pub fn warned(&self) -> bool {
        self.count(CheckStatus::Warned) > 0
    }

    /// Whether the run should fail the process, honouring `--strict`.
    pub fn is_failure(&self, strict: bool) -> bool {
        self.failed() || (strict && self.warned())
    }
}

/// Resolve which checks to run from `--only` / `--skip`, plus any opt-in check
/// that was requested through its own flag.
pub fn select_checks(
    only: Option<&str>,
    skip: Option<&str>,
    extra: &[CheckId],
) -> Result<Vec<CheckId>, String> {
    let mut selected: Vec<CheckId> = match parse_ids(only)? {
        Some(ids) if !ids.is_empty() => CheckId::ALL
            .into_iter()
            .filter(|id| ids.contains(id))
            .collect(),
        _ => CheckId::ALL
            .into_iter()
            .filter(|id| CheckId::DEFAULT.contains(id) || extra.contains(id))
            .collect(),
    };

    if let Some(skipped) = parse_ids(skip)? {
        selected.retain(|id| !skipped.contains(id));
    }

    if selected.is_empty() {
        return Err("No check left to run — relax --only/--skip".to_string());
    }
    Ok(selected)
}

fn parse_ids(value: Option<&str>) -> Result<Option<BTreeSet<CheckId>>, String> {
    let Some(value) = value else {
        return Ok(None);
    };

    let mut ids = BTreeSet::new();
    for name in value.split(',').map(str::trim).filter(|s| !s.is_empty()) {
        // A category stands for every check it holds, so `--only=frontend` is
        // the eight front-end checks without naming any of them.
        if let Some(category) = Category::from_key(name) {
            ids.extend(category.checks());
            continue;
        }
        let Some(id) = CheckId::from_key(name) else {
            return Err(format!(
                "Unknown check \"{name}\" — expected a category ({}) or one of: {}",
                Category::ALL
                    .iter()
                    .map(|category| category.key())
                    .collect::<Vec<_>>()
                    .join(", "),
                CheckId::ALL
                    .iter()
                    .map(|id| id.key())
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        };
        ids.insert(id);
    }
    Ok(Some(ids))
}

fn cap_details(details: Vec<String>) -> Vec<String> {
    if details.len() <= MAX_DETAILS {
        return details;
    }
    let hidden = details.len() - MAX_DETAILS;
    let mut capped: Vec<String> = details.into_iter().take(MAX_DETAILS).collect();
    capped.push(format!("… and {hidden} more"));
    capped
}

fn split_csv(value: Option<&str>) -> Vec<String> {
    value
        .map(|value| {
            value
                .split(',')
                .map(str::trim)
                .filter(|part| !part.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// Build the outcome of a check that only reads the repository.
///
/// Errors fail the check, warnings only warn, and the details keep the errors
/// first so the most important line is never the one that gets capped.
fn static_outcome(
    id: CheckId,
    scope: &str,
    clean: &str,
    errors: Vec<String>,
    warnings: Vec<String>,
) -> CheckOutcome {
    if errors.is_empty() && warnings.is_empty() {
        return CheckOutcome::new(id, CheckStatus::Passed, format!("{scope} · {clean}"));
    }

    let status = if errors.is_empty() {
        CheckStatus::Warned
    } else {
        CheckStatus::Failed
    };
    let summary = match (errors.len(), warnings.len()) {
        (0, warned) => format!(
            "{scope} · {warned} warning{}",
            if warned == 1 { "" } else { "s" }
        ),
        (failed, 0) => format!(
            "{scope} · {failed} error{}",
            if failed == 1 { "" } else { "s" }
        ),
        (failed, warned) => format!(
            "{scope} · {failed} error{} · {warned} warning{}",
            if failed == 1 { "" } else { "s" },
            if warned == 1 { "" } else { "s" }
        ),
    };

    let details = errors
        .into_iter()
        .map(|message| format!("error  {message}"))
        .chain(
            warnings
                .into_iter()
                .map(|message| format!("warn   {message}")),
        )
        .collect();

    CheckOutcome::new(id, status, summary).with_details(details)
}

// ---------------------------------------------------------------------------
// Workspace — install, build, fmt, lint, test
// ---------------------------------------------------------------------------

fn check_workspace(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let summary = WORKSPACE_COMMANDS.replace(',', ", ");

    match run_tasks(args, root, WORKSPACE_COMMANDS) {
        Ok(true) => CheckOutcome::new(CheckId::Workspace, CheckStatus::Passed, summary),
        Ok(false) => CheckOutcome::new(CheckId::Workspace, CheckStatus::Failed, summary)
            .with_details(vec![
                "A workspace task failed — the failing task output is printed above".to_string(),
            ])
            .with_hint("Re-run the failing step alone, e.g. `talos lint --modules=<name> --logs`"),
        Err(message) => CheckOutcome::new(CheckId::Workspace, CheckStatus::Failed, summary)
            .with_details(vec![message]),
    }
}

/// Run workspace tasks, keeping stdout clean when the report is JSON.
fn run_tasks(args: &ProjectCheckArgs, root: &Path, commands: &str) -> Result<bool, String> {
    // In JSON mode the interactive runner would pollute stdout, so the very
    // same command runs as a child process and its logs are captured instead.
    if args.json {
        return run_tasks_detached(args, root, commands);
    }

    Ok(monorepo_run::execute(&MonorepoRunArgs {
        commands: Some(commands.to_string()),
        packages: args.packages.clone(),
        modules: args.modules.clone(),
        logs: args.logs,
        no_cache: args.no_cache,
        cwd: Some(root.to_string_lossy().to_string()),
    }))
}

fn run_tasks_detached(
    args: &ProjectCheckArgs,
    root: &Path,
    commands: &str,
) -> Result<bool, String> {
    let Ok(exe) = std::env::current_exe() else {
        return Err("Could not locate the talos executable to run the workspace tasks".to_string());
    };

    let mut command = Command::new(exe);
    command
        .arg("monorepo:run")
        .arg(format!("--commands={commands}"))
        .arg("--logs")
        .current_dir(root);
    if let Some(packages) = &args.packages {
        command.arg(format!("--packages={packages}"));
    }
    if let Some(modules) = &args.modules {
        command.arg(format!("--modules={modules}"));
    }
    if args.no_cache {
        command.arg("--no-cache");
    }

    match command.output() {
        Ok(output) => Ok(output.status.success()),
        Err(err) => Err(format!("Could not run the workspace tasks: {err}")),
    }
}

// ---------------------------------------------------------------------------
// End-to-end — the browser suite, opt-in because it boots the application
// ---------------------------------------------------------------------------

/// Modules declaring an `e2e` script, which is what `monorepo:run` would run.
pub fn modules_with_e2e(root: &Path) -> Vec<String> {
    modules::discover_modules(root)
        .into_iter()
        .filter(|module| {
            module
                .package_json()
                .and_then(|manifest| manifest.pointer("/scripts/e2e").cloned())
                .is_some()
        })
        .map(|module| module.label())
        .collect()
}

fn check_e2e(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let runners = modules_with_e2e(root);
    if runners.is_empty() {
        return CheckOutcome::new(
            CheckId::E2e,
            CheckStatus::Skipped,
            "no module declares an `e2e` script",
        )
        .with_hint("Scaffold one with `talos e2e:create --module=<name>`");
    }

    let summary = format!(
        "{} suite{}",
        runners.len(),
        if runners.len() == 1 { "" } else { "s" }
    );

    match run_tasks(args, root, E2E_COMMANDS) {
        Ok(true) => CheckOutcome::new(CheckId::E2e, CheckStatus::Passed, summary),
        Ok(false) => CheckOutcome::new(CheckId::E2e, CheckStatus::Failed, summary)
            .with_details(runners)
            .with_hint("Re-run alone with `talos e2e:run --modules=<name> --logs`"),
        Err(message) => CheckOutcome::new(CheckId::E2e, CheckStatus::Failed, summary)
            .with_details(vec![message]),
    }
}

// ---------------------------------------------------------------------------
// Accessibility — a11y lint of every UI module
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct A11yDiagnostic {
    pub rule: String,
    pub severity: String,
    pub file: String,
    pub line: usize,
    pub message: String,
}

/// A11y diagnostics split by whether the project enforces the rule or not.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct A11yReport {
    pub modules: Vec<String>,
    pub errors: Vec<A11yDiagnostic>,
    pub warnings: Vec<A11yDiagnostic>,
    /// Violations of a11y rules the project turned off in its Biome config.
    pub ignored: BTreeMap<String, usize>,
}

impl A11yReport {
    pub fn violations(&self) -> usize {
        self.errors.len() + self.warnings.len()
    }
}

/// Split Biome's a11y diagnostics into enforced errors, enforced warnings and
/// findings for rules the project explicitly disabled.
pub fn classify_a11y(diagnostics: &[A11yDiagnostic], disabled: &BTreeSet<String>) -> A11yReport {
    let mut report = A11yReport::default();
    for diagnostic in diagnostics {
        if disabled.contains(&diagnostic.rule) {
            *report.ignored.entry(diagnostic.rule.clone()).or_insert(0) += 1;
            continue;
        }
        match diagnostic.severity.as_str() {
            "error" | "fatal" => report.errors.push(diagnostic.clone()),
            _ => report.warnings.push(diagnostic.clone()),
        }
    }
    report
}

/// Parse the `--reporter=json` payload Biome writes, keeping a11y rules only.
pub fn parse_biome_a11y(payload: &str) -> Option<Vec<A11yDiagnostic>> {
    let start = payload.find('{')?;
    let value: Value = serde_json::from_str(payload.get(start..)?).ok()?;
    let diagnostics = value.get("diagnostics")?.as_array()?;

    Some(
        diagnostics
            .iter()
            .filter_map(|diagnostic| {
                let category = diagnostic.get("category")?.as_str()?;
                let rule = category.strip_prefix("lint/a11y/")?;
                let location = diagnostic.get("location");
                Some(A11yDiagnostic {
                    rule: rule.to_string(),
                    severity: diagnostic
                        .get("severity")
                        .and_then(Value::as_str)
                        .unwrap_or("error")
                        .to_string(),
                    file: location
                        .and_then(|location| location.get("path"))
                        .and_then(json_path_to_string)
                        .unwrap_or_default(),
                    line: location
                        .and_then(|location| location.get("start"))
                        .and_then(|start| start.get("line"))
                        .and_then(Value::as_u64)
                        .unwrap_or(0) as usize,
                    message: diagnostic
                        .get("message")
                        .and_then(json_message_to_string)
                        .unwrap_or_default(),
                })
            })
            .collect(),
    )
}

/// Biome writes the path either as a plain string or as `{ "file": "…" }`.
fn json_path_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(path) => Some(path.clone()),
        Value::Object(map) => map
            .values()
            .find_map(Value::as_str)
            .map(str::to_string)
            .or_else(|| Some(String::new())),
        _ => None,
    }
}

/// Messages are either a string or an array of `{ "content": "…" }` chunks.
fn json_message_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(message) => Some(message.clone()),
        Value::Array(chunks) => {
            let joined: String = chunks
                .iter()
                .filter_map(|chunk| match chunk {
                    Value::String(text) => Some(text.clone()),
                    Value::Object(map) => map.get("content").and_then(json_message_to_string),
                    _ => None,
                })
                .collect();
            Some(joined)
        }
        _ => None,
    }
}

/// Read the a11y rules the project switched off in `biome.jsonc`/`biome.json`.
pub fn disabled_a11y_rules(root: &Path) -> BTreeSet<String> {
    let mut disabled = BTreeSet::new();
    for name in ["biome.jsonc", "biome.json"] {
        let Ok(raw) = fs::read_to_string(root.join(name)) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&strip_jsonc(&raw)) else {
            continue;
        };
        let Some(rules) = value
            .get("linter")
            .and_then(|linter| linter.get("rules"))
            .and_then(|rules| rules.get("a11y"))
            .and_then(Value::as_object)
        else {
            continue;
        };
        for (rule, setting) in rules {
            let level = match setting {
                Value::String(level) => Some(level.as_str()),
                Value::Object(map) => map.get("level").and_then(Value::as_str),
                _ => None,
            };
            if level == Some("off") {
                disabled.insert(rule.clone());
            }
        }
    }
    disabled
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UiModule {
    pub name: String,
    pub dir: PathBuf,
}

/// Every module whose declared type renders a user interface.
pub fn discover_ui_modules(root: &Path) -> Vec<UiModule> {
    let mut modules = Vec::new();
    for group in ["modules", "packages"] {
        let Ok(entries) = fs::read_dir(root.join(group)) else {
            continue;
        };
        let mut dirs: Vec<PathBuf> = entries
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| path.is_dir())
            .collect();
        dirs.sort();

        for dir in dirs {
            let Some(name) = dir.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if !dir.join("src").is_dir() {
                continue;
            }
            let is_ui = match read_module_type(&dir, name) {
                Some(module_type) => UI_MODULE_TYPES.contains(&module_type.as_str()),
                None => false,
            };
            if is_ui {
                modules.push(UiModule {
                    name: name.to_string(),
                    dir,
                });
            }
        }
    }
    modules
}

fn read_module_type(dir: &Path, name: &str) -> Option<String> {
    modules::read_module_type(dir, name)
}

fn check_accessibility(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let wanted: Vec<String> = split_csv(args.modules.as_deref())
        .into_iter()
        .chain(split_csv(args.packages.as_deref()))
        .collect();

    let mut modules = discover_ui_modules(root);
    if !wanted.is_empty() {
        modules.retain(|module| wanted.contains(&module.name));
    }

    if modules.is_empty() {
        return CheckOutcome::new(
            CheckId::Accessibility,
            CheckStatus::Skipped,
            "no UI module found (design, spa, admin or storybook)",
        );
    }

    let mut command = {
        let parts = resolve_biome_command(root);
        let mut command = Command::new(&parts[0]);
        command.args(&parts[1..]);
        command
    };
    command
        .arg("lint")
        .arg("--only=a11y")
        .arg("--reporter=json")
        .arg("--max-diagnostics=1000")
        .current_dir(root);
    for module in &modules {
        command.arg(
            module
                .dir
                .join("src")
                .strip_prefix(root)
                .unwrap_or(&module.dir)
                .to_string_lossy()
                .to_string(),
        );
    }

    let output = match command.output() {
        Ok(output) => output,
        Err(err) => {
            return CheckOutcome::new(
                CheckId::Accessibility,
                CheckStatus::Failed,
                "could not run the accessibility linter",
            )
            .with_details(vec![format!("biome could not be started: {err}")])
            .with_hint("Install the workspace dependencies with `bun install`");
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let Some(diagnostics) = parse_biome_a11y(&stdout) else {
        return CheckOutcome::new(
            CheckId::Accessibility,
            CheckStatus::Failed,
            "could not read the accessibility report",
        )
        .with_details(vec![
            String::from_utf8_lossy(&output.stderr)
                .lines()
                .last()
                .unwrap_or("biome returned an unreadable report")
                .to_string(),
        ]);
    };

    let mut report = classify_a11y(&diagnostics, &disabled_a11y_rules(root));
    report.modules = modules.iter().map(|module| module.name.clone()).collect();
    build_a11y_outcome(&report)
}

fn build_a11y_outcome(report: &A11yReport) -> CheckOutcome {
    let scope = format!(
        "{} UI module{}",
        report.modules.len(),
        if report.modules.len() == 1 { "" } else { "s" }
    );

    let status = if !report.errors.is_empty() {
        CheckStatus::Failed
    } else if !report.warnings.is_empty() {
        CheckStatus::Warned
    } else {
        CheckStatus::Passed
    };

    let summary = if report.violations() == 0 {
        format!("{scope} · no violation")
    } else {
        format!(
            "{scope} · {} error{} · {} warning{}",
            report.errors.len(),
            if report.errors.len() == 1 { "" } else { "s" },
            report.warnings.len(),
            if report.warnings.len() == 1 { "" } else { "s" }
        )
    };

    let mut details: Vec<String> = report
        .errors
        .iter()
        .chain(report.warnings.iter())
        .map(|diagnostic| {
            format!(
                "{}:{}  a11y/{}  {}",
                diagnostic.file, diagnostic.line, diagnostic.rule, diagnostic.message
            )
        })
        .collect();
    details = cap_details(details);

    if !report.ignored.is_empty() {
        let mut ignored: Vec<(&String, &usize)> = report.ignored.iter().collect();
        ignored.sort_by(|left, right| right.1.cmp(left.1).then(left.0.cmp(right.0)));
        let listed: Vec<String> = ignored
            .iter()
            .take(3)
            .map(|(rule, count)| format!("{rule} ({count})"))
            .collect();
        details.push(format!(
            "not enforced — disabled in biome config: {}",
            listed.join(", ")
        ));
    }

    let mut outcome =
        CheckOutcome::new(CheckId::Accessibility, status, summary).with_details(details);
    if status != CheckStatus::Passed {
        outcome =
            outcome.with_hint("Fix with `bunx biome check --write` or the `optimize-ui` skill");
    }
    outcome
}

// ---------------------------------------------------------------------------
// Security — dependency audit
// ---------------------------------------------------------------------------

fn check_security(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let audit = match security_check::audit(
        root,
        args.modules.as_deref(),
        args.packages.as_deref(),
        args.audit_level.as_deref(),
    ) {
        Ok(audit) => audit,
        Err(message) if message.is_empty() => {
            return CheckOutcome::new(
                CheckId::Security,
                CheckStatus::Skipped,
                "no lockfile found to audit",
            );
        }
        Err(message) => {
            return CheckOutcome::new(
                CheckId::Security,
                CheckStatus::Skipped,
                "dependency audit unavailable",
            )
            .with_details(vec![message])
            .with_hint("The audit needs network access to https://osv.dev");
        }
    };

    let mut scope = format!(
        "{} dependenc{} scanned",
        audit.dependencies,
        if audit.dependencies == 1 { "y" } else { "ies" }
    );
    if audit.llm_files > 0 {
        scope.push_str(&format!(
            " · {} assistant file{} scanned",
            audit.llm_files,
            if audit.llm_files == 1 { "" } else { "s" }
        ));
    }

    if audit.findings.is_empty() {
        return CheckOutcome::new(
            CheckId::Security,
            CheckStatus::Passed,
            format!("{scope} · no known vulnerability"),
        );
    }

    let breakdown: Vec<String> = ["CRITICAL", "HIGH", "MODERATE", "LOW", "UNKNOWN"]
        .into_iter()
        .filter_map(|severity| {
            let count = audit.count(severity);
            (count > 0).then(|| format!("{count} {}", severity.to_lowercase()))
        })
        .collect();

    let blocking = audit.count("CRITICAL") + audit.count("HIGH");
    let status = if blocking > 0 {
        CheckStatus::Failed
    } else {
        CheckStatus::Warned
    };

    let details = audit
        .findings
        .iter()
        .map(|finding| {
            let subject = if finding.version.is_empty() {
                finding.subject.clone()
            } else {
                format!("{}@{}", finding.subject, finding.version)
            };
            let remediation = if finding.remediation.is_empty() {
                "no patch published".to_string()
            } else if finding.version.is_empty() {
                finding.remediation.clone()
            } else {
                format!("patched {}", finding.remediation)
            };
            format!(
                "{}  {} · {}  {}  {}",
                finding.severity, finding.module, subject, finding.id, remediation
            )
        })
        .collect();

    CheckOutcome::new(
        CheckId::Security,
        status,
        format!(
            "{scope} · {} vulnerabilit{} ({})",
            audit.findings.len(),
            if audit.findings.len() == 1 {
                "y"
            } else {
                "ies"
            },
            breakdown.join(", ")
        ),
    )
    .with_details(details)
    .with_hint("Inspect with `talos security:check` or file them with `--issues`")
}

// ---------------------------------------------------------------------------
// Issues — issue YAML conventions
// ---------------------------------------------------------------------------

fn check_issues(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<String> = split_csv(args.modules.as_deref())
        .into_iter()
        .chain(split_csv(args.packages.as_deref()))
        .collect();

    let report = issue_check::execute(
        root,
        &CheckOptions {
            modules,
            ids: Vec::new(),
        },
    );

    if report.files == 0 && report.diagnostics.is_empty() {
        return CheckOutcome::new(CheckId::Issues, CheckStatus::Skipped, "no issue file found");
    }

    let errors = report.errors();
    let warnings = report.warnings();
    let status = if errors > 0 {
        CheckStatus::Failed
    } else if warnings > 0 {
        CheckStatus::Warned
    } else {
        CheckStatus::Passed
    };

    let scope = format!(
        "{} issue{} · {} module{}",
        report.files,
        if report.files == 1 { "" } else { "s" },
        report.modules,
        if report.modules == 1 { "" } else { "s" }
    );
    let summary = if errors == 0 && warnings == 0 {
        format!("{scope} · no problem")
    } else {
        format!(
            "{scope} · {errors} error{} · {warnings} warning{}",
            if errors == 1 { "" } else { "s" },
            if warnings == 1 { "" } else { "s" }
        )
    };

    let mut diagnostics = report.diagnostics.clone();
    diagnostics.sort_by_key(|diagnostic| std::cmp::Reverse(diagnostic.severity));
    let details = diagnostics
        .iter()
        .map(|diagnostic| {
            let line = diagnostic
                .line
                .map(|line| format!(":{line}"))
                .unwrap_or_default();
            format!(
                "{}  {}{}  {}  {}",
                diagnostic.severity.label(),
                diagnostic.file,
                line,
                diagnostic.rule,
                diagnostic.message
            )
        })
        .collect();

    let mut outcome = CheckOutcome::new(CheckId::Issues, status, summary).with_details(details);
    if status != CheckStatus::Passed {
        outcome = outcome.with_hint("Inspect with `talos issue:check` or fix with `issue-improve`");
    }
    outcome
}

// ---------------------------------------------------------------------------
// Commits — conventional commit messages
// ---------------------------------------------------------------------------

/// A commit message and the conventions it breaks.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommitProblem {
    pub id: String,
    pub header: String,
    pub errors: Vec<String>,
}

/// Lint already-recorded commit messages. Kept separate from git so it is
/// testable without a repository.
pub fn lint_commits(commits: &[(String, String)], scopes: &[String]) -> Vec<CommitProblem> {
    commits
        .iter()
        .filter_map(|(id, message)| {
            let errors = lint_commit_message(message, scopes);
            if errors.is_empty() {
                return None;
            }
            Some(CommitProblem {
                id: id.clone(),
                header: message.lines().next().unwrap_or_default().to_string(),
                errors,
            })
        })
        .collect()
}

/// Commits that are not on the upstream branch yet, or the latest `limit`
/// commits when no upstream is configured. Merge commits are ignored.
fn recent_commits(root: &Path, limit: usize) -> Option<Vec<(String, String)>> {
    let repo = crate::utils::discover_git_repo(root)?;
    let mut walk = repo.revwalk().ok()?;
    walk.push_head().ok()?;

    if let Ok(head) = repo.head()
        && let Ok(name) = head.shorthand()
        && let Ok(branch) = repo.find_branch(name, git2::BranchType::Local)
        && let Ok(upstream) = branch.upstream()
        && let Some(oid) = upstream.get().target()
    {
        let _ = walk.hide(oid);
    }

    let mut commits = Vec::new();
    for oid in walk.flatten() {
        if commits.len() >= limit {
            break;
        }
        let Ok(commit) = repo.find_commit(oid) else {
            continue;
        };
        if commit.parent_count() > 1 {
            continue;
        }
        commits.push((
            oid.to_string().chars().take(7).collect::<String>(),
            commit.message().unwrap_or_default().to_string(),
        ));
    }
    Some(commits)
}

fn check_commits(root: &Path) -> CheckOutcome {
    let Some(commits) = recent_commits(root, COMMIT_HISTORY_LIMIT) else {
        return CheckOutcome::new(
            CheckId::Commits,
            CheckStatus::Skipped,
            "not a git repository",
        );
    };
    if commits.is_empty() {
        return CheckOutcome::new(
            CheckId::Commits,
            CheckStatus::Skipped,
            "no commit to check — everything is pushed",
        );
    }

    let problems = lint_commits(&commits, &get_valid_scopes(root));
    let scope = format!(
        "{} commit{} checked",
        commits.len(),
        if commits.len() == 1 { "" } else { "s" }
    );

    if problems.is_empty() {
        return CheckOutcome::new(
            CheckId::Commits,
            CheckStatus::Passed,
            format!("{scope} · all conventional"),
        );
    }

    let details = problems
        .iter()
        .map(|problem| {
            format!(
                "{}  {}  →  {}",
                problem.id,
                problem.header,
                problem.errors.join(" ")
            )
        })
        .collect();

    CheckOutcome::new(
        CheckId::Commits,
        CheckStatus::Warned,
        format!(
            "{scope} · {} non-conventional message{}",
            problems.len(),
            if problems.len() == 1 { "" } else { "s" }
        ),
    )
    .with_details(details)
    .with_hint("Use the `commit` skill, or `git rebase -i` to reword unpushed commits")
}

// ---------------------------------------------------------------------------
// Hygiene — leftovers that should never reach a branch
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HygieneSeverity {
    Error,
    Warning,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HygieneFinding {
    pub file: String,
    pub line: usize,
    pub rule: &'static str,
    pub severity: HygieneSeverity,
    pub message: String,
}

/// Inspect a single file's content. Split out from the directory walk so the
/// rules can be unit-tested without touching the filesystem.
pub fn scan_source(path: &str, content: &str) -> Vec<HygieneFinding> {
    // The needles are assembled at runtime so this very file never matches.
    let conflict_start = "<".repeat(7);
    let conflict_end = ">".repeat(7);
    // Assembled for the same reason: this file describes the rule.
    let debug_macro = format!("{}!(", "dbg");
    let test_keywords = ["describe", "it", "test"];
    let extension = path.rsplit('.').next().unwrap_or_default();
    let is_source = matches!(extension, "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs");
    let is_rust = extension == "rs";
    let is_python = extension == "py";
    // Prose legitimately quotes markers such as `// TODO`, so documentation is
    // only scanned for conflict markers.
    let is_prose = matches!(extension, "md" | "mdx");

    let mut findings = Vec::new();
    for (index, line) in content.lines().enumerate() {
        let number = index + 1;
        let trimmed = line.trim_start();

        if trimmed.starts_with(&conflict_start) || trimmed.starts_with(&conflict_end) {
            findings.push(HygieneFinding {
                file: path.to_string(),
                line: number,
                rule: "hygiene.conflict-marker",
                severity: HygieneSeverity::Error,
                message: "Unresolved merge conflict marker".to_string(),
            });
            continue;
        }

        if is_source {
            for keyword in test_keywords {
                if line.contains(&format!("{keyword}.only(")) {
                    findings.push(HygieneFinding {
                        file: path.to_string(),
                        line: number,
                        rule: "hygiene.focused-test",
                        severity: HygieneSeverity::Error,
                        message: format!("`{keyword}.only` hides the rest of the suite"),
                    });
                }
                if line.contains(&format!("{keyword}.skip(")) {
                    findings.push(HygieneFinding {
                        file: path.to_string(),
                        line: number,
                        rule: "hygiene.skipped-test",
                        severity: HygieneSeverity::Warning,
                        message: format!("`{keyword}.skip` silently disables a test"),
                    });
                }
            }
        }

        if is_rust {
            // `#[ignore]` is the Rust way of skipping a test, and a `dbg!` is a
            // print statement that survived a debugging session.
            if trimmed.starts_with("#[ignore") {
                findings.push(HygieneFinding {
                    file: path.to_string(),
                    line: number,
                    rule: "hygiene.skipped-test",
                    severity: HygieneSeverity::Warning,
                    message: "`#[ignore]` silently disables a test".to_string(),
                });
            }
            if line.contains(&debug_macro) && !trimmed.starts_with("//") {
                findings.push(HygieneFinding {
                    file: path.to_string(),
                    line: number,
                    rule: "hygiene.debug-print",
                    severity: HygieneSeverity::Warning,
                    message: "`dbg!` left behind — remove it or use the logger".to_string(),
                });
            }
        }

        if is_python {
            // `skip`/`skipif` markers and a debugger call that outlived the
            // session it was added for.
            if trimmed.starts_with("@pytest.mark.skip")
                || trimmed.starts_with("@unittest.skip")
                || trimmed.starts_with("pytest.skip(")
            {
                findings.push(HygieneFinding {
                    file: path.to_string(),
                    line: number,
                    rule: "hygiene.skipped-test",
                    severity: HygieneSeverity::Warning,
                    message: "skip marker silently disables a test".to_string(),
                });
            }
            if trimmed.starts_with("breakpoint()") || line.contains("pdb.set_trace()") {
                findings.push(HygieneFinding {
                    file: path.to_string(),
                    line: number,
                    rule: "hygiene.debug-print",
                    severity: HygieneSeverity::Warning,
                    message: "debugger call left behind — remove it".to_string(),
                });
            }
        }

        if let Some(marker) = bare_marker(line)
            && !is_prose
        {
            findings.push(HygieneFinding {
                file: path.to_string(),
                line: number,
                rule: "hygiene.bare-todo",
                severity: HygieneSeverity::Warning,
                message: format!("Bare `{marker}` comment — track it as an issue instead"),
            });
        }
    }
    findings
}

/// A `TODO`/`FIXME`/`HACK`/`XXX` comment that references neither an issue id
/// nor a URL, which the conventions forbid.
fn bare_marker(line: &str) -> Option<&'static str> {
    let comment = line
        .find("//")
        .map(|index| index + 2)
        .or_else(|| line.find("/*").map(|index| index + 2))
        .or_else(|| line.find('#').map(|index| index + 1))?;
    let rest = line.get(comment..)?.trim_start();

    for marker in ["TODO", "FIXME", "HACK", "XXX"] {
        let Some(tail) = rest.strip_prefix(marker) else {
            continue;
        };
        let tail = tail.trim_start();
        if tail.starts_with('(') || tail.contains("http") {
            return None;
        }
        return Some(match marker {
            "TODO" => "TODO",
            "FIXME" => "FIXME",
            "HACK" => "HACK",
            _ => "XXX",
        });
    }
    None
}

fn scan_hygiene(root: &Path) -> Vec<HygieneFinding> {
    let mut findings = Vec::new();
    walk_sources(root, root, 0, &mut findings);
    findings.sort_by(|left, right| left.file.cmp(&right.file).then(left.line.cmp(&right.line)));
    findings
}

fn walk_sources(root: &Path, dir: &Path, depth: usize, findings: &mut Vec<HygieneFinding>) {
    if depth > 8 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut paths: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
    paths.sort();

    for path in paths {
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if path.is_dir() {
            if name.starts_with('.') || EXCLUDED_DIRS.contains(&name) {
                continue;
            }
            walk_sources(root, &path, depth + 1, findings);
            continue;
        }

        let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("");
        if !SCANNED_EXTENSIONS.contains(&extension) {
            continue;
        }
        if fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0) > MAX_SCANNED_FILE_BYTES {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let relative = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();
        findings.extend(scan_source(&relative, &content));
    }
}

fn check_hygiene(root: &Path) -> CheckOutcome {
    let findings = scan_hygiene(root);
    let errors = findings
        .iter()
        .filter(|finding| finding.severity == HygieneSeverity::Error)
        .count();
    let warnings = findings.len() - errors;

    let status = if errors > 0 {
        CheckStatus::Failed
    } else if warnings > 0 {
        CheckStatus::Warned
    } else {
        CheckStatus::Passed
    };

    if findings.is_empty() {
        return CheckOutcome::new(
            CheckId::Hygiene,
            CheckStatus::Passed,
            "no leftover marker, focused test or bare TODO",
        );
    }

    let details = findings
        .iter()
        .map(|finding| {
            format!(
                "{}:{}  {}  {}",
                finding.file, finding.line, finding.rule, finding.message
            )
        })
        .collect();

    CheckOutcome::new(
        CheckId::Hygiene,
        status,
        format!(
            "{errors} error{} · {warnings} warning{}",
            if errors == 1 { "" } else { "s" },
            if warnings == 1 { "" } else { "s" }
        ),
    )
    .with_details(details)
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/// Render the human report. Returns a string so the layout stays testable.
pub fn render_report(report: &ProjectReport) -> String {
    let width = report
        .outcomes
        .iter()
        .map(|outcome| outcome.id.title().len())
        .max()
        .unwrap_or(0);
    // Keep the durations in one column without letting a long summary push
    // them off screen.
    let summary_width = report
        .outcomes
        .iter()
        .map(|outcome| outcome.summary.chars().count())
        .max()
        .unwrap_or(0)
        .min(64);

    let mut out = String::new();
    out.push('\n');
    out.push_str(&format!(
        "{}{}\n",
        style("▸ Project check").magenta().bold(),
        style(format!(
            "  {} check{} · {}",
            report.outcomes.len(),
            if report.outcomes.len() == 1 { "" } else { "s" },
            report.root
        ))
        .dim()
    ));
    out.push('\n');

    // Sixty rows in one block is a wall. Grouping them under the dimension they
    // belong to is what makes the table skimmable again, and a run narrowed to
    // a single category reads exactly as it did before.
    let grouped = report
        .outcomes
        .iter()
        .map(|outcome| outcome.id.category())
        .collect::<BTreeSet<_>>()
        .len()
        > 1;

    for category in Category::ALL {
        let outcomes: Vec<&CheckOutcome> = report
            .outcomes
            .iter()
            .filter(|outcome| outcome.id.category() == category)
            .collect();
        if outcomes.is_empty() {
            continue;
        }

        if grouped {
            out.push_str(&format!("  {}\n", style(category.title()).dim().bold()));
        }
        for outcome in outcomes {
            out.push_str(&format!(
                "  {}  {}  {}  {}\n",
                outcome.status.icon(),
                style(format!("{:<width$}", outcome.id.title())).bold(),
                outcome
                    .status
                    .paint(&format!("{:<summary_width$}", outcome.summary)),
                style(if outcome.cached {
                    "cached".to_string()
                } else {
                    format_duration(outcome.duration_ms)
                })
                .dim(),
            ));
        }
        if grouped {
            out.push('\n');
        }
    }

    for outcome in &report.outcomes {
        if outcome.details.is_empty() && outcome.hints.is_empty() {
            continue;
        }
        if outcome.status == CheckStatus::Passed {
            continue;
        }
        out.push('\n');
        out.push_str(&format!(
            "  {}\n",
            style(outcome.id.title()).bold().underlined()
        ));
        for detail in &outcome.details {
            out.push_str(&format!("    {} {}\n", style("·").dim(), detail));
        }
        for hint in &outcome.hints {
            out.push_str(&format!("    {}\n", style(format!("→ {hint}")).dim()));
        }
    }

    let failed = report.count(CheckStatus::Failed);
    let warned = report.count(CheckStatus::Warned);
    let passed = report.count(CheckStatus::Passed);
    let skipped = report.count(CheckStatus::Skipped);

    let mut parts = vec![
        format!("{failed} failed"),
        format!("{warned} warning{}", if warned == 1 { "" } else { "s" }),
        format!("{passed} passed"),
    ];
    if skipped > 0 {
        parts.push(format!("{skipped} skipped"));
    }
    let cached = report
        .outcomes
        .iter()
        .filter(|outcome| outcome.cached)
        .count();
    if cached > 0 {
        parts.push(format!("{cached} cached"));
    }

    let (icon, summary) = if failed > 0 {
        (
            style("✖").red().bold().to_string(),
            style(parts.join(" · ")).red().to_string(),
        )
    } else if warned > 0 {
        (
            style("⚠").yellow().bold().to_string(),
            style(parts.join(" · ")).yellow().to_string(),
        )
    } else {
        (
            style("✔").green().bold().to_string(),
            style(parts.join(" · ")).green().to_string(),
        )
    };

    out.push('\n');
    out.push_str(&format!(
        "  {icon} {summary}{}\n",
        style(format!("  in {}", format_duration(report.duration_ms))).dim()
    ));
    out
}

/// Render the machine-readable report used by CI.
pub fn render_json(report: &ProjectReport) -> String {
    let payload = json!({
        "root": report.root,
        "durationMs": report.duration_ms,
        "failed": report.count(CheckStatus::Failed),
        "warnings": report.count(CheckStatus::Warned),
        "passed": report.count(CheckStatus::Passed),
        "skipped": report.count(CheckStatus::Skipped),
        "checks": report
            .outcomes
            .iter()
            .map(|outcome| json!({
                "id": outcome.id.key(),
                "title": outcome.id.title(),
                "category": outcome.id.category().key(),
                "status": outcome.status.label(),
                "cached": outcome.cached,
                "summary": outcome.summary,
                "details": outcome.details,
                "hints": outcome.hints,
                "durationMs": outcome.duration_ms,
            }))
            .collect::<Vec<_>>(),
    });
    serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".to_string())
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/// How far along the run is, one row per category.
///
/// With the checks running at once there is no longer a place to print a header
/// before each and a verdict after it — they would interleave into noise. The
/// shared [`Loader`] draws the categories the report is grouped under, in the
/// same order, so the wait is read the same way the result will be.
struct Progress {
    loader: Loader,
    /// Where each category sits in the loader — only the categories the run
    /// actually selected get a row.
    rows: BTreeMap<Category, usize>,
}

impl Progress {
    fn start(checks: &[CheckId], quiet: bool) -> Self {
        let mut rows = BTreeMap::new();
        let mut groups = Vec::new();
        for category in Category::ALL {
            let total = checks.iter().filter(|id| id.category() == category).count();
            if total == 0 {
                continue;
            }
            rows.insert(category, groups.len());
            groups.push(LoaderGroup::new(category.title(), total));
        }

        Self {
            // In `--json` mode stdout holds the report and nothing may be
            // written beside it.
            loader: if quiet {
                Loader::hidden()
            } else {
                Loader::start(groups)
            },
            rows,
        }
    }

    /// The row a check reports into.
    fn row(&self, id: CheckId) -> usize {
        self.rows.get(&id.category()).copied().unwrap_or_default()
    }

    /// A check that owns the terminal announces itself the old way.
    ///
    /// It keeps the terminal until [`released`](Self::released): the workspace
    /// and end-to-end checks hand off to `monorepo:run`, which draws a live
    /// display of its own that the loader would otherwise overwrite.
    fn announce(&self, id: CheckId) {
        self.loader.pause();
        println!(
            "{}{}",
            style(format!("▸ {}", id.title())).cyan().bold(),
            style(format!("  {}", id.description())).dim()
        );
    }

    /// The announced check is done — take the line back.
    fn released(&self) {
        self.loader.resume();
    }

    fn entered(&self, id: CheckId) {
        self.loader.entered(self.row(id), id.key());
    }

    fn left(&self, id: CheckId) {
        self.loader.left(self.row(id), id.key());
    }

    /// A check that ran with the terminal to itself, so it was never drawn as
    /// running — only counted.
    fn completed(&self, id: CheckId) {
        self.loader.advance(self.row(id));
    }

    /// Consume the progress rows. The loader's `Drop` is what actually tears
    /// them down, so a panic mid-run still restores the cursor.
    fn stop(self) {}
}

/// Run one check, whatever it takes to run it.
fn dispatch(args: &ProjectCheckArgs, root: &Path, id: CheckId) -> CheckOutcome {
    match id {
        CheckId::Workspace => check_workspace(args, root),
        CheckId::Structure => structure::run(args, root),
        CheckId::Folders => folders::run(args, root),
        CheckId::Tsconfig => tsconfig::run(args, root),
        CheckId::Lockfile => lockfile::run(args, root),
        CheckId::Conventions => conventions::run(args, root),
        CheckId::Imports => imports::run(args, root),
        CheckId::Boundaries => boundaries::run(args, root),
        CheckId::Restricted => restricted::run(args, root),
        CheckId::Container => container::run(args, root),
        CheckId::Registration => registration::run(args, root),
        CheckId::Middlewares => middlewares::run(args, root),
        CheckId::Routes => routes::run(args, root),
        CheckId::Openapi => openapi::run(args, root),
        CheckId::Pagination => pagination::run(args, root),
        CheckId::Validation => validation::run(args, root),
        CheckId::Roles => roles::run(args, root),
        CheckId::Permissions => permissions::run(args, root),
        CheckId::Entities => entities::run(args, root),
        CheckId::Indexes => indexes::run(args, root),
        CheckId::Repositories => repositories::run(args, root),
        CheckId::Transactions => transactions::run(args, root),
        CheckId::Sql => sql::run(args, root),
        CheckId::Async => asynchrony::run(args, root),
        CheckId::Exceptions => exceptions::run(args, root),
        CheckId::Logging => logging::run(args, root),
        CheckId::Complexity => complexity::run(args, root),
        CheckId::Orphans => orphans::run(args, root),
        CheckId::Events => events::run(args, root),
        CheckId::Queues => queues::run(args, root),
        CheckId::Crons => crons::run(args, root),
        CheckId::Workflows => workflows::run(args, root),
        CheckId::Mailers => mailers::run(args, root),
        CheckId::Flags => flags::run(args, root),
        CheckId::Env => env::run(args, root),
        CheckId::Dependencies => dependencies::run(args, root),
        CheckId::Outdated => outdated::run(args, root),
        CheckId::Docker => docker::run(args, root),
        CheckId::Migrations => migrations::run(args, root),
        CheckId::Accessibility => check_accessibility(args, root),
        CheckId::Contrast => contrast::run(args, root),
        CheckId::Tokens => tokens::run(args, root),
        CheckId::Assets => assets::run(args, root),
        CheckId::Translations => translations::run(args, root),
        CheckId::Stories => stories::run(args, root),
        CheckId::Router => router::run(args, root),
        CheckId::Queries => queries::run(args, root),
        CheckId::Sdk => sdk::run(args, root),
        CheckId::Tests => tests::run(args, root),
        CheckId::E2eCoverage => e2e_coverage::run(args, root),
        CheckId::Docs => docs::run(args, root),
        CheckId::Bundle => bundle::run(args, root),
        CheckId::Security => check_security(args, root),
        CheckId::Secrets => secrets::run(args, root),
        CheckId::Git => git::run(args, root),
        CheckId::Issues => check_issues(args, root),
        CheckId::Todos => todos::run(args, root),
        CheckId::Branches => branches::run(args, root),
        CheckId::Commits => check_commits(root),
        CheckId::Hygiene => check_hygiene(root),
        CheckId::E2e => check_e2e(args, root),
    }
}

/// Run a check, timing it, and reuse the cached outcome when the tree it was
/// produced from has not moved.
fn run_check(
    args: &ProjectCheckArgs,
    root: &Path,
    id: CheckId,
    cache: Option<&(String, cache::Fingerprints)>,
) -> CheckOutcome {
    let cache = cache.filter(|_| id.cacheable());

    if let Some((options, fingerprints)) = cache
        && let Some(entry) = cache::read(root, id)
        && entry.matches(options, id.reads(), fingerprints)
        && let Some(outcome) = entry.outcome(id)
    {
        return outcome;
    }

    let started_at = Instant::now();
    let mut outcome = dispatch(args, root, id);
    outcome.duration_ms = started_at.elapsed().as_millis() as u64;

    if let Some((options, fingerprints)) = cache {
        cache::write(root, id, options, fingerprints, &outcome);
    }
    outcome
}

/// Run every selected check and collect the report. Never exits the process.
///
/// The reads all happen at once: every check but the workspace gate and the
/// end-to-end suite only looks at files, so there is nothing to serialise them
/// for. Those two do run alone — the first because its install is what puts the
/// tools the others shell out to on disk, the last because it boots the
/// application — which is also the order they were already in.
pub fn execute(args: &ProjectCheckArgs, checks: &[CheckId]) -> ProjectReport {
    let root = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let started_at = Instant::now();

    // Fingerprinting is only worth its own walk when something in the run can
    // actually be served from a cache entry.
    let hashes = (!args.no_cache && checks.iter().any(|id| id.cacheable()))
        .then(|| cache::FileHashes::load(&root));
    // The walk is the one stretch before the loader where nothing is printed,
    // so it gets a spinner of its own.
    let spinner =
        (hashes.is_some() && !args.json).then(|| Spinner::start("Fingerprinting the workspace..."));
    let cache = hashes.as_ref().map(|hashes| {
        let modules = modules::filter_modules(
            modules::discover_modules(&root),
            &modules::wanted_names(args.modules.as_deref(), args.packages.as_deref()),
        );
        (
            cache::options_key(args),
            cache::Fingerprints::build(&root, &modules, hashes),
        )
    });
    drop(spinner);

    let mut outcomes: Vec<Option<CheckOutcome>> = vec![None; checks.len()];
    let progress = Progress::start(checks, args.json);

    // The workspace gate first, on its own and with the terminal to itself.
    for (index, id) in checks
        .iter()
        .enumerate()
        .filter(|(_, id)| **id == CheckId::Workspace)
    {
        progress.announce(*id);
        outcomes[index] = Some(run_check(args, &root, *id, cache.as_ref()));
        progress.completed(*id);
        progress.released();
    }

    let concurrent: Vec<(usize, CheckId)> = checks
        .iter()
        .enumerate()
        .filter(|(_, id)| !id.is_serial())
        .map(|(index, id)| (index, *id))
        .collect();

    let done: Vec<(usize, CheckOutcome)> = concurrent
        .par_iter()
        .map(|(index, id)| {
            progress.entered(*id);
            let outcome = run_check(args, &root, *id, cache.as_ref());
            progress.left(*id);
            (*index, outcome)
        })
        .collect();
    for (index, outcome) in done {
        outcomes[index] = Some(outcome);
    }

    // The end-to-end suite last: it needs the build the workspace produced.
    for (index, id) in checks
        .iter()
        .enumerate()
        .filter(|(_, id)| **id == CheckId::E2e)
    {
        progress.announce(*id);
        outcomes[index] = Some(run_check(args, &root, *id, cache.as_ref()));
        progress.completed(*id);
        progress.released();
    }

    progress.stop();
    if let Some(hashes) = hashes.as_ref() {
        hashes.save();
    }

    ProjectReport {
        root: root.to_string_lossy().to_string(),
        outcomes: outcomes.into_iter().flatten().collect(),
        duration_ms: started_at.elapsed().as_millis() as u64,
    }
}

pub fn run(args: &ProjectCheckArgs) {
    let extra: Vec<CheckId> = args
        .e2e
        .then_some(CheckId::E2e)
        .into_iter()
        .chain(args.outdated.then_some(CheckId::Outdated))
        .collect();
    let checks = match select_checks(args.only.as_deref(), args.skip.as_deref(), &extra) {
        Ok(checks) => checks,
        Err(message) => {
            error(message);
            std::process::exit(1);
        }
    };

    let report = execute(args, &checks);

    if args.json {
        println!("{}", render_json(&report));
    } else {
        print!("{}", render_report(&report));
    }

    if report.is_failure(args.strict) {
        std::process::exit(1);
    }
}
