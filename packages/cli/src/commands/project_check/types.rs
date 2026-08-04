//! Core check identifiers: `CheckId` (the fifty-nine checks), `Reads` (how a
//! check narrows the workspace it inspects) and `Category` (the summary
//! grouping `--only`/`--skip` accept in place of individual check names).

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
    Health,
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
    Duplication,
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
    Coverage,
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
