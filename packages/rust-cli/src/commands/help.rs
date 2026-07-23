use clap::Args;

/// Rust port of `packages/cli/src/commands/HelpCommand.ts`. Mirrors the
/// TypeScript CLI's `COMMANDS_CONTAINER` registry with a static list, since
/// `rust-cli` has no runtime command registry to iterate.
#[derive(Args, Debug)]
pub struct HelpArgs {}

/// `(name, description)` for every command registered in [`super::Commands`].
/// Kept in sync manually with the `#[command(name = "...")]` attributes and
/// doc comments there.
const COMMANDS: &[(&str, &str)] = &[
    ("ai:chat:create", "Generate a new AI chat class"),
    ("ai:middleware:create", "Generate a new AI middleware class"),
    ("ai:tool:create", "Generate a new AI tool class"),
    ("analytics:create", "Generate a new analytics class"),
    (
        "agent:skills:create",
        "Scaffold skills and configuration for coding assistants",
    ),
    (
        "app:create",
        "Create a new API application, with optional CI/CD scaffolding",
    ),
    (
        "app:init",
        "Initialize a new application from the Talos skeleton",
    ),
    (
        "bitbucket:credentials:create",
        "Save a Bitbucket app password under the user config",
    ),
    (
        "bitbucket:secret:push",
        "Create or update a Bitbucket Pipelines repository variable",
    ),
    ("build", "Alias for `monorepo:run --commands=build`"),
    ("cache:create", "Generate a new cache class"),
    ("check", "Alias for `monorepo:check`"),
    ("command:create", "Generate a new command class"),
    ("command:run", "Run a custom command from a module"),
    ("controller:create", "Generate a new controller class"),
    ("completion:bash", "Install Bash completion for oo command"),
    ("completion:fish", "Install Fish completion for oo command"),
    ("completion:zsh", "Install Zsh completion for oo command"),
    (
        "commitlint:check",
        "Validate a commit message file against the conventional-commit rules",
    ),
    (
        "commitlint:init",
        "Install the git commit-msg hook that lints commit messages",
    ),
    ("cron:create", "Generate a new cron class"),
    ("database:create", "Generate a new database class"),
    ("design:create", "Generate a new design module"),
    ("design:remove", "Remove an existing design module"),
    (
        "docker:create",
        "Add a docker service to docker-compose.yml",
    ),
    (
        "docker:publish",
        "Build and push a package or module Docker image to Docker Hub",
    ),
    (
        "docker:credentials:create",
        "Save a Docker registry access token under the user config",
    ),
    ("e2e:run", "Alias for `monorepo:run --commands=e2e`"),
    ("entity:create", "Generate a new TypeORM entity class"),
    ("event:create", "Generate a new event class"),
    ("flag:create", "Generate a new feature flag class"),
    ("fmt", "Alias for `monorepo:run --commands=fmt`"),
    (
        "github:credentials:create",
        "Save a GitHub Personal Access Token under the user config",
    ),
    (
        "github:secret:push",
        "Create or update a GitHub Actions secret on a repository",
    ),
    (
        "gitlab:credentials:create",
        "Save a GitLab Personal Access Token under the user config",
    ),
    (
        "gitlab:secret:push",
        "Create or update a GitLab CI/CD variable on a project",
    ),
    ("help", "Show available commands"),
    (
        "issue:create",
        "Create a YAML skeleton file for a new issue",
    ),
    (
        "issue:pull",
        "Pull an issue from Linear and save it as a YAML file",
    ),
    (
        "issue:push",
        "Push a local issue YAML to Linear (create or update)",
    ),
    (
        "jira:credentials:create",
        "Save a Jira API token under the user config",
    ),
    (
        "linear:credentials:create",
        "Save a Linear Personal API key under the user config",
    ),
    ("lint", "Alias for `monorepo:run --commands=lint`"),
    ("logger:create", "Generate a new logger class"),
    ("mailer:create", "Generate a new mailer class"),
    ("microservice:create", "Generate a new microservice"),
    ("microservice:remove", "Remove an existing microservice"),
    ("middleware:create", "Generate a new middleware class"),
    (
        "migration:down",
        "Roll back the latest applied migration across every module",
    ),
    (
        "migration:up",
        "Apply pending migrations across every module",
    ),
    ("module:create", "Generate a new module"),
    ("module:remove", "Remove an existing module"),
    (
        "monorepo:check",
        "Run the full verification pipeline: install, build, fmt, lint, test",
    ),
    (
        "monorepo:run",
        "Run one or more scripts across every discovered module/package, with caching",
    ),
    (
        "npm:credentials:create",
        "Save an npm Granular Access Token under the user config",
    ),
    ("npm:publish", "Publish a package or module to npm"),
    ("permission:create", "Generate a new permission class"),
    ("queue:create", "Generate a new queue class"),
    ("rate-limit:create", "Generate a new rate limiter class"),
    ("repository:create", "Generate a new repository class"),
    (
        "react:component:create",
        "Generate a new react component (with test) in a module or feature components folder",
    ),
    (
        "release:create",
        "Release packages with version bump, changelog, and git tag",
    ),
    ("migration:create", "Generate a new migration file"),
    (
        "run",
        "Alias for `monorepo:run`, forwarding every option untouched",
    ),
    ("seed:create", "Generate a new seed file"),
    (
        "sdk:create",
        "Generate a browser SDK from module controllers",
    ),
    ("seed:run", "Run seed data across every module"),
    ("service:create", "Generate a new service class"),
    ("spa:create", "Generate a new spa module"),
    ("storage:create", "Generate a new storage class"),
    (
        "spa:feature:create",
        "Generate a new spa feature (route, layout, hooks and folders)",
    ),
    ("spa:remove", "Remove an existing spa module"),
    ("test", "Alias for `monorepo:run --commands=test`"),
    ("translation:create", "Generate a new translation class"),
    ("upgrade", "Upgrade the CLI to its latest version"),
    (
        "vector-database:create",
        "Generate a new vector database class",
    ),
    ("version", "Print the installed CLI version"),
    ("workflow:create", "Generate a new workflow class"),
    (
        "workflow:transition:create",
        "Generate a new workflow transition class",
    ),
];

pub fn run(_args: &HelpArgs) {
    let mut commands: Vec<(&str, &str)> = COMMANDS.to_vec();
    commands.sort_by(|a, b| a.0.cmp(b.0));

    let max_name_length = commands
        .iter()
        .map(|(name, _)| name.len())
        .max()
        .unwrap_or(0);

    println!();
    println!("Available commands:");
    println!();
    for (name, description) in commands {
        println!(
            "  {:width$}{description}",
            name,
            width = max_name_length + 2
        );
    }
    println!();
}
