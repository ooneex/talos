//! `CheckId` metadata: the human-facing category, key, title and description
//! every check carries, split from [`super::check_id_flags`] purely to stay
//! under the file-size budget — both halves extend the same `impl CheckId`.

use super::types::{Category, CheckId};

impl CheckId {
    /// Every check, in execution order. The workspace runs first because the
    /// install it performs is what makes the other tools available, and the
    /// end-to-end suite runs last because it needs the build they produce.
    pub const ALL: [CheckId; 64] = [
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
        CheckId::Health,
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
        CheckId::Duplication,
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
        CheckId::Coverage,
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

    /// Checks that run when nothing is requested explicitly. Derived from
    /// `ALL` by excluding the two opt-in checks, so the two lists can never
    /// drift apart. The end-to-end suite is opt-in because it boots the
    /// application, and the outdated check because it queries the public
    /// registries for every dependency.
    pub const DEFAULT: [CheckId; 62] = Self::default_checks();

    /// Builds `DEFAULT` from `ALL` at compile time.
    const fn default_checks() -> [CheckId; 62] {
        let mut result = [CheckId::Workspace; 62];
        let mut source = 0;
        let mut target = 0;
        while source < CheckId::ALL.len() {
            let id = CheckId::ALL[source];
            if !matches!(id, CheckId::Outdated | CheckId::E2e) {
                result[target] = id;
                target += 1;
            }
            source += 1;
        }
        result
    }

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
            | CheckId::Duplication
            | CheckId::Orphans => Category::Architecture,

            CheckId::Middlewares
            | CheckId::Routes
            | CheckId::Openapi
            | CheckId::Health
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
            | CheckId::Coverage
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
            CheckId::Health => "health",
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
            CheckId::Duplication => "duplication",
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
            CheckId::Coverage => "coverage",
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
            CheckId::Health => "Health",
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
            CheckId::Duplication => "Duplication",
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
            CheckId::Coverage => "Coverage",
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
            CheckId::Workspace => {
                "install, build, fmt and lint every package and module, then measure their suites"
            }
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
            CheckId::Routes => "unique endpoints, named, described, versioned and guarded",
            CheckId::Openapi => "the published specification against the controllers",
            CheckId::Health => "a liveness route every deployed service answers",
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
            CheckId::Duplication => "blocks of code written more than once",
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
            CheckId::Tests => "a spec file in every module that carries tests/",
            CheckId::Coverage => "every suite, and how much of its module it covers",
            CheckId::E2eCoverage => "an end-to-end suite for every module that serves",
            CheckId::Docs => "relative links in every markdown document",
            CheckId::Bundle => "shipped source maps and stale build output",
            CheckId::Security => "dependency audit against OSV.dev",
            CheckId::Secrets => "credentials in the working tree",
            CheckId::Git => "build output in the index and .gitignore coverage",
            CheckId::Issues => "issue YAML conventions",
            CheckId::Todos => "markers against the issues they name",
            CheckId::Branches => "issue branches against the branches that exist",
            CheckId::Commits => "conventional commit messages",
            CheckId::Hygiene => "conflict markers, focused tests and bare TODOs",
            CheckId::E2e => "the end-to-end suite of every module",
        }
    }
}
