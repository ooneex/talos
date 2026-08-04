//! `CheckId` execution flags: whether a check is opt-in, cacheable, how it
//! narrows the workspace it reads, whether it must run serially, and parsing
//! a check id back from its `--only`/`--skip` key.

use super::types::{CheckId, Reads};

impl CheckId {
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
                | CheckId::Coverage
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
            | CheckId::Health
            | CheckId::Validation
            | CheckId::Roles
            | CheckId::Entities
            | CheckId::Sql
            | CheckId::Async
            | CheckId::Logging
            | CheckId::Complexity
            | CheckId::Duplication
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
            | CheckId::Coverage
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
        matches!(self, CheckId::Workspace | CheckId::Coverage | CheckId::E2e)
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
            "health" | "healthcheck" | "liveness" | "probe" => Some(CheckId::Health),
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
            "duplication" | "duplicates" | "clones" | "copy-paste" => Some(CheckId::Duplication),
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
            "tests" | "test" | "specs" => Some(CheckId::Tests),
            "coverage" | "cov" | "suites" => Some(CheckId::Coverage),
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
