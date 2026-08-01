//! Runs the generators that write a bundle of files rather than a single pair.
//!
//! Commands, seeds, mailers, migrations, e2e specs, React components, SPA
//! features, translations and docker services each lay down several files and
//! wire them together — an export index, a bin entry point, a config, a
//! dictionary. Each one takes an explicit `--cwd`, so unlike the plain
//! generators these can each have a test of their own.
//!
//! The root `package.json` lists every dependency the generators would
//! otherwise shell out to `bun add` for, which is what keeps the runs offline.

use std::fs;
use std::path::{Path, PathBuf};

use cli::commands::{
    command_create::{self, CommandCreateArgs},
    docker_create::{self, DockerCreateArgs},
    e2e_create::{self, E2eCreateArgs},
    mailer_create::{self, MailerCreateArgs},
    migration_create::{self, MigrationCreateArgs},
    react_component_create::{self, ReactComponentCreateArgs},
    seed_create::{self, SeedCreateArgs},
    spa_feature_create::{self, SpaFeatureCreateArgs},
    translation_create::{self, TranslationCreateArgs},
};

/// Every template these generators read.
const TEMPLATES: &[(&str, &str)] = &[
    ("module/module.txt", "export const {{NAME}}Module = {};\n"),
    (
        "module/package.txt",
        "{\n  \"name\": \"@module/{{NAME}}\"\n}\n",
    ),
    ("module/tsconfig.txt", "{}\n"),
    ("module/yml.txt", "type: \"module\"\n"),
    ("module/test.txt", "// {{NAME}}Module {{name}}\n"),
    ("module/bunfig.txt", "[test]\n"),
    (
        "command/command.txt",
        "// {{COMMAND_NAME}} — {{COMMAND_DESCRIPTION}}\nexport class {{NAME}}Command {}\n",
    ),
    (
        "command/command.test.txt",
        "// {{NAME}}Command in {{MODULE}}\n",
    ),
    ("module/command.run.txt", "// commands of {{name}}\n"),
    (
        "seeds/seed.txt",
        "// data: {{ dataFile }}\nexport class {{ name }} {}\n",
    ),
    (
        "seeds/seed.test.txt",
        "// {{NAME}}Seed {{DATA_FILE}} in {{MODULE}}\n",
    ),
    ("module/seed.run.txt", "// seeds of {{name}}\n"),
    ("mailer/mailer.txt", "export class {{NAME}}Mailer {}\n"),
    (
        "mailer/mailer.test.txt",
        "// {{NAME}}Mailer in {{MODULE}}\n",
    ),
    (
        "mailer/mailer-template.txt",
        "export const {{NAME}}MailerTemplate = () => null;\n",
    ),
    (
        "mailer/mailer-template.test.txt",
        "// {{NAME}}MailerTemplate in {{MODULE}}\n",
    ),
    (
        "migrations/migration.txt",
        "// {{ version }}\nexport class {{ name }} {}\n",
    ),
    ("module/migration.up.txt", "// migrate up\n"),
    ("module/migration.down.txt", "// migrate down\n"),
    (
        "e2e.spec.txt",
        "import { test } from \"@playwright/test\";\n",
    ),
    (
        "playwright.config.txt",
        "export default { testDir: \"./e2e\" };\n",
    ),
    (
        "react-component.txt",
        "export const {{NAME}} = () => null;\n",
    ),
    (
        "react-component.spec.txt",
        "import { {{NAME}} } from \"{{IMPORT}}\";\n",
    ),
    ("react-component.happydom.txt", "// happy dom\n"),
    (
        "react-component.bunfig.txt",
        "[test]\npreload = \"./happydom.ts\"\n",
    ),
    (
        "spa/spa-feature.route.txt",
        "// route {{KEBAB}} {{CAMEL}}\nexport const {{NAME}}Route = {};\n",
    ),
    (
        "spa/spa-feature.layout.txt",
        "export const {{NAME}}Layout = () => null;\n",
    ),
    (
        "spa/spa-feature.not-found-layout.txt",
        "export const {{NAME}}NotFoundLayout = () => null;\n",
    ),
    (
        "spa/spa-feature.error-layout.txt",
        "export const {{NAME}}ErrorLayout = () => null;\n",
    ),
    (
        "spa/spa-feature.skeleton-layout.txt",
        "export const {{NAME}}SkeletonLayout = () => null;\n",
    ),
    (
        "spa/spa-feature.query.txt",
        "export const useGet{{NAME}} = () => null;\n",
    ),
    (
        "spa/spa-feature.mutation.txt",
        "export const useUpdate{{NAME}} = () => null;\n",
    ),
    (
        "spa/spa.use-translate.txt",
        "export const use{{NAME}}Translate = () => null;\n",
    ),
    (
        "spa/spa.use-lang.txt",
        "export const useLang = () => null;\n",
    ),
    (
        "translation.json.txt",
        "{ \"hello\": { \"en\": \"Hello\" } }\n",
    ),
    (
        "translation.txt",
        "// {{SNAKE}}\nexport class {{NAME}}Translation {}\n",
    ),
    (
        "translation.test.txt",
        "// {{NAME}}Translation in {{MODULE}}\n",
    ),
    ("translation.yml.txt", "hello:\n  en: \"Hello\"\n"),
    (
        "docker/postgres.txt",
        "services:\n  postgres:\n    image: postgres:16\nvolumes:\n  postgres_data:\nnetworks:\n  talos:\n",
    ),
    (
        "docker/redis.txt",
        "services:\n  redis:\n    image: redis:7\nvolumes:\n  redis_data:\nnetworks:\n  talos:\n",
    ),
];

/// Every dependency the generators would install if it were missing.
const PRESENT_DEPENDENCIES: &[&str] = &[
    "@playwright/test",
    "@tanstack/react-query",
    "@talosjs/mailer",
    "@talosjs/translation",
    "@talosjs/utils",
    "zustand",
    "@happy-dom/global-registrator",
    "@testing-library/react",
    "@testing-library/jest-dom",
];

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("a parent")).expect("create parent");
    fs::write(path, content).expect("write file");
}

/// The template tree, written once per test binary and shared by every test.
fn templates() -> PathBuf {
    static ONCE: std::sync::Once = std::sync::Once::new();
    let dir = std::env::temp_dir().join(format!("talos-bundle-templates-{}", std::process::id()));
    ONCE.call_once(|| {
        let _ = fs::remove_dir_all(&dir);
        for (name, body) in TEMPLATES {
            write(&dir.join(name), body);
        }
        unsafe {
            std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, &dir);
        }
    });
    dir
}

/// A scratch workspace whose root manifest already carries every dependency,
/// plus one backend module and one SPA module.
fn workspace() -> (tempfile::TempDir, PathBuf) {
    templates();
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().to_path_buf();

    let dependencies: String = PRESENT_DEPENDENCIES
        .iter()
        .map(|name| format!("    \"{name}\": \"1.0.0\""))
        .collect::<Vec<_>>()
        .join(",\n");
    write(
        &root.join("package.json"),
        &format!(
            "{{\n  \"name\": \"scratch\",\n  \"dependencies\": {{\n{dependencies}\n  }}\n}}\n"
        ),
    );

    write(&root.join("modules/user/user.yml"), "type: \"module\"\n");
    write(
        &root.join("modules/user/package.json"),
        "{ \"name\": \"@module/user\" }\n",
    );
    write(&root.join("modules/app/app.yml"), "type: \"api\"\n");
    write(
        &root.join("modules/app/package.json"),
        "{ \"name\": \"@module/app\" }\n",
    );
    write(&root.join("modules/web/web.yml"), "type: \"spa\"\n");
    write(
        &root.join("modules/web/package.json"),
        "{ \"name\": \"@module/web\" }\n",
    );

    (dir, root)
}

fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_else(|_| panic!("{} should exist", path.display()))
}

fn cwd(root: &Path) -> Option<String> {
    Some(root.to_string_lossy().to_string())
}

// ---------------------------------------------------------------------------

#[test]
fn command_create_writes_the_command_its_spec_and_the_runner_that_calls_it() {
    let (_dir, root) = workspace();

    command_create::run(&CommandCreateArgs {
        no_cache: false,
        name: Some("sync-users".to_string()),
        module: Some("user".to_string()),
        r#override: false,
        cwd: cwd(&root),
    });

    let base = root.join("modules/user");
    assert!(
        read(&base.join("src/commands/SyncUsersCommand.ts")).contains("sync:users"),
        "the kebab name becomes a colon-separated command name"
    );
    assert!(
        read(&base.join("src/commands/SyncUsersCommand.ts")).contains("Execute sync:users command"),
        "the description is derived from the name"
    );
    assert!(
        read(&base.join("tests/commands/SyncUsersCommand.spec.ts")).contains("in user"),
        "the spec knows which module it belongs to"
    );
    assert!(
        read(&base.join("src/commands/commands.ts")).contains("SyncUsersCommand"),
        "the export index lists the new command"
    );
    assert_eq!(
        read(&base.join("bin/command/run.ts")),
        "// commands of user\n",
        "the runner is created once, for the module"
    );
}

#[test]
fn command_create_leaves_an_existing_runner_alone() {
    let (_dir, root) = workspace();
    let runner = root.join("modules/user/bin/command/run.ts");
    write(&runner, "// hand written\n");

    command_create::run(&CommandCreateArgs {
        no_cache: false,
        name: Some("sync".to_string()),
        module: Some("user".to_string()),
        r#override: false,
        cwd: cwd(&root),
    });

    assert_eq!(read(&runner), "// hand written\n");
}

#[test]
fn seed_create_writes_the_seed_its_data_file_and_the_export_index() {
    let (_dir, root) = workspace();

    seed_create::run(&SeedCreateArgs {
        no_cache: false,
        name: Some("user".to_string()),
        module: Some("user".to_string()),
        cwd: cwd(&root),
    });

    let seeds = root.join("modules/user/src/seeds");
    assert!(read(&seeds.join("UserSeed.ts")).contains("user-seed"));
    assert_eq!(read(&seeds.join("user-seed.yml")), "# Seed data\n");
    assert!(read(&seeds.join("seeds.ts")).contains("UserSeed"));
    assert!(
        read(&root.join("modules/user/tests/seeds/UserSeed.spec.ts")).contains("in user"),
        "the spec names the module"
    );
    assert_eq!(
        read(&root.join("modules/user/bin/seed/run.ts")),
        "// seeds of user\n"
    );
}

#[test]
fn mailer_create_writes_the_mailer_its_template_and_both_specs() {
    let (_dir, root) = workspace();

    mailer_create::run(&MailerCreateArgs {
        no_cache: false,
        name: Some("WelcomeMailer".to_string()),
        module: Some("user".to_string()),
        r#override: false,
        cwd: cwd(&root),
    });

    let base = root.join("modules/user");
    assert_eq!(
        read(&base.join("src/mailers/WelcomeMailer.ts")),
        "export class WelcomeMailer {}\n",
        "the suffix the caller typed is not doubled"
    );
    assert!(
        base.join("src/mailers/WelcomeMailerTemplate.tsx").is_file(),
        "the JSX template sits beside the mailer"
    );
    assert!(base.join("tests/mailers/WelcomeMailer.spec.ts").is_file());
    assert!(
        base.join("tests/mailers/WelcomeMailerTemplate.spec.ts")
            .is_file()
    );
}

#[test]
fn migration_create_stamps_the_file_with_the_version_it_generated() {
    let (_dir, root) = workspace();

    migration_create::run(&MigrationCreateArgs {
        no_cache: false,
        module: Some("user".to_string()),
        cwd: cwd(&root),
    });

    let migrations = root.join("modules/user/src/migrations");
    let entry = fs::read_dir(&migrations)
        .expect("read migrations")
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .find(|name| name.starts_with("Migration"))
        .expect("a migration was written");

    let version = entry
        .trim_start_matches("Migration")
        .trim_end_matches(".ts")
        .to_string();
    assert!(
        version.chars().all(|c| c.is_ascii_digit()) && !version.is_empty(),
        "the version is a timestamp: {entry}"
    );
    let body = read(&migrations.join(&entry));
    assert!(body.contains(&version), "{body}");
    assert!(
        read(&migrations.join("migrations.ts")).contains(entry.trim_end_matches(".ts")),
        "the export index lists it"
    );
}

#[test]
fn e2e_create_writes_the_spec_the_config_and_the_script_that_runs_them() {
    let (_dir, root) = workspace();

    e2e_create::run(&E2eCreateArgs {
        no_cache: false,
        name: Some("CheckoutSpec".to_string()),
        module: Some("user".to_string()),
        r#override: false,
        cwd: cwd(&root),
    });

    let base = root.join("modules/user");
    assert!(
        base.join("e2e/Checkout.spec.ts").is_file(),
        "the Spec suffix is not doubled"
    );
    assert!(base.join("playwright.config.ts").is_file());
    let manifest: serde_json::Value =
        serde_json::from_str(&read(&base.join("package.json"))).expect("valid manifest");
    assert!(
        manifest["scripts"]["e2e"].is_string(),
        "the module gains an e2e script: {manifest}"
    );
}

#[test]
fn e2e_create_keeps_a_config_that_is_already_there() {
    let (_dir, root) = workspace();
    let config = root.join("modules/user/playwright.config.ts");
    write(&config, "// hand written\n");

    e2e_create::run(&E2eCreateArgs {
        no_cache: false,
        name: Some("checkout".to_string()),
        module: Some("user".to_string()),
        r#override: false,
        cwd: cwd(&root),
    });

    assert_eq!(read(&config), "// hand written\n");
}

#[test]
fn react_component_create_puts_the_component_at_the_module_root_by_default() {
    let (_dir, root) = workspace();

    react_component_create::run(&ReactComponentCreateArgs {
        no_cache: false,
        name: Some("user-card".to_string()),
        module: Some("web".to_string()),
        feature: None,
        r#override: false,
        cwd: cwd(&root),
    });

    let base = root.join("modules/web");
    assert!(base.join("src/components/UserCard.tsx").is_file());
    assert!(
        read(&base.join("tests/components/UserCard.spec.tsx"))
            .contains("../../src/components/UserCard"),
        "the spec import climbs back out of tests/"
    );
    assert!(base.join("happydom.ts").is_file());
    assert!(base.join("bunfig.toml").is_file());
}

#[test]
fn react_component_create_nests_the_component_under_the_feature_it_belongs_to() {
    let (_dir, root) = workspace();

    react_component_create::run(&ReactComponentCreateArgs {
        no_cache: false,
        name: Some("Row".to_string()),
        module: Some("web".to_string()),
        feature: Some("CheckoutFeature".to_string()),
        r#override: false,
        cwd: cwd(&root),
    });

    let base = root.join("modules/web");
    assert!(
        base.join("src/features/checkout/components/Row.tsx")
            .is_file(),
        "the Feature suffix is stripped from the folder name"
    );
    assert!(
        read(&base.join("tests/features/checkout/components/Row.spec.tsx"))
            .contains("../../../../src/features/checkout/components/Row"),
        "the import climbs out of the deeper folder"
    );
}

#[test]
fn spa_feature_create_lays_out_the_route_the_layouts_and_the_hooks() {
    let (_dir, root) = workspace();

    spa_feature_create::run(&SpaFeatureCreateArgs {
        no_cache: false,
        name: Some("OrderHistoryFeature".to_string()),
        module: Some("web".to_string()),
        r#override: false,
        cwd: cwd(&root),
    });

    let src = root.join("modules/web/src");
    let layouts = src.join("features/order-history/layouts");
    assert!(src.join("routes/order-history.tsx").is_file());
    assert!(layouts.join("OrderHistoryLayout.tsx").is_file());
    assert!(layouts.join("OrderHistoryNotFoundLayout.tsx").is_file());
    assert!(layouts.join("OrderHistoryErrorLayout.tsx").is_file());
    assert!(layouts.join("OrderHistorySkeletonLayout.tsx").is_file());
    assert!(
        src.join("features/order-history/hooks/useGetOrderHistory.ts")
            .is_file()
    );
    assert!(
        src.join("features/order-history/hooks/useUpdateOrderHistory.ts")
            .is_file()
    );
}

#[test]
fn translation_create_scaffolds_a_class_and_a_yaml_dictionary_for_a_backend_module() {
    let (_dir, root) = workspace();

    translation_create::run(&TranslationCreateArgs {
        no_cache: false,
        name: Some("EmailTranslation".to_string()),
        module: Some("user".to_string()),
        r#override: false,
        cwd: cwd(&root),
    });

    let base = root.join("modules/user");
    assert!(
        read(&base.join("src/translations/EmailTranslation.ts")).contains("email"),
        "the snake-cased name is substituted"
    );
    assert!(read(&base.join("tests/translations/EmailTranslation.spec.ts")).contains("in user"));
    assert!(
        base.join("src/translations.yml").is_file(),
        "the dictionary is created beside the sources"
    );
}

#[test]
fn translation_create_scaffolds_a_hook_and_a_json_dictionary_for_a_spa_module() {
    let (_dir, root) = workspace();

    translation_create::run(&TranslationCreateArgs {
        no_cache: false,
        name: Some("Checkout".to_string()),
        module: Some("web".to_string()),
        r#override: false,
        cwd: cwd(&root),
    });

    let src = root.join("modules/web/src");
    assert!(
        src.join("features/checkout/translations/useCheckoutTranslate.ts")
            .is_file(),
        "a SPA module gets a hook rather than a class"
    );
    assert!(
        src.join("features/checkout/translations/translations.json")
            .is_file()
    );
    assert!(
        src.join("shared/hooks/useLang.ts").is_file(),
        "the language hook is seeded once for the module"
    );
    assert!(
        !src.join("translations").exists(),
        "the backend layout is not used"
    );
}

#[test]
fn docker_create_writes_a_compose_file_when_the_app_has_none() {
    let (_dir, root) = workspace();

    docker_create::run(&DockerCreateArgs {
        no_cache: false,
        name: Some("postgres".to_string()),
        cwd: cwd(&root),
    });

    let compose = read(&root.join("modules/app/docker-compose.yml"));
    assert!(compose.contains("postgres:"), "{compose}");
}

#[test]
fn docker_create_merges_a_second_service_into_the_compose_file() {
    let (_dir, root) = workspace();

    docker_create::run(&DockerCreateArgs {
        no_cache: false,
        name: Some("postgres".to_string()),
        cwd: cwd(&root),
    });
    docker_create::run(&DockerCreateArgs {
        no_cache: false,
        name: Some("redis".to_string()),
        cwd: cwd(&root),
    });

    let compose = read(&root.join("modules/app/docker-compose.yml"));
    assert!(compose.contains("postgres:"), "{compose}");
    assert!(compose.contains("redis:"), "{compose}");
    assert!(
        docker_create::service_exists(&compose, "redis"),
        "the merged service is found by the same rule the merge uses"
    );
}

#[test]
fn docker_create_refuses_a_service_it_has_no_template_for() {
    let (_dir, root) = workspace();

    docker_create::run(&DockerCreateArgs {
        no_cache: false,
        name: Some("not-a-service".to_string()),
        cwd: cwd(&root),
    });

    assert!(
        !root.join("modules/app/docker-compose.yml").exists(),
        "nothing is written for a service that does not exist"
    );
}
