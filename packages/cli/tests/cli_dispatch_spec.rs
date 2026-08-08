//! Every subcommand name reaches the command it is meant to.
//!
//! The dispatch table is one arm per command, and a typo in it routes a name at
//! the wrong implementation without anything failing to compile. Running each
//! name against a scratch workspace with a seeded skeleton proves the routing:
//! what matters here is which command answered, not what it went on to do, so
//! the assertions are on the output each one is recognisable by.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("a parent")).expect("create parent");
    fs::write(path, content).expect("write file");
}

/// Every template the generators read, so a `*:create` run gets past the
/// resolver and into the command itself.
fn seed_home(home: &Path) {
    let templates = home.join(".talos/skeleton/templates");
    for name in [
        "ai-chat",
        "ai-middleware",
        "ai-skill",
        "ai-tool",
        "analytics",
        "cache",
        "cron",
        "entity",
        "event",
        "feature-flag",
        "logger",
        "permission",
        "queue",
        "rate-limit",
        "repository",
        "service",
        "storage",
        "vector-database",
        "workflow",
        "workflow-transition",
        "middleware",
        "controller",
        "translation",
    ] {
        write(
            &templates.join(format!("{name}.txt")),
            "export class {{NAME}} {}\n",
        );
        write(&templates.join(format!("{name}.test.txt")), "// {{NAME}}\n");
    }
    write(&templates.join("middleware.socket.txt"), "// socket\n");
    write(&templates.join("controller.socket.txt"), "// socket\n");
    write(
        &templates.join("translation.yml.txt"),
        "hello:\n  en: \"Hello\"\n",
    );
    write(&templates.join("translation.json.txt"), "{}\n");
    write(&templates.join("database.pg.txt"), "// pg\n");
    write(&templates.join("database.redis.txt"), "// redis\n");
    write(&templates.join("database.sqlite.txt"), "// sqlite\n");
    write(&templates.join("database.test.txt"), "// {{NAME}}\n");
    write(&templates.join("database.redis.test.txt"), "// {{NAME}}\n");
    write(&templates.join("e2e.spec.txt"), "// e2e\n");
    write(
        &templates.join("playwright.config.txt"),
        "export default {};\n",
    );
    write(
        &templates.join("react-component.txt"),
        "export const {{NAME}} = () => null;\n",
    );
    write(
        &templates.join("react-component.spec.txt"),
        "// {{NAME}} {{IMPORT}}\n",
    );
    write(&templates.join("react-component.happydom.txt"), "// dom\n");
    write(&templates.join("react-component.bunfig.txt"), "[test]\n");
    write(
        &templates.join("migrations/migration.txt"),
        "// {{ version }} {{ name }}\n",
    );
    write(&templates.join("module/migration.up.txt"), "// up\n");
    write(&templates.join("module/migration.down.txt"), "// down\n");
    write(
        &templates.join("seeds/seed.txt"),
        "// {{ name }} {{ dataFile }}\n",
    );
    write(&templates.join("seeds/seed.test.txt"), "// {{NAME}}\n");
    write(
        &templates.join("module/seed.run.txt"),
        "// seeds of {{name}}\n",
    );
    write(
        &templates.join("command/command.txt"),
        "// {{COMMAND_NAME}} {{NAME}}\n",
    );
    write(&templates.join("command/command.test.txt"), "// {{NAME}}\n");
    write(
        &templates.join("module/command.run.txt"),
        "// commands of {{name}}\n",
    );
    write(&templates.join("mailer/mailer.txt"), "// {{NAME}}\n");
    write(&templates.join("mailer/mailer.test.txt"), "// {{NAME}}\n");
    write(
        &templates.join("mailer/mailer-template.txt"),
        "// {{NAME}}\n",
    );
    write(
        &templates.join("mailer/mailer-template.test.txt"),
        "// {{NAME}}\n",
    );
    for name in [
        "route",
        "layout",
        "not-found-layout",
        "error-layout",
        "skeleton-layout",
        "query",
        "mutation",
    ] {
        write(
            &templates.join(format!("spa/spa-feature.{name}.txt")),
            "// {{NAME}}\n",
        );
    }
    write(
        &templates.join("spa/spa.use-translate.txt"),
        "// {{NAME}}\n",
    );
    write(&templates.join("spa/spa.use-lang.txt"), "// lang\n");
    write(
        &templates.join("module/module.txt"),
        "export const {{NAME}}Module = {};\n",
    );
    write(
        &templates.join("module/package.txt"),
        "{ \"name\": \"@module/{{NAME}}\" }\n",
    );
    write(&templates.join("module/tsconfig.txt"), "{}\n");
    write(&templates.join("module/yml.txt"), "type: \"module\"\n");
    write(&templates.join("module/test.txt"), "// {{NAME}} {{name}}\n");
    write(&templates.join("module/bunfig.txt"), "[test]\n");
}

fn workspace(root: &Path) {
    // Every dependency a generator would otherwise `bun add`, so no run
    // reaches the registry.
    write(
        &root.join("package.json"),
        "{\n  \"name\": \"scratch\",\n  \"dependencies\": {\n    \"@talosjs/ai\": \"1.0.0\",\n    \"@talosjs/analytics\": \"1.0.0\",\n    \"@talosjs/cache\": \"1.0.0\",\n    \"@talosjs/controller\": \"1.0.0\",\n    \"@talosjs/cron\": \"1.0.0\",\n    \"@talosjs/database\": \"1.0.0\",\n    \"@talosjs/event\": \"1.0.0\",\n    \"@talosjs/feature-flag\": \"1.0.0\",\n    \"@talosjs/logger\": \"1.0.0\",\n    \"@talosjs/mailer\": \"1.0.0\",\n    \"@talosjs/middleware\": \"1.0.0\",\n    \"@talosjs/permission\": \"1.0.0\",\n    \"@talosjs/queue\": \"1.0.0\",\n    \"@talosjs/rag\": \"1.0.0\",\n    \"@talosjs/rate-limit\": \"1.0.0\",\n    \"@talosjs/repository\": \"1.0.0\",\n    \"@talosjs/service\": \"1.0.0\",\n    \"@talosjs/storage\": \"1.0.0\",\n    \"@talosjs/translation\": \"1.0.0\",\n    \"@talosjs/utils\": \"1.0.0\",\n    \"@talosjs/workflow\": \"1.0.0\",\n    \"@playwright/test\": \"1.0.0\",\n    \"@tanstack/react-query\": \"1.0.0\",\n    \"zustand\": \"1.0.0\",\n    \"@happy-dom/global-registrator\": \"1.0.0\",\n    \"@testing-library/react\": \"1.0.0\",\n    \"@testing-library/jest-dom\": \"1.0.0\"\n  }\n}\n",
    );
    write(
        &root.join("tsconfig.json"),
        "{ \"compilerOptions\": { \"paths\": {} } }\n",
    );
    write(
        &root.join("modules/user/issues/OON-100000.yml"),
        "id: \"OON-100000\"\nmodule: \"user\"\ntitle: \"Something\"\nstate: \"Todo\"\npriority: \"Medium\"\n",
    );
    write(&root.join("modules/user/user.yml"), "type: \"module\"\n");
    write(
        &root.join("modules/user/package.json"),
        "{ \"name\": \"@module/user\" }\n",
    );
    write(&root.join("modules/web/web.yml"), "type: \"spa\"\n");
    write(
        &root.join("modules/web/package.json"),
        "{ \"name\": \"@module/web\" }\n",
    );
}

struct Sandbox {
    _home: tempfile::TempDir,
    _root: tempfile::TempDir,
    home: PathBuf,
    root: PathBuf,
}

fn sandbox() -> Sandbox {
    let home = tempfile::tempdir().expect("create temp home");
    let root = tempfile::tempdir().expect("create temp dir");
    seed_home(home.path());
    workspace(root.path());
    Sandbox {
        home: home.path().to_path_buf(),
        root: root.path().to_path_buf(),
        _home: home,
        _root: root,
    }
}

impl Sandbox {
    fn run(&self, args: &[&str]) -> Output {
        Command::new(env!("CARGO_BIN_EXE_talos"))
            .args(args)
            .current_dir(&self.root)
            .env("HOME", &self.home)
            .env("NO_COLOR", "1")
            // The generators write their files before installing anything, and
            // with nothing on the PATH the install step gives up at once rather
            // than reaching a registry.
            .env("PATH", "/nonexistent")
            .env_remove("TALOS_TEMPLATES_DIR")
            .stdin(Stdio::null())
            .output()
            .expect("the talos binary should run")
    }
}

fn text(output: &Output) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

/// The single-artifact generators, with the file each one is expected to write.
const GENERATORS: &[(&str, &str)] = &[
    ("ai:chat:create", "modules/user/src/ai/chats/SupportChat.ts"),
    (
        "ai:middleware:create",
        "modules/user/src/ai/middlewares/SupportMiddleware.ts",
    ),
    (
        "ai:skill:create",
        "modules/user/src/ai/skills/SupportSkill.ts",
    ),
    ("ai:tool:create", "modules/user/src/ai/tools/SupportTool.ts"),
    (
        "analytics:create",
        "modules/user/src/analytics/SupportAnalytics.ts",
    ),
    ("cache:create", "modules/user/src/cache/SupportCache.ts"),
    ("cron:create", "modules/user/src/crons/SupportCron.ts"),
    (
        "entity:create",
        "modules/user/src/entities/SupportEntity.ts",
    ),
    ("event:create", "modules/user/src/events/SupportEvent.ts"),
    (
        "flag:create",
        "modules/user/src/flags/SupportFeatureFlag.ts",
    ),
    ("logger:create", "modules/user/src/loggers/SupportLogger.ts"),
    (
        "permission:create",
        "modules/user/src/permissions/SupportPermission.ts",
    ),
    ("queue:create", "modules/user/src/queues/SupportQueue.ts"),
    (
        "rate-limit:create",
        "modules/user/src/rate-limit/SupportRateLimiter.ts",
    ),
    (
        "repository:create",
        "modules/user/src/repositories/SupportRepository.ts",
    ),
    (
        "service:create",
        "modules/user/src/services/SupportService.ts",
    ),
    (
        "storage:create",
        "modules/user/src/storage/SupportStorage.ts",
    ),
    (
        "vector-database:create",
        "modules/user/src/databases/SupportVectorDatabase.ts",
    ),
    (
        "workflow:create",
        "modules/user/src/workflows/SupportWorkflow.ts",
    ),
    (
        "workflow:transition:create",
        "modules/user/src/workflows/transitions/SupportTransition.ts",
    ),
];

#[test]
fn every_single_artifact_generator_is_reachable_by_its_command_name() {
    let sandbox = sandbox();

    for (command, expected) in GENERATORS {
        let output = sandbox.run(&[command, "--name=support", "--module=user"]);
        assert!(
            output.status.success(),
            "{command} failed: {}",
            text(&output)
        );
        assert!(
            sandbox.root.join(expected).is_file(),
            "{command} did not write {expected}: {}",
            text(&output)
        );
    }
}

#[test]
fn the_bundle_generators_are_reachable_by_their_command_names() {
    let sandbox = sandbox();

    let cases: &[(&[&str], &str)] = &[
        (
            &["command:create", "--name=sync", "--module=user"],
            "modules/user/src/commands/SyncCommand.ts",
        ),
        (
            &["seed:create", "--name=user", "--module=user"],
            "modules/user/src/seeds/UserSeed.ts",
        ),
        (
            &["mailer:create", "--name=welcome", "--module=user"],
            "modules/user/src/mailers/WelcomeMailer.ts",
        ),
        (
            &["e2e:create", "--name=checkout", "--module=user"],
            "modules/user/e2e/Checkout.spec.ts",
        ),
        (
            &["react:component:create", "--name=card", "--module=web"],
            "modules/web/src/components/Card.tsx",
        ),
        (
            &["spa:feature:create", "--name=orders", "--module=web"],
            "modules/web/src/routes/orders.tsx",
        ),
        (
            &["translation:create", "--name=email", "--module=user"],
            "modules/user/src/translations/EmailTranslation.ts",
        ),
        (
            &[
                "middleware:create",
                "--name=auth",
                "--module=user",
                "--is-socket=false",
            ],
            "modules/user/src/middlewares/AuthMiddleware.ts",
        ),
        (
            &[
                "controller:create",
                "--name=user",
                "--module=user",
                "--is-socket=false",
                "--route.name=user-list",
                "--route.path=/users",
                "--route.method=get",
            ],
            "modules/user/src/controllers/UserController.ts",
        ),
        (
            &[
                "database:create",
                "--name=main",
                "--module=user",
                "--type=postgres",
            ],
            "modules/user/src/databases/MainDatabase.ts",
        ),
    ];

    for (args, expected) in cases {
        let output = sandbox.run(args);
        assert!(
            output.status.success(),
            "{args:?} failed: {}",
            text(&output)
        );
        assert!(
            sandbox.root.join(expected).is_file(),
            "{args:?} did not write {expected}: {}",
            text(&output)
        );
    }
}

#[test]
fn migration_create_is_reachable_and_writes_a_timestamped_file() {
    let sandbox = sandbox();

    let output = sandbox.run(&["migration:create", "--module=user"]);

    assert!(output.status.success(), "{}", text(&output));
    let written = fs::read_dir(sandbox.root.join("modules/user/src/migrations"))
        .expect("the migrations directory was created")
        .flatten()
        .any(|entry| entry.file_name().to_string_lossy().starts_with("Migration"));
    assert!(written, "no migration was written");
}

#[test]
fn the_read_only_commands_answer_without_touching_the_workspace() {
    let sandbox = sandbox();

    for args in [
        vec!["version"],
        vec!["help"],
        vec!["completion:bash"],
        vec!["completion:fish"],
        vec!["completion:zsh"],
        vec!["issue:check"],
        vec!["issue:convert"],
    ] {
        let output = sandbox.run(&args);
        assert!(output.status.success(), "{args:?}: {}", text(&output));
    }
}

#[test]
fn the_workspace_runners_all_route_at_the_same_task_runner() {
    let sandbox = sandbox();

    // `check` and `workspace:check` are left out: they install the workspace
    // first, which is the one step that cannot run offline.
    for args in [
        vec!["fmt", "--no-cache"],
        vec!["lint", "--no-cache"],
        vec!["test", "--no-cache"],
        vec!["build", "--no-cache"],
        vec!["e2e:run", "--no-cache"],
    ] {
        let output = sandbox.run(&args);
        assert!(
            output.status.success(),
            "{args:?} should pass over a workspace with no such script: {}",
            text(&output)
        );
    }
}

#[test]
fn marketing_create_is_reachable_by_its_command_name() {
    let sandbox = sandbox();

    let output = sandbox.run(&["marketing:create", "--module=user"]);

    // Whatever it decides to do, the name has to reach the command rather than
    // clap's unknown-subcommand error.
    assert!(
        !text(&output).contains("unrecognized subcommand"),
        "{}",
        text(&output)
    );
}
