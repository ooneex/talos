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
    #[command(name = "app:init")]
    AppInit(app_init::AppInitArgs),

    #[command(name = "app:create")]
    AppCreate(app_create::AppCreateArgs),

    #[command(name = "app:start")]
    AppStart(app_start::AppStartArgs),

    #[command(name = "app:stop")]
    AppStop(app_stop::AppStopArgs),

    #[command(name = "module:create")]
    ModuleCreate(module_create::ModuleCreateArgs),

    #[command(name = "module:remove")]
    ModuleRemove(module_remove::ModuleRemoveArgs),

    #[command(name = "ai:chat:create")]
    AiChatCreate(ai_chat_create::AiChatCreateArgs),

    #[command(name = "ai:middleware:create")]
    AiMiddlewareCreate(ai_middleware_create::AiMiddlewareCreateArgs),

    #[command(name = "agent:skills:create")]
    AgentSkillsCreate(agent_skills_create::AgentSkillsCreateArgs),

    #[command(name = "ai:tool:create")]
    AiToolCreate(ai_tool_create::AiToolCreateArgs),

    #[command(name = "analytics:create")]
    AnalyticsCreate(analytics_create::AnalyticsCreateArgs),

    #[command(name = "cache:create")]
    CacheCreate(cache_create::CacheCreateArgs),

    #[command(name = "cron:create")]
    CronCreate(cron_create::CronCreateArgs),

    #[command(name = "event:create")]
    EventCreate(event_create::EventCreateArgs),

    #[command(name = "entity:create")]
    EntityCreate(entity_create::EntityCreateArgs),

    #[command(name = "repository:create")]
    RepositoryCreate(repository_create::RepositoryCreateArgs),

    #[command(name = "react:component:create")]
    ReactComponentCreate(react_component_create::ReactComponentCreateArgs),

    #[command(name = "release:create")]
    ReleaseCreate(release_create::ReleaseCreateArgs),

    #[command(name = "migration:create")]
    MigrationCreate(migration_create::MigrationCreateArgs),

    #[command(name = "seed:create")]
    SeedCreate(seed_create::SeedCreateArgs),

    #[command(name = "sdk:create")]
    SdkCreate(sdk_create::SdkCreateArgs),

    #[command(name = "database:create")]
    DatabaseCreate(database_create::DatabaseCreateArgs),

    #[command(name = "design:create")]
    DesignCreate(design_create::DesignCreateArgs),

    #[command(name = "design:remove")]
    DesignRemove(design_remove::DesignRemoveArgs),

    #[command(name = "docker:create")]
    DockerCreate(docker_create::DockerCreateArgs),

    #[command(name = "docker:publish")]
    DockerPublish(docker_publish::DockerPublishArgs),

    #[command(name = "mailer:create")]
    MailerCreate(mailer_create::MailerCreateArgs),

    #[command(name = "issue:create")]
    IssueCreate(issue_create::IssueCreateArgs),

    #[command(name = "issue:pull")]
    IssuePull(issue_pull::IssuePullArgs),

    #[command(name = "issue:push")]
    IssuePush(issue_push::IssuePushArgs),

    #[command(name = "microservice:create")]
    MicroserviceCreate(microservice_create::MicroserviceCreateArgs),

    #[command(name = "microservice:remove")]
    MicroserviceRemove(microservice_remove::MicroserviceRemoveArgs),

    #[command(name = "command:create")]
    CommandCreate(command_create::CommandCreateArgs),

    #[command(name = "command:run")]
    CommandRun(command_run::CommandRunArgs),

    #[command(name = "controller:create")]
    ControllerCreate(controller_create::ControllerCreateArgs),

    #[command(name = "flag:create")]
    FeatureFlagCreate(feature_flag_create::FeatureFlagCreateArgs),

    #[command(name = "logger:create")]
    LoggerCreate(logger_create::LoggerCreateArgs),

    #[command(name = "middleware:create")]
    MiddlewareCreate(middleware_create::MiddlewareCreateArgs),

    #[command(name = "permission:create")]
    PermissionCreate(permission_create::PermissionCreateArgs),

    #[command(name = "queue:create")]
    QueueCreate(queue_create::QueueCreateArgs),

    #[command(name = "rate-limit:create")]
    RateLimitCreate(rate_limit_create::RateLimitCreateArgs),

    #[command(name = "service:create")]
    ServiceCreate(service_create::ServiceCreateArgs),

    #[command(name = "storage:create")]
    StorageCreate(storage_create::StorageCreateArgs),

    #[command(name = "spa:create")]
    SpaCreate(spa_create::SpaCreateArgs),

    #[command(name = "vector-database:create")]
    VectorDatabaseCreate(vector_database_create::VectorDatabaseCreateArgs),

    #[command(name = "workflow:create")]
    WorkflowCreate(workflow_create::WorkflowCreateArgs),

    #[command(name = "workflow:transition:create")]
    WorkflowTransitionCreate(workflow_transition_create::WorkflowTransitionCreateArgs),

    #[command(name = "github:credentials:create")]
    GithubCredentialsCreate(github_credentials_create::GithubCredentialsCreateArgs),

    #[command(name = "github:secret:push")]
    GithubSecretPush(github_secret_push::GithubSecretPushArgs),

    #[command(name = "gitlab:credentials:create")]
    GitlabCredentialsCreate(gitlab_credentials_create::GitlabCredentialsCreateArgs),

    #[command(name = "gitlab:secret:push")]
    GitlabSecretPush(gitlab_secret_push::GitlabSecretPushArgs),

    #[command(name = "bitbucket:credentials:create")]
    BitbucketCredentialsCreate(bitbucket_credentials_create::BitbucketCredentialsCreateArgs),

    #[command(name = "bitbucket:secret:push")]
    BitbucketSecretPush(bitbucket_secret_push::BitbucketSecretPushArgs),

    #[command(name = "docker:credentials:create")]
    DockerCredentialsCreate(docker_credentials_create::DockerCredentialsCreateArgs),

    #[command(name = "jira:credentials:create")]
    JiraCredentialsCreate(jira_credentials_create::JiraCredentialsCreateArgs),

    #[command(name = "linear:credentials:create")]
    LinearCredentialsCreate(linear_credentials_create::LinearCredentialsCreateArgs),

    #[command(name = "npm:credentials:create")]
    NpmCredentialsCreate(npm_credentials_create::NpmCredentialsCreateArgs),

    #[command(name = "npm:publish")]
    NpmPublish(npm_publish::NpmPublishArgs),

    #[command(name = "upgrade")]
    Upgrade(upgrade::UpgradeArgs),

    #[command(name = "version")]
    Version(version::VersionArgs),

    #[command(name = "help")]
    Help(help::HelpArgs),

    #[command(name = "completion:bash")]
    CompletionBash(completion_bash::CompletionBashArgs),

    #[command(name = "completion:fish")]
    CompletionFish(completion_fish::CompletionFishArgs),

    #[command(name = "completion:zsh")]
    CompletionZsh(completion_zsh::CompletionZshArgs),

    #[command(name = "monorepo:run")]
    MonorepoRun(monorepo_run::MonorepoRunArgs),

    #[command(name = "run")]
    Run(run::RunArgs),

    #[command(name = "build")]
    Build(build::BuildArgs),

    #[command(name = "commitlint:check")]
    CommitlintCheck(commitlint_check::CommitlintCheckArgs),

    #[command(name = "commitlint:init")]
    CommitlintInit(commitlint_init::CommitlintInitArgs),

    #[command(name = "fmt")]
    Fmt(fmt::FmtArgs),

    #[command(name = "lint")]
    Lint(lint::LintArgs),

    #[command(name = "test")]
    Test(test::TestArgs),

    #[command(name = "translation:create")]
    TranslationCreate(translation_create::TranslationCreateArgs),

    #[command(name = "e2e:create")]
    E2eCreate(e2e_create::E2eCreateArgs),

    #[command(name = "e2e:run")]
    E2eRun(e2e_run::E2eRunArgs),

    #[command(name = "spa:feature:create")]
    SpaFeatureCreate(spa_feature_create::SpaFeatureCreateArgs),

    #[command(name = "spa:remove")]
    SpaRemove(spa_remove::SpaRemoveArgs),

    #[command(name = "monorepo:check")]
    MonorepoCheck(monorepo_check::MonorepoCheckArgs),

    #[command(name = "check")]
    Check(check::CheckArgs),

    #[command(name = "migration:up")]
    MigrationUp(migration_up::MigrationUpArgs),

    #[command(name = "migration:down")]
    MigrationDown(migration_down::MigrationDownArgs),

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
