//! Runs every template-driven generator end to end.
//!
//! The generators share one shape — resolve the templates, fill the name in,
//! write the source and its spec next to the module — so they share one spec.
//! `TALOS_TEMPLATES_DIR` points the resolver at a scratch template tree, which
//! keeps the run offline, and the working directory is a scratch workspace, so
//! the files land somewhere the test can read them back.
//!
//! Most generators take their working directory from the process, so the whole
//! file is one test: a second test would race it on that global.

use std::fs;
use std::path::{Path, PathBuf};

use cli::commands;

/// Every template the generators under test read, with a body carrying the
/// placeholders each one substitutes.
const TEMPLATES: &[(&str, &str)] = &[
    ("ai-chat.txt", "export class {{NAME}}Chat {}\n"),
    ("ai-chat.test.txt", "// {{NAME}}Chat in {{MODULE}}\n"),
    (
        "ai-middleware.txt",
        "export class {{NAME}}Middleware {} // {{KEBAB}}\n",
    ),
    (
        "ai-middleware.test.txt",
        "// {{NAME}}Middleware in {{MODULE}}\n",
    ),
    ("ai-tool.txt", "export class {{NAME}}Tool {} // {{SNAKE}}\n"),
    ("ai-tool.test.txt", "// {{NAME}}Tool in {{MODULE}}\n"),
    (
        "analytics.txt",
        "export class {{NAME}}Analytics {}\n",
    ),
    (
        "analytics.test.txt",
        "// {{NAME}}Analytics in {{MODULE}}\n",
    ),
    ("cache.txt", "export class {{NAME}}Cache {}\n"),
    ("cache.test.txt", "// {{NAME}}Cache in {{MODULE}}\n"),
    ("cron.txt", "export class {{NAME}}Cron {}\n"),
    ("cron.test.txt", "// {{NAME}}Cron in {{MODULE}}\n"),
    ("entity.txt", "export class {{NAME}}Entity {}\n"),
    ("entity.test.txt", "// {{NAME}}Entity in {{MODULE}}\n"),
    ("event.txt", "export class {{NAME}}Event {}\n"),
    ("event.test.txt", "// {{NAME}}Event in {{MODULE}}\n"),
    ("feature-flag.txt", "export class {{NAME}}FeatureFlag {}\n"),
    ("feature-flag.test.txt", "// {{NAME}}FeatureFlag in {{MODULE}}\n"),
    ("logger.txt", "export class {{NAME}}Logger {}\n"),
    ("logger.test.txt", "// {{NAME}}Logger in {{MODULE}}\n"),
    ("permission.txt", "export class {{NAME}}Permission {}\n"),
    (
        "permission.test.txt",
        "// {{NAME}}Permission in {{MODULE}}\n",
    ),
    ("queue.txt", "export class {{NAME}}Queue {}\n"),
    ("queue.test.txt", "// {{NAME}}Queue in {{MODULE}}\n"),
    ("rate-limit.txt", "export class {{NAME}}RateLimiter {}\n"),
    (
        "rate-limit.test.txt",
        "// {{NAME}}RateLimiter in {{MODULE}}\n",
    ),
    ("repository.txt", "export class {{NAME}}Repository {}\n"),
    (
        "repository.test.txt",
        "// {{NAME}}Repository in {{MODULE}}\n",
    ),
    ("service.txt", "export class {{NAME}}Service {}\n"),
    ("service.test.txt", "// {{NAME}}Service in {{MODULE}}\n"),
    ("storage.txt", "export class {{NAME}}Storage {}\n"),
    ("storage.test.txt", "// {{NAME}}Storage in {{MODULE}}\n"),
    (
        "vector-database.txt",
        "export class {{NAME}}VectorDatabase {}\n",
    ),
    (
        "vector-database.test.txt",
        "// {{NAME}}VectorDatabase in {{MODULE}}\n",
    ),
    ("workflow.txt", "export class {{NAME}}Workflow {}\n"),
    ("workflow.test.txt", "// {{NAME}}Workflow in {{MODULE}}\n"),
    (
        "workflow-transition.txt",
        "export class {{NAME}}Transition {}\n",
    ),
    (
        "workflow-transition.test.txt",
        "// {{NAME}}Transition in {{MODULE}}\n",
    ),
    ("middleware.txt", "export class {{NAME}}Middleware {}\n"),
    (
        "middleware.socket.txt",
        "export class {{NAME}}Middleware {} // socket\n",
    ),
    (
        "middleware.test.txt",
        "// {{NAME}}Middleware in {{MODULE}}\n",
    ),
    (
        "controller.txt",
        "// {{ROUTE_NAME}} {{TYPE_NAME}} {{ROUTE_PATH}} {{ROUTE_METHOD}}\nexport class {{NAME}}Controller {}\n",
    ),
    (
        "controller.socket.txt",
        "// {{ROUTE_NAME}} {{TYPE_NAME}} {{ROUTE_PATH}}\nexport class {{NAME}}Controller {}\n",
    ),
    (
        "controller.test.txt",
        "// {{NAME}}Controller in {{MODULE}}\n",
    ),
    ("database.pg.txt", "export class {{NAME}}Database {} // pg\n"),
    (
        "database.redis.txt",
        "export class {{NAME}}Database {} // redis\n",
    ),
    (
        "database.sqlite.txt",
        "export class {{NAME}}Database {} // sqlite\n",
    ),
    ("database.test.txt", "// {{NAME}}Database in {{MODULE}}\n"),
    (
        "database.redis.test.txt",
        "// {{NAME}}Database redis in {{MODULE}}\n",
    ),
    ("module/module.txt", "export const {{NAME}}Module = {};\n"),
    ("module/package.txt", "{\n  \"name\": \"@module/{{NAME}}\"\n}\n"),
    ("module/tsconfig.txt", "{ \"extends\": \"../../tsconfig.json\" }\n"),
    ("module/yml.txt", "type: \"module\"\n"),
    ("module/test.txt", "// {{NAME}}Module {{name}}\n"),
    ("module/bunfig.txt", "[test]\ncoverage = true\n"),
];

fn templates_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("talos-scaffold-templates-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    for (name, body) in TEMPLATES {
        let path = dir.join(name);
        fs::create_dir_all(path.parent().expect("template has a parent")).expect("create dir");
        fs::write(path, body).expect("write template");
    }
    dir
}

fn workspace() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("talos-scaffold-workspace-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(dir.join("modules")).expect("create workspace");
    dir
}

fn source(root: &Path, dir: &str, file: &str) -> String {
    let path = root.join("modules/shared/src").join(dir).join(file);
    fs::read_to_string(&path).unwrap_or_else(|_| panic!("{} should exist", path.display()))
}

fn spec(root: &Path, dir: &str, file: &str) -> String {
    let path = root.join("modules/shared/tests").join(dir).join(file);
    fs::read_to_string(&path).unwrap_or_else(|_| panic!("{} should exist", path.display()))
}

#[test]
fn every_generator_writes_the_source_and_the_spec_its_template_describes() {
    let templates = templates_dir();
    let root = workspace();
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, &templates);
    }
    std::env::set_current_dir(&root).expect("move into the scratch workspace");

    // --- The plain one-template-plus-spec generators ------------------------

    commands::ai_chat_create::run(&commands::ai_chat_create::AiChatCreateArgs {
        no_cache: false,
        name: Some("support".to_string()),
        module: None,
        r#override: false,
    });
    assert_eq!(
        source(&root, "ai/chats", "SupportChat.ts"),
        "export class SupportChat {}\n"
    );
    assert_eq!(
        spec(&root, "ai/chats", "SupportChat.spec.ts"),
        "// SupportChat in shared\n"
    );

    commands::ai_middleware_create::run(&commands::ai_middleware_create::AiMiddlewareCreateArgs {
        no_cache: false,
        name: Some("audit".to_string()),
        module: None,
        r#override: false,
    });
    assert_eq!(
        source(&root, "ai/middlewares", "AuditMiddleware.ts"),
        "export class AuditMiddleware {} // audit\n",
        "the kebab-cased name is substituted alongside the pascal one"
    );

    commands::ai_tool_create::run(&commands::ai_tool_create::AiToolCreateArgs {
        no_cache: false,
        name: Some("search".to_string()),
        module: None,
        r#override: false,
    });
    assert!(source(&root, "ai/tools", "SearchTool.ts").contains("SearchTool"));

    commands::analytics_create::run(&commands::analytics_create::AnalyticsCreateArgs {
        no_cache: false,
        name: Some("posthog".to_string()),
        module: None,
        r#override: false,
    });
    assert!(source(&root, "analytics", "PosthogAnalytics.ts").contains("PosthogAnalytics"));

    commands::cache_create::run(&commands::cache_create::CacheCreateArgs {
        no_cache: false,
        name: Some("redis".to_string()),
        module: None,
        r#override: false,
    });
    assert_eq!(
        source(&root, "cache", "RedisCache.ts"),
        "export class RedisCache {}\n"
    );

    commands::cron_create::run(&commands::cron_create::CronCreateArgs {
        no_cache: false,
        name: Some("nightly".to_string()),
        module: None,
        r#override: false,
    });
    assert!(source(&root, "crons", "NightlyCron.ts").contains("NightlyCron"));

    commands::event_create::run(&commands::event_create::EventCreateArgs {
        no_cache: false,
        name: Some("signup".to_string()),
        module: None,
        channel: Some("user.signup".to_string()),
        r#override: false,
    });
    assert!(source(&root, "events", "SignupEvent.ts").contains("SignupEvent"));

    commands::feature_flag_create::run(&commands::feature_flag_create::FeatureFlagCreateArgs {
        no_cache: false,
        name: Some("beta".to_string()),
        module: None,
        r#override: false,
    });
    assert!(source(&root, "flags", "BetaFeatureFlag.ts").contains("BetaFeatureFlag"));

    commands::logger_create::run(&commands::logger_create::LoggerCreateArgs {
        no_cache: false,
        name: Some("console".to_string()),
        module: None,
        r#override: false,
    });
    assert!(source(&root, "loggers", "ConsoleLogger.ts").contains("ConsoleLogger"));

    commands::permission_create::run(&commands::permission_create::PermissionCreateArgs {
        no_cache: false,
        name: Some("admin".to_string()),
        module: None,
        r#override: false,
    });
    assert!(source(&root, "permissions", "AdminPermission.ts").contains("AdminPermission"));

    commands::queue_create::run(&commands::queue_create::QueueCreateArgs {
        no_cache: false,
        name: Some("mail".to_string()),
        module: None,
        r#override: false,
    });
    assert!(source(&root, "queues", "MailQueue.ts").contains("MailQueue"));

    commands::rate_limit_create::run(&commands::rate_limit_create::RateLimitCreateArgs {
        no_cache: false,
        name: Some("burst".to_string()),
        module: None,
        r#override: false,
    });
    assert!(source(&root, "rate-limit", "BurstRateLimiter.ts").contains("BurstRateLimiter"));

    commands::storage_create::run(&commands::storage_create::StorageCreateArgs {
        no_cache: false,
        name: Some("s3".to_string()),
        module: None,
        r#override: false,
    });
    assert!(source(&root, "storage", "S3Storage.ts").contains("S3Storage"));

    commands::vector_database_create::run(
        &commands::vector_database_create::VectorDatabaseCreateArgs {
            no_cache: false,
            name: Some("qdrant".to_string()),
            module: None,
            r#override: false,
        },
    );
    assert!(
        source(&root, "databases", "QdrantVectorDatabase.ts")
            .contains("QdrantVectorDatabase")
    );

    commands::workflow_create::run(&commands::workflow_create::WorkflowCreateArgs {
        no_cache: false,
        name: Some("order".to_string()),
        module: None,
        r#override: false,
    });
    assert!(source(&root, "workflows", "OrderWorkflow.ts").contains("OrderWorkflow"));

    commands::workflow_transition_create::run(
        &commands::workflow_transition_create::WorkflowTransitionCreateArgs {
            no_cache: false,
            name: Some("approve".to_string()),
            module: None,
            r#override: false,
        },
    );
    assert!(
        source(&root, "workflows/transitions", "ApproveTransition.ts").contains("ApproveTransition")
    );

    // --- The ones that scaffold into a named module -------------------------

    commands::service_create::run(&commands::service_create::ServiceCreateArgs {
        no_cache: false,
        name: Some("user".to_string()),
        module: Some("account".to_string()),
        r#override: false,
    });
    assert!(
        root.join("modules/account/src/services/UserService.ts")
            .is_file(),
        "the module is scaffolded when it does not exist yet"
    );
    assert!(
        root.join("modules/account/package.json").is_file(),
        "scaffolding the resource scaffolds the module around it"
    );

    commands::repository_create::run(&commands::repository_create::RepositoryCreateArgs {
        no_cache: false,
        name: Some("user".to_string()),
        module: Some("account".to_string()),
        r#override: false,
    });
    assert!(
        root.join("modules/account/src/repositories/UserRepository.ts")
            .is_file()
    );

    commands::entity_create::run(&commands::entity_create::EntityCreateArgs {
        no_cache: false,
        name: Some("user".to_string()),
        module: Some("account".to_string()),
        table_name: Some("users".to_string()),
        r#override: false,
    });
    assert!(
        root.join("modules/account/src/entities/UserEntity.ts")
            .is_file()
    );

    // --- The ones that pick a template from an option -----------------------

    commands::middleware_create::run(&commands::middleware_create::MiddlewareCreateArgs {
        no_cache: false,
        name: Some("auth".to_string()),
        module: None,
        is_socket: Some(false),
        r#override: false,
    });
    assert_eq!(
        source(&root, "middlewares", "AuthMiddleware.ts"),
        "export class AuthMiddleware {}\n"
    );

    commands::middleware_create::run(&commands::middleware_create::MiddlewareCreateArgs {
        no_cache: false,
        name: Some("presence".to_string()),
        module: None,
        is_socket: Some(true),
        r#override: false,
    });
    assert!(source(&root, "middlewares", "PresenceMiddleware.ts").contains("// socket"));

    commands::database_create::run(&commands::database_create::DatabaseCreateArgs {
        no_cache: false,
        name: Some("main".to_string()),
        module: None,
        r#type: Some("postgres".to_string()),
        r#override: false,
        cwd: Some(root.to_string_lossy().to_string()),
    });
    assert!(source(&root, "databases", "MainDatabase.ts").contains("// pg"));
    assert!(spec(&root, "databases", "MainDatabase.spec.ts").contains("MainDatabase"));

    commands::database_create::run(&commands::database_create::DatabaseCreateArgs {
        no_cache: false,
        name: Some("sessions".to_string()),
        module: None,
        r#type: Some("redis".to_string()),
        r#override: false,
        cwd: Some(root.to_string_lossy().to_string()),
    });
    assert!(source(&root, "databases", "SessionsDatabase.ts").contains("// redis"));
    assert!(spec(&root, "databases", "SessionsDatabase.spec.ts").contains("redis"));

    commands::database_create::run(&commands::database_create::DatabaseCreateArgs {
        no_cache: false,
        name: Some("local".to_string()),
        module: None,
        r#type: Some("sqlite".to_string()),
        r#override: false,
        cwd: Some(root.to_string_lossy().to_string()),
    });
    assert!(source(&root, "databases", "LocalDatabase.ts").contains("// sqlite"));

    commands::controller_create::run(&commands::controller_create::ControllerCreateArgs {
        no_cache: false,
        name: Some("user".to_string()),
        module: None,
        is_socket: Some(false),
        r#override: false,
        route_name: Some("user-list".to_string()),
        route_path: Some("/users/:userId".to_string()),
        route_method: Some("GET".to_string()),
        cwd: Some(root.to_string_lossy().to_string()),
    });
    let controller = source(&root, "controllers", "UserController.ts");
    assert!(controller.contains("/users/:user-id"), "{controller}");
    assert!(controller.contains("get"), "the method is lower-cased");
    assert!(controller.contains("UserList"), "the route type is pascal case");

    commands::controller_create::run(&commands::controller_create::ControllerCreateArgs {
        no_cache: false,
        name: Some("chat".to_string()),
        module: None,
        is_socket: Some(true),
        r#override: false,
        route_name: Some("chat-join".to_string()),
        route_path: Some("/chat".to_string()),
        route_method: None,
        cwd: Some(root.to_string_lossy().to_string()),
    });
    assert!(source(&root, "controllers", "ChatController.ts").contains("ChatController"));

    // --- Overwriting ---------------------------------------------------------

    commands::cache_create::run(&commands::cache_create::CacheCreateArgs {
        no_cache: false,
        name: Some("redis".to_string()),
        module: None,
        r#override: true,
    });
    assert_eq!(
        source(&root, "cache", "RedisCache.ts"),
        "export class RedisCache {}\n",
        "re-running with --override rewrites the file"
    );

    // The suffix is stripped rather than doubled when the caller already typed it.
    commands::cache_create::run(&commands::cache_create::CacheCreateArgs {
        no_cache: false,
        name: Some("MemoryCache".to_string()),
        module: None,
        r#override: false,
    });
    assert!(root.join("modules/shared/src/cache/MemoryCache.ts").is_file());

    let _ = fs::remove_dir_all(&root);
    let _ = fs::remove_dir_all(&templates);
}
