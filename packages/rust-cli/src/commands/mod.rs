pub mod agent_skills_create;
pub mod ai_chat_create;
pub mod ai_middleware_create;
pub mod ai_tool_create;
pub mod analytics_create;
pub mod app_create;
pub mod app_init;
pub mod app_start;
pub mod app_stop;
pub mod bitbucket_credentials_create;
pub mod bitbucket_secret_push;
pub mod build;
pub mod cache_create;
pub mod check;
pub mod command_create;
pub mod command_run;
pub mod commitlint_check;
pub mod commitlint_init;
pub mod completion_bash;
pub mod completion_fish;
pub mod completion_zsh;
pub mod controller_create;
pub mod cron_create;
pub mod database_create;
pub mod design_create;
pub mod design_remove;
pub mod docker_create;
pub mod docker_credentials_create;
pub mod docker_publish;
pub mod e2e_create;
pub mod e2e_run;
pub mod entity_create;
pub mod event_create;
pub mod feature_flag_create;
pub mod fmt;
pub mod github_credentials_create;
pub mod github_secret_push;
pub mod gitlab_credentials_create;
pub mod gitlab_secret_push;
pub mod help;
pub mod issue_create;
pub mod issue_pull;
pub mod issue_push;
pub mod jira_credentials_create;
pub mod linear_credentials_create;
pub mod lint;
pub mod logger_create;
pub mod mailer_create;
pub mod microservice_create;
pub mod microservice_remove;
pub mod middleware_create;
pub mod migration_create;
pub mod migration_down;
pub mod migration_up;
pub mod module_create;
pub mod module_remove;
pub mod monorepo_check;
pub mod monorepo_run;
pub mod npm_credentials_create;
pub mod npm_publish;
pub mod permission_create;
pub mod queue_create;
pub mod rate_limit_create;
pub mod react_component_create;
pub mod release_create;
pub mod repository_create;
pub mod run;
pub mod sdk_create;
pub mod seed_create;
pub mod seed_run;
pub mod service_create;
pub mod spa_create;
pub mod spa_feature_create;
pub mod spa_remove;
pub mod storage_create;
pub mod test;
pub mod translation_create;
pub mod upgrade;
pub mod vector_database_create;
pub mod version;
pub mod workflow_create;
pub mod workflow_transition_create;

use clap::Subcommand;

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Initialize a new application from the Talos skeleton.
    #[command(name = "app:init")]
    AppInit(app_init::AppInitArgs),

    /// Create a new API application, with optional CI/CD scaffolding.
    #[command(name = "app:create")]
    AppCreate(app_create::AppCreateArgs),

    /// Start the application.
    #[command(name = "app:start")]
    AppStart(app_start::AppStartArgs),

    /// Stop the application.
    #[command(name = "app:stop")]
    AppStop(app_stop::AppStopArgs),

    /// Generate a new module.
    #[command(name = "module:create")]
    ModuleCreate(module_create::ModuleCreateArgs),

    /// Remove an existing module.
    #[command(name = "module:remove")]
    ModuleRemove(module_remove::ModuleRemoveArgs),

    /// Generate a new AI chat class.
    #[command(name = "ai:chat:create")]
    AiChatCreate(ai_chat_create::AiChatCreateArgs),

    /// Generate a new AI middleware class.
    #[command(name = "ai:middleware:create")]
    AiMiddlewareCreate(ai_middleware_create::AiMiddlewareCreateArgs),

    /// Scaffold skills and configuration for coding assistants.
    #[command(name = "agent:skills:create")]
    AgentSkillsCreate(agent_skills_create::AgentSkillsCreateArgs),

    /// Generate a new AI tool class.
    #[command(name = "ai:tool:create")]
    AiToolCreate(ai_tool_create::AiToolCreateArgs),

    /// Generate a new analytics class.
    #[command(name = "analytics:create")]
    AnalyticsCreate(analytics_create::AnalyticsCreateArgs),

    /// Generate a new cache class.
    #[command(name = "cache:create")]
    CacheCreate(cache_create::CacheCreateArgs),

    /// Generate a new cron class.
    #[command(name = "cron:create")]
    CronCreate(cron_create::CronCreateArgs),

    /// Generate a new event class.
    #[command(name = "event:create")]
    EventCreate(event_create::EventCreateArgs),

    /// Generate a new TypeORM entity class.
    #[command(name = "entity:create")]
    EntityCreate(entity_create::EntityCreateArgs),

    /// Generate a new repository class.
    #[command(name = "repository:create")]
    RepositoryCreate(repository_create::RepositoryCreateArgs),

    /// Generate a new react component (with test) in a module or feature components folder.
    #[command(name = "react:component:create")]
    ReactComponentCreate(react_component_create::ReactComponentCreateArgs),

    /// Release packages with version bump, changelog, and git tag.
    #[command(name = "release:create")]
    ReleaseCreate(release_create::ReleaseCreateArgs),

    /// Generate a new migration file.
    #[command(name = "migration:create")]
    MigrationCreate(migration_create::MigrationCreateArgs),

    /// Generate a new seed file.
    #[command(name = "seed:create")]
    SeedCreate(seed_create::SeedCreateArgs),

    /// Generate a browser SDK from module controllers.
    #[command(name = "sdk:create")]
    SdkCreate(sdk_create::SdkCreateArgs),

    /// Generate a new database class.
    #[command(name = "database:create")]
    DatabaseCreate(database_create::DatabaseCreateArgs),

    /// Generate a new design module.
    #[command(name = "design:create")]
    DesignCreate(design_create::DesignCreateArgs),

    /// Remove an existing design module.
    #[command(name = "design:remove")]
    DesignRemove(design_remove::DesignRemoveArgs),

    /// Add a docker service to docker-compose.yml.
    #[command(name = "docker:create")]
    DockerCreate(docker_create::DockerCreateArgs),

    /// Build and push a package or module Docker image to Docker Hub.
    #[command(name = "docker:publish")]
    DockerPublish(docker_publish::DockerPublishArgs),

    /// Generate a new mailer class.
    #[command(name = "mailer:create")]
    MailerCreate(mailer_create::MailerCreateArgs),

    /// Create a YAML skeleton file for a new issue.
    #[command(name = "issue:create")]
    IssueCreate(issue_create::IssueCreateArgs),

    /// Pull an issue from Linear and save it as a YAML file.
    #[command(name = "issue:pull")]
    IssuePull(issue_pull::IssuePullArgs),

    /// Push a local issue YAML to Linear (create or update).
    #[command(name = "issue:push")]
    IssuePush(issue_push::IssuePushArgs),

    /// Generate a new microservice.
    #[command(name = "microservice:create")]
    MicroserviceCreate(microservice_create::MicroserviceCreateArgs),

    /// Remove an existing microservice.
    #[command(name = "microservice:remove")]
    MicroserviceRemove(microservice_remove::MicroserviceRemoveArgs),

    /// Generate a new command class.
    #[command(name = "command:create")]
    CommandCreate(command_create::CommandCreateArgs),

    /// Run a custom command from a module.
    #[command(name = "command:run")]
    CommandRun(command_run::CommandRunArgs),

    /// Generate a new controller class.
    #[command(name = "controller:create")]
    ControllerCreate(controller_create::ControllerCreateArgs),

    /// Generate a new feature flag class.
    #[command(name = "flag:create")]
    FeatureFlagCreate(feature_flag_create::FeatureFlagCreateArgs),

    /// Generate a new logger class.
    #[command(name = "logger:create")]
    LoggerCreate(logger_create::LoggerCreateArgs),

    /// Generate a new middleware class.
    #[command(name = "middleware:create")]
    MiddlewareCreate(middleware_create::MiddlewareCreateArgs),

    /// Generate a new permission class.
    #[command(name = "permission:create")]
    PermissionCreate(permission_create::PermissionCreateArgs),

    /// Generate a new queue class.
    #[command(name = "queue:create")]
    QueueCreate(queue_create::QueueCreateArgs),

    /// Generate a new rate limiter class.
    #[command(name = "rate-limit:create")]
    RateLimitCreate(rate_limit_create::RateLimitCreateArgs),

    /// Generate a new service class.
    #[command(name = "service:create")]
    ServiceCreate(service_create::ServiceCreateArgs),

    /// Generate a new storage class.
    #[command(name = "storage:create")]
    StorageCreate(storage_create::StorageCreateArgs),

    /// Generate a new spa module.
    #[command(name = "spa:create")]
    SpaCreate(spa_create::SpaCreateArgs),

    /// Generate a new vector database class.
    #[command(name = "vector-database:create")]
    VectorDatabaseCreate(vector_database_create::VectorDatabaseCreateArgs),

    /// Generate a new workflow class.
    #[command(name = "workflow:create")]
    WorkflowCreate(workflow_create::WorkflowCreateArgs),

    /// Generate a new workflow transition class.
    #[command(name = "workflow:transition:create")]
    WorkflowTransitionCreate(workflow_transition_create::WorkflowTransitionCreateArgs),

    /// Save a GitHub Personal Access Token under the user config.
    #[command(name = "github:credentials:create")]
    GithubCredentialsCreate(github_credentials_create::GithubCredentialsCreateArgs),

    /// Create or update a GitHub Actions secret on a repository.
    #[command(name = "github:secret:push")]
    GithubSecretPush(github_secret_push::GithubSecretPushArgs),

    /// Save a GitLab Personal Access Token under the user config.
    #[command(name = "gitlab:credentials:create")]
    GitlabCredentialsCreate(gitlab_credentials_create::GitlabCredentialsCreateArgs),

    /// Create or update a GitLab CI/CD variable on a project.
    #[command(name = "gitlab:secret:push")]
    GitlabSecretPush(gitlab_secret_push::GitlabSecretPushArgs),

    /// Save a Bitbucket app password under the user config.
    #[command(name = "bitbucket:credentials:create")]
    BitbucketCredentialsCreate(bitbucket_credentials_create::BitbucketCredentialsCreateArgs),

    /// Create or update a Bitbucket Pipelines repository variable.
    #[command(name = "bitbucket:secret:push")]
    BitbucketSecretPush(bitbucket_secret_push::BitbucketSecretPushArgs),

    /// Save a Docker registry access token under the user config.
    #[command(name = "docker:credentials:create")]
    DockerCredentialsCreate(docker_credentials_create::DockerCredentialsCreateArgs),

    /// Save a Jira API token under the user config.
    #[command(name = "jira:credentials:create")]
    JiraCredentialsCreate(jira_credentials_create::JiraCredentialsCreateArgs),

    /// Save a Linear Personal API key under the user config.
    #[command(name = "linear:credentials:create")]
    LinearCredentialsCreate(linear_credentials_create::LinearCredentialsCreateArgs),

    /// Save an npm Granular Access Token under the user config.
    #[command(name = "npm:credentials:create")]
    NpmCredentialsCreate(npm_credentials_create::NpmCredentialsCreateArgs),

    /// Publish a package or module to npm.
    #[command(name = "npm:publish")]
    NpmPublish(npm_publish::NpmPublishArgs),

    /// Upgrade the CLI to its latest version.
    #[command(name = "upgrade")]
    Upgrade(upgrade::UpgradeArgs),

    /// Print the installed CLI version.
    #[command(name = "version")]
    Version(version::VersionArgs),

    /// Show available commands.
    #[command(name = "help")]
    Help(help::HelpArgs),

    /// Install Bash completion for the talos/oo commands.
    #[command(name = "completion:bash")]
    CompletionBash(completion_bash::CompletionBashArgs),

    /// Install Fish completion for the talos/oo commands.
    #[command(name = "completion:fish")]
    CompletionFish(completion_fish::CompletionFishArgs),

    /// Install Zsh completion for the talos/oo commands.
    #[command(name = "completion:zsh")]
    CompletionZsh(completion_zsh::CompletionZshArgs),

    /// Run one or more scripts across every discovered module/package, with caching.
    #[command(name = "monorepo:run")]
    MonorepoRun(monorepo_run::MonorepoRunArgs),

    /// Alias for `monorepo:run`, forwarding every option untouched.
    #[command(name = "run")]
    Run(run::RunArgs),

    /// Alias for `monorepo:run --commands=build`.
    #[command(name = "build")]
    Build(build::BuildArgs),

    /// Validate a commit message file against the conventional-commit rules.
    #[command(name = "commitlint:check")]
    CommitlintCheck(commitlint_check::CommitlintCheckArgs),

    /// Install the git commit-msg hook that lints commit messages.
    #[command(name = "commitlint:init")]
    CommitlintInit(commitlint_init::CommitlintInitArgs),

    /// Alias for `monorepo:run --commands=fmt`.
    #[command(name = "fmt")]
    Fmt(fmt::FmtArgs),

    /// Alias for `monorepo:run --commands=lint`.
    #[command(name = "lint")]
    Lint(lint::LintArgs),

    /// Alias for `monorepo:run --commands=test`.
    #[command(name = "test")]
    Test(test::TestArgs),

    /// Generate a new translation class.
    #[command(name = "translation:create")]
    TranslationCreate(translation_create::TranslationCreateArgs),

    /// Generate a new Playwright e2e test.
    #[command(name = "e2e:create")]
    E2eCreate(e2e_create::E2eCreateArgs),

    /// Alias for `monorepo:run --commands=e2e`.
    #[command(name = "e2e:run")]
    E2eRun(e2e_run::E2eRunArgs),

    /// Generate a new spa feature (route, layout, hooks and folders).
    #[command(name = "spa:feature:create")]
    SpaFeatureCreate(spa_feature_create::SpaFeatureCreateArgs),

    /// Remove an existing spa module.
    #[command(name = "spa:remove")]
    SpaRemove(spa_remove::SpaRemoveArgs),

    /// Run the full verification pipeline: install, build, fmt, lint, test.
    #[command(name = "monorepo:check")]
    MonorepoCheck(monorepo_check::MonorepoCheckArgs),

    /// Alias for `monorepo:check`.
    #[command(name = "check")]
    Check(check::CheckArgs),

    /// Apply pending migrations across every module.
    #[command(name = "migration:up")]
    MigrationUp(migration_up::MigrationUpArgs),

    /// Roll back the latest applied migration across every module.
    #[command(name = "migration:down")]
    MigrationDown(migration_down::MigrationDownArgs),

    /// Run seed data across every module.
    #[command(name = "seed:run")]
    SeedRun(seed_run::SeedRunArgs),
}

impl Commands {
    pub fn run(&self) {
        match self {
            Commands::AppInit(args) => app_init::run(args),
            Commands::AppCreate(args) => app_create::run(args),
            Commands::AppStart(args) => app_start::run(args),
            Commands::AppStop(args) => app_stop::run(args),
            Commands::ModuleCreate(args) => module_create::run(args),
            Commands::ModuleRemove(args) => module_remove::run(args),
            Commands::AiChatCreate(args) => ai_chat_create::run(args),
            Commands::AiMiddlewareCreate(args) => ai_middleware_create::run(args),
            Commands::AgentSkillsCreate(args) => agent_skills_create::run(args),
            Commands::AiToolCreate(args) => ai_tool_create::run(args),
            Commands::AnalyticsCreate(args) => analytics_create::run(args),
            Commands::CacheCreate(args) => cache_create::run(args),
            Commands::CronCreate(args) => cron_create::run(args),
            Commands::EventCreate(args) => event_create::run(args),
            Commands::EntityCreate(args) => entity_create::run(args),
            Commands::RepositoryCreate(args) => repository_create::run(args),
            Commands::ReactComponentCreate(args) => react_component_create::run(args),
            Commands::ReleaseCreate(args) => release_create::run(args),
            Commands::MigrationCreate(args) => migration_create::run(args),
            Commands::SeedCreate(args) => seed_create::run(args),
            Commands::SdkCreate(args) => sdk_create::run(args),
            Commands::DatabaseCreate(args) => database_create::run(args),
            Commands::DesignCreate(args) => design_create::run(args),
            Commands::DesignRemove(args) => design_remove::run(args),
            Commands::DockerCreate(args) => docker_create::run(args),
            Commands::DockerPublish(args) => docker_publish::run(args),
            Commands::MailerCreate(args) => mailer_create::run(args),
            Commands::IssueCreate(args) => issue_create::run(args),
            Commands::IssuePull(args) => issue_pull::run(args),
            Commands::IssuePush(args) => issue_push::run(args),
            Commands::MicroserviceCreate(args) => microservice_create::run(args),
            Commands::MicroserviceRemove(args) => microservice_remove::run(args),
            Commands::CommandCreate(args) => command_create::run(args),
            Commands::CommandRun(args) => command_run::run(args),
            Commands::ControllerCreate(args) => controller_create::run(args),
            Commands::FeatureFlagCreate(args) => feature_flag_create::run(args),
            Commands::LoggerCreate(args) => logger_create::run(args),
            Commands::MiddlewareCreate(args) => middleware_create::run(args),
            Commands::PermissionCreate(args) => permission_create::run(args),
            Commands::QueueCreate(args) => queue_create::run(args),
            Commands::RateLimitCreate(args) => rate_limit_create::run(args),
            Commands::ServiceCreate(args) => service_create::run(args),
            Commands::StorageCreate(args) => storage_create::run(args),
            Commands::SpaCreate(args) => spa_create::run(args),
            Commands::VectorDatabaseCreate(args) => vector_database_create::run(args),
            Commands::WorkflowCreate(args) => workflow_create::run(args),
            Commands::WorkflowTransitionCreate(args) => workflow_transition_create::run(args),
            Commands::GithubCredentialsCreate(args) => github_credentials_create::run(args),
            Commands::GithubSecretPush(args) => github_secret_push::run(args),
            Commands::GitlabCredentialsCreate(args) => gitlab_credentials_create::run(args),
            Commands::GitlabSecretPush(args) => gitlab_secret_push::run(args),
            Commands::BitbucketCredentialsCreate(args) => bitbucket_credentials_create::run(args),
            Commands::BitbucketSecretPush(args) => bitbucket_secret_push::run(args),
            Commands::DockerCredentialsCreate(args) => docker_credentials_create::run(args),
            Commands::JiraCredentialsCreate(args) => jira_credentials_create::run(args),
            Commands::LinearCredentialsCreate(args) => linear_credentials_create::run(args),
            Commands::NpmCredentialsCreate(args) => npm_credentials_create::run(args),
            Commands::NpmPublish(args) => npm_publish::run(args),
            Commands::Upgrade(args) => upgrade::run(args),
            Commands::Version(args) => version::run(args),
            Commands::Help(args) => help::run(args),
            Commands::CompletionBash(args) => completion_bash::run(args),
            Commands::CompletionFish(args) => completion_fish::run(args),
            Commands::CompletionZsh(args) => completion_zsh::run(args),
            Commands::MonorepoRun(args) => monorepo_run::run(args),
            Commands::Run(args) => run::run(args),
            Commands::Build(args) => build::run(args),
            Commands::CommitlintCheck(args) => commitlint_check::run(args),
            Commands::CommitlintInit(args) => commitlint_init::run(args),
            Commands::Fmt(args) => fmt::run(args),
            Commands::Lint(args) => lint::run(args),
            Commands::Test(args) => test::run(args),
            Commands::TranslationCreate(args) => translation_create::run(args),
            Commands::E2eCreate(args) => e2e_create::run(args),
            Commands::E2eRun(args) => e2e_run::run(args),
            Commands::SpaFeatureCreate(args) => spa_feature_create::run(args),
            Commands::SpaRemove(args) => spa_remove::run(args),
            Commands::MonorepoCheck(args) => monorepo_check::run(args),
            Commands::Check(args) => check::run(args),
            Commands::MigrationUp(args) => migration_up::run(args),
            Commands::MigrationDown(args) => migration_down::run(args),
            Commands::SeedRun(args) => seed_run::run(args),
        }
    }
}
