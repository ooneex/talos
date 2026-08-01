//! End-to-end runs of `project:check` over a scratch workspace.
//!
//! The per-rule specs cover the pure functions each check exposes; this one
//! covers the wiring around them — the dispatcher, the progress view, the cache
//! round-trip and the two renderers — by running the whole battery against a
//! workspace built on disk.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use cli::commands::project_check::{
    CheckId, CheckStatus, ProjectCheckArgs, execute, render_json, render_report,
};

fn write(path: &Path, content: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create parent directory");
    }
    fs::write(path, content).expect("write file");
}

/// A workspace with one backend module and one front-end module, carrying
/// enough real files that every check has something to look at.
fn workspace() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().to_path_buf();

    write(
        &root.join("package.json"),
        r#"{
  "name": "scratch",
  "private": true,
  "workspaces": ["modules/*", "packages/*"],
  "scripts": { "build": "echo build", "test": "echo test" },
  "dependencies": { "@talosjs/app": "1.0.0" }
}
"#,
    );
    write(
        &root.join("tsconfig.json"),
        r#"{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "paths": { "@user/*": ["./modules/user/src/*"], "@web/*": ["./modules/web/src/*"] }
  }
}
"#,
    );
    write(&root.join("bun.lock"), "{}\n");
    write(&root.join(".gitignore"), "node_modules\ndist\n.env\n");
    write(&root.join(".env.yml"), "APP_ENV: \"test\"\n");
    write(
        &root.join("README.md"),
        "# Scratch\n\nA scratch workspace.\n",
    );
    write(
        &root.join("docker-compose.yml"),
        "services:\n  db:\n    image: postgres:16\n    ports:\n      - \"5432:5432\"\n",
    );
    write(
        &root.join("biome.json"),
        r#"{ "linter": { "enabled": true } }"#,
    );

    // A backend module.
    let user = root.join("modules/user");
    write(&user.join("user.yml"), "name: \"user\"\ntype: \"module\"\n");
    write(
        &user.join("package.json"),
        r#"{
  "name": "@user/user",
  "scripts": { "test": "bun test", "lint": "biome lint" },
  "dependencies": { "@talosjs/service": "1.0.0" }
}
"#,
    );
    write(
        &user.join("src/UserModule.ts"),
        "import { UserService } from \"./services/UserService\";\n\nexport class UserModule {\n  public services = [UserService];\n}\n",
    );
    write(
        &user.join("src/services/UserService.ts"),
        "import type { IService } from \"@talosjs/service\";\n\nexport class UserService implements IService {\n  public find = (id: string): string => id;\n}\n",
    );
    write(
        &user.join("src/entities/UserEntity.ts"),
        "import { Column, Entity, PrimaryGeneratedColumn } from \"typeorm\";\n\n@Entity(\"users\")\nexport class UserEntity {\n  @PrimaryGeneratedColumn(\"uuid\")\n  public id!: string;\n\n  @Column({ type: \"varchar\", nullable: true })\n  public email: string | null = null;\n}\n",
    );
    write(
        &user.join("tests/services/UserService.spec.ts"),
        "import { describe, expect, it } from \"bun:test\";\nimport { UserService } from \"../../src/services/UserService\";\n\ndescribe(\"UserService\", () => {\n  it(\"returns the id\", () => {\n    expect(new UserService().find(\"a\")).toBe(\"a\");\n  });\n});\n",
    );
    write(
        &user.join("migrations/1700000000000-CreateUser.ts"),
        "export class CreateUser1700000000000 {\n  public up = async (): Promise<void> => {};\n  public down = async (): Promise<void> => {};\n}\n",
    );
    write(
        &user.join("issues/OON-100000.yml"),
        "id: \"OON-100000\"\ntitle: \"Something\"\nstate: \"Todo\"\npriority: \"Medium\"\nmodule: \"user\"\n",
    );

    // A front-end module.
    let web = root.join("modules/web");
    write(&web.join("web.yml"), "name: \"web\"\ntype: \"spa\"\n");
    write(
        &web.join("package.json"),
        r#"{
  "name": "@web/web",
  "scripts": { "test": "bun test", "e2e": "playwright test" },
  "dependencies": { "react": "19.0.0" }
}
"#,
    );
    write(
        &web.join("src/routes/index.tsx"),
        "export const Route = { component: () => null };\n",
    );
    write(
        &web.join("src/shared/styles/tokens.css"),
        ":root {\n  --color-text: #111111;\n  --color-surface: #ffffff;\n}\n",
    );
    write(
        &web.join("src/shared/translations/translations.json"),
        "{ \"hello\": { \"en\": \"Hello\", \"fr\": \"Bonjour\" } }\n",
    );
    write(&web.join("public/logo.svg"), "<svg></svg>\n");
    write(
        &web.join("e2e/home.spec.ts"),
        "import { expect, test } from \"@playwright/test\";\n\ntest(\"home\", async ({ page }) => {\n  await page.goto(\"/\");\n  await expect(page).toHaveTitle(/Scratch/);\n});\n",
    );

    (dir, root)
}

/// The scratch workspace with one decorated class of every kind the artifact
/// checks look for, each carrying the flaw its check is there to catch, so the
/// run has something to report rather than a page of skips.
fn busy_workspace() -> (tempfile::TempDir, PathBuf) {
    let (dir, root) = workspace();
    let src = root.join("modules/user/src");

    write(
        &src.join("queues/MailQueue.ts"),
        "@decorator.queue()\nexport class MailQueue {\n  private readonly name = \"mail\";\n\n  public handler = async (): Promise<void> => {};\n}\n",
    );
    write(
        &src.join("queues/DigestQueue.ts"),
        "@decorator.queue()\nexport class DigestQueue {\n  private readonly name = \"mail\";\n\n  public handler = async (): Promise<void> => {\n    await this.send();\n  };\n\n  public onFailed = async (): Promise<void> => {\n    this.log();\n  };\n}\n",
    );
    write(
        &src.join("crons/NightlyCron.ts"),
        "@decorator.cron()\nexport class NightlyCron {\n  public getTime = (): string => \"every 1 days\";\n\n  public handler = async (): Promise<void> => {\n    await this.sweep();\n  };\n}\n",
    );
    write(
        &src.join("crons/BrokenCron.ts"),
        "@decorator.cron()\nexport class BrokenCron {\n  public getTime = (): string => \"sometimes\";\n\n  public handler = async (): Promise<void> => {};\n}\n",
    );
    write(
        &src.join("events/SignupEvent.ts"),
        "@decorator.event()\nexport class SignupEvent {\n  public getChannel = (): string => \"user.signup\";\n\n  public handler = async (): Promise<void> => {};\n}\n",
    );
    write(
        &src.join("mailers/WelcomeMailer.ts"),
        "@decorator.mailer()\nexport class WelcomeMailer {\n  public send = async (): Promise<void> => {};\n}\n",
    );
    write(
        &src.join("mailers/OrphanMailerTemplate.tsx"),
        "export const OrphanMailerTemplate = () => null;\n",
    );
    write(
        &src.join("flags/BetaFeatureFlag.ts"),
        "@decorator.featureFlag()\nexport class BetaFeatureFlag {\n  public getKey = (): string => \"beta\";\n\n  public getDescription = (): string => \"\";\n}\n",
    );
    write(
        &src.join("permissions/AdminPermission.ts"),
        "@decorator.permission()\nexport class AdminPermission {\n  public check = (): boolean => {\n    return true;\n  };\n\n  public allow = (): this => {\n    return this;\n  };\n}\n",
    );
    write(
        &src.join("repositories/UserRepository.ts"),
        "@decorator.repository()\nexport class UserRepository {\n  public remove = async (): Promise<void> => {\n    await this.repository.delete({});\n  };\n\n  public find = async (): Promise<UserEntity[]> => {\n    return this.repository.find();\n  };\n}\n",
    );
    write(
        &src.join("repositories/GhostRepository.ts"),
        "@decorator.repository()\nexport class GhostRepository {\n  public all = async (): Promise<GhostEntity[]> => {\n    return this.repository.find();\n  };\n}\n",
    );
    write(
        &src.join("workflows/OrderWorkflow.ts"),
        "@decorator.workflow()\nexport class OrderWorkflow {\n  public getName = (): string => \"order\";\n\n  public getTransitions = (): WorkflowTransitionClassType[] => [ApproveTransition];\n}\n",
    );
    write(
        &src.join("workflows/transitions/ApproveTransition.ts"),
        "@decorator.transition()\nexport class ApproveTransition {\n  public getFrom = (): string => \"draft\";\n\n  public getTo = (): string => \"approved\";\n}\n",
    );
    write(
        &src.join("middlewares/AuthMiddleware.ts"),
        "@decorator.middleware()\nexport class AuthMiddleware {\n  public getOrder = (): number => 1;\n\n  public handler = async (): Promise<void> => {};\n}\n",
    );
    write(
        &src.join("controllers/UserController.ts"),
        "@decorator.controller()\nexport class UserController {\n  public list = async (): Promise<UserEntity[]> => {\n    return this.repository.find();\n  };\n}\n",
    );
    write(
        &src.join("../src/UserModule.ts"),
        "import { UserService } from \"./services/UserService\";\n\nexport class UserModule {\n  public services = [UserService];\n  public controllers = [];\n}\n",
    );

    // An entity whose foreign key carries no index, and a controller whose
    // route validates nothing.
    write(
        &src.join("entities/OrderEntity.ts"),
        "import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from \"typeorm\";\n\n@Entity(\"orders\")\nexport class OrderEntity {\n  @PrimaryGeneratedColumn(\"uuid\")\n  public id!: string;\n\n  @ManyToOne(() => UserEntity)\n  @JoinColumn({ name: \"user_id\" })\n  public user!: UserEntity;\n\n  @Column({ type: \"varchar\", unique: true, nullable: true })\n  public reference: string | null = null;\n}\n",
    );
    write(
        &src.join("controllers/OrderController.ts"),
        "@decorator.controller()\nexport class OrderController {\n  @Route.post(\"/orders\", { name: \"order.create\" })\n  public create = async (): Promise<void> => {};\n}\n",
    );

    // A marker pointing at an issue the workspace does not carry.
    write(
        &src.join("services/OrderService.ts"),
        "export class OrderService {\n  // TODO(OON-999999): reconcile the ledger\n  public run = (): void => {};\n}\n",
    );

    // A swagger module whose specification is the one the openapi check reads.
    let swagger = root.join("modules/docs");
    write(
        &swagger.join("docs.yml"),
        "name: \"docs\"\ntype: \"swagger\"\n",
    );
    write(
        &swagger.join("package.json"),
        "{ \"name\": \"@module/docs\", \"scripts\": { \"test\": \"bun test\" } }\n",
    );
    write(
        &swagger.join("openapi.json"),
        "{\n  \"openapi\": \"3.1.0\",\n  \"info\": { \"title\": \"Scratch\", \"version\": \"1.0.0\" },\n  \"paths\": { \"/users\": { \"get\": { \"summary\": \"List users\", \"responses\": {} } } }\n}\n",
    );

    // A storybook module pointing at the design system, with one story.
    let gallery = root.join("modules/gallery");
    write(
        &gallery.join("gallery.yml"),
        "name: \"gallery\"\ntype: \"storybook\"\ndesign: \"brand\"\n",
    );
    write(
        &gallery.join("package.json"),
        "{ \"name\": \"@module/gallery\", \"scripts\": { \"test\": \"bun test\" } }\n",
    );
    write(
        &gallery.join("src/features/stories/ButtonStory.ts"),
        "export const meta = { name: \"Button\", component: Button };\n",
    );

    // A dictionary with a locale missing from one of its keys.
    write(
        &root.join("modules/web/src/shared/translations/translations.json"),
        "{\n  \"hello\": { \"en\": \"Hello\", \"fr\": \"Bonjour\" },\n  \"bye\": { \"en\": \"Bye\" }\n}\n",
    );

    // A design module, so the front-end checks have tokens and colours to read.
    let design = root.join("modules/brand");
    write(
        &design.join("brand.yml"),
        "name: \"brand\"\ntype: \"design\"\n",
    );
    write(
        &design.join("package.json"),
        "{ \"name\": \"@module/brand\", \"scripts\": { \"test\": \"bun test\" } }\n",
    );
    write(
        &design.join("src/styles/tokens.css"),
        ":root {\n  --color-text: #cccccc;\n  --color-background: #ffffff;\n  --spacing-1: 4px;\n}\n",
    );
    write(
        &design.join("src/components/Button.tsx"),
        "export const Button = () => <button style={{ color: \"#cccccc\", background: \"#ffffff\" }} />;\n",
    );

    (dir, root)
}

fn args(root: &Path) -> ProjectCheckArgs {
    ProjectCheckArgs {
        cwd: Some(root.to_string_lossy().to_string()),
        no_cache: true,
        ..Default::default()
    }
}

/// Every check but the two that shell out to the whole toolchain.
fn static_checks() -> Vec<CheckId> {
    CheckId::ALL
        .into_iter()
        .filter(|id| !matches!(id, CheckId::Workspace | CheckId::E2e | CheckId::Outdated))
        .collect()
}

#[test]
fn every_static_check_produces_an_outcome_for_the_check_it_was_asked_for() {
    let (_dir, root) = workspace();
    let checks = static_checks();

    let report = execute(&args(&root), &checks);

    assert_eq!(report.outcomes.len(), checks.len());
    let reported: Vec<CheckId> = report.outcomes.iter().map(|outcome| outcome.id).collect();
    assert_eq!(reported, checks, "outcomes keep the requested order");
    assert_eq!(report.root, root.to_string_lossy());
}

#[test]
fn a_check_that_finds_nothing_to_look_at_reports_a_summary_rather_than_an_empty_line() {
    let (_dir, root) = workspace();

    let report = execute(&args(&root), &static_checks());

    for outcome in &report.outcomes {
        assert!(
            !outcome.summary.trim().is_empty(),
            "{:?} produced an empty summary",
            outcome.id
        );
    }
}

#[test]
fn strict_turns_every_warning_into_a_failure() {
    let (_dir, root) = workspace();
    let checks = static_checks();

    let lenient = execute(&args(&root), &checks);
    let strict = execute(
        &ProjectCheckArgs {
            strict: true,
            ..args(&root)
        },
        &checks,
    );

    let warned = lenient
        .outcomes
        .iter()
        .filter(|outcome| outcome.status == CheckStatus::Warned)
        .count();
    let lenient_failed = lenient
        .outcomes
        .iter()
        .filter(|outcome| outcome.status == CheckStatus::Failed)
        .count();
    let strict_failed = strict
        .outcomes
        .iter()
        .filter(|outcome| outcome.status == CheckStatus::Failed)
        .count();

    assert_eq!(strict_failed, lenient_failed + warned);
    assert!(
        strict
            .outcomes
            .iter()
            .all(|outcome| outcome.status != CheckStatus::Warned)
    );
}

#[test]
fn the_second_run_is_served_from_the_cache() {
    let (_dir, root) = workspace();
    let checks: Vec<CheckId> = static_checks()
        .into_iter()
        .filter(|id| id.cacheable())
        .collect();
    assert!(!checks.is_empty(), "some checks are cacheable");

    let cached_args = ProjectCheckArgs {
        cwd: Some(root.to_string_lossy().to_string()),
        ..Default::default()
    };

    let first = execute(&cached_args, &checks);
    assert!(
        first.outcomes.iter().all(|outcome| !outcome.cached),
        "nothing is cached on a cold workspace"
    );

    let second = execute(&cached_args, &checks);
    assert!(
        second.outcomes.iter().any(|outcome| outcome.cached),
        "the warm run reuses entries"
    );

    for (before, after) in first.outcomes.iter().zip(second.outcomes.iter()) {
        assert_eq!(before.id, after.id);
        assert_eq!(before.status, after.status, "{:?}", before.id);
        assert_eq!(before.summary, after.summary, "{:?}", before.id);
    }
}

#[test]
fn editing_a_source_file_invalidates_the_entries_that_read_it() {
    let (_dir, root) = workspace();
    let checks = vec![CheckId::Conventions];
    let cached_args = ProjectCheckArgs {
        cwd: Some(root.to_string_lossy().to_string()),
        ..Default::default()
    };

    execute(&cached_args, &checks);
    assert!(execute(&cached_args, &checks).outcomes[0].cached);

    write(
        &root.join("modules/user/src/services/UserService.ts"),
        "export class UserService {\n  public find(id: string): string {\n    return id;\n  }\n}\n",
    );

    assert!(
        !execute(&cached_args, &checks).outcomes[0].cached,
        "a source edit retires the entry"
    );
}

#[test]
fn restricting_the_run_to_a_module_narrows_what_the_scoped_checks_look_at() {
    let (_dir, root) = workspace();
    let checks = vec![CheckId::Accessibility, CheckId::Issues];

    let scoped = execute(
        &ProjectCheckArgs {
            modules: Some("user".to_string()),
            ..args(&root)
        },
        &checks,
    );

    let accessibility = &scoped.outcomes[0];
    assert_eq!(accessibility.id, CheckId::Accessibility);
    assert_eq!(
        accessibility.status,
        CheckStatus::Skipped,
        "user is not a UI module, so there is nothing to lint"
    );
}

#[test]
fn the_end_to_end_check_is_skipped_when_no_module_declares_a_suite() {
    let (_dir, root) = workspace();
    fs::remove_dir_all(root.join("modules/web")).expect("drop the only e2e module");

    let report = execute(&args(&root), &[CheckId::E2e]);

    assert_eq!(report.outcomes[0].status, CheckStatus::Skipped);
    assert!(report.outcomes[0].summary.contains("e2e"));
}

#[test]
fn the_commit_check_reports_the_history_it_could_not_read_outside_a_repository() {
    let (_dir, root) = workspace();

    let report = execute(&args(&root), &[CheckId::Commits]);

    assert_eq!(report.outcomes[0].id, CheckId::Commits);
    assert!(!report.outcomes[0].summary.is_empty());
}

#[test]
fn the_hygiene_check_walks_the_workspace_sources() {
    let (_dir, root) = workspace();
    write(
        &root.join("modules/user/src/services/DebugService.ts"),
        "export class DebugService {\n  public go = (): void => {\n    // eslint-disable-next-line\n    debugger;\n  };\n}\n",
    );

    let report = execute(&args(&root), &[CheckId::Hygiene]);

    assert_eq!(report.outcomes[0].id, CheckId::Hygiene);
    assert!(!report.outcomes[0].summary.is_empty());
}

#[test]
fn the_human_report_names_every_check_it_ran() {
    let (_dir, root) = workspace();
    let checks = static_checks();

    let rendered = render_report(&execute(&args(&root), &checks));

    for id in &checks {
        assert!(
            rendered.contains(id.title()),
            "{} is missing from the report",
            id.title()
        );
    }
}

#[test]
fn the_json_report_round_trips_every_outcome() {
    let (_dir, root) = workspace();
    let checks = static_checks();
    let report = execute(
        &ProjectCheckArgs {
            json: true,
            ..args(&root)
        },
        &checks,
    );

    let payload: serde_json::Value =
        serde_json::from_str(&render_json(&report)).expect("the report is valid JSON");

    let checks_json = payload["checks"]
        .as_array()
        .expect("checks is an array")
        .clone();
    assert_eq!(checks_json.len(), checks.len());

    let keys: BTreeSet<String> = checks_json
        .iter()
        .map(|entry| entry["id"].as_str().unwrap_or_default().to_string())
        .collect();
    for id in &checks {
        assert!(keys.contains(id.key()), "{} is missing", id.key());
    }
    assert_eq!(
        payload["root"].as_str(),
        Some(root.to_string_lossy().as_ref())
    );
}

#[test]
fn a_workspace_with_nothing_in_it_still_produces_a_full_report() {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().to_path_buf();
    let checks = static_checks();

    let report = execute(&args(&root), &checks);

    assert_eq!(report.outcomes.len(), checks.len());
    assert!(!render_report(&report).is_empty());
}

// ---------------------------------------------------------------------------
// A workspace with something in every corner
// ---------------------------------------------------------------------------

#[test]
fn the_artifact_checks_stop_skipping_once_the_workspace_declares_artifacts() {
    let (_dir, root) = busy_workspace();
    let checks = static_checks();

    let report = execute(&args(&root), &checks);

    let status = |id: CheckId| {
        report
            .outcomes
            .iter()
            .find(|outcome| outcome.id == id)
            .map(|outcome| outcome.status)
            .unwrap_or_else(|| panic!("{id:?} is missing"))
    };

    for id in [
        CheckId::Queues,
        CheckId::Crons,
        CheckId::Events,
        CheckId::Mailers,
        CheckId::Flags,
        CheckId::Permissions,
        CheckId::Repositories,
        CheckId::Workflows,
        CheckId::Middlewares,
    ] {
        assert_ne!(
            status(id),
            CheckStatus::Skipped,
            "{id:?} had an artifact to read"
        );
    }
}

#[test]
fn a_queue_served_twice_and_a_schedule_that_does_not_parse_are_both_reported() {
    let (_dir, root) = busy_workspace();

    let report = execute(&args(&root), &[CheckId::Queues, CheckId::Crons]);

    let queues = &report.outcomes[0];
    assert_eq!(queues.status, CheckStatus::Failed);
    assert!(
        queues
            .details
            .iter()
            .any(|detail| detail.contains("already served by")),
        "{:?}",
        queues.details
    );

    let crons = &report.outcomes[1];
    assert_eq!(crons.status, CheckStatus::Failed);
    assert!(
        crons
            .details
            .iter()
            .any(|detail| detail.contains("sometimes")),
        "{:?}",
        crons.details
    );
}

#[test]
fn a_repository_built_on_an_entity_no_class_declares_is_reported() {
    let (_dir, root) = busy_workspace();

    let report = execute(&args(&root), &[CheckId::Repositories]);

    assert!(
        report.outcomes[0]
            .details
            .iter()
            .any(|detail| detail.contains("GhostEntity")),
        "{:?}",
        report.outcomes[0].details
    );
}

#[test]
fn a_permission_that_guards_nothing_is_reported_as_a_placeholder() {
    let (_dir, root) = busy_workspace();

    let report = execute(&args(&root), &[CheckId::Permissions]);

    assert!(
        report.outcomes[0]
            .details
            .iter()
            .any(|detail| detail.contains("AdminPermission")),
        "{:?}",
        report.outcomes[0].details
    );
}

#[test]
fn the_front_end_checks_read_the_design_module_the_workspace_declares() {
    let (_dir, root) = busy_workspace();

    let report = execute(
        &args(&root),
        &[CheckId::Tokens, CheckId::Contrast, CheckId::Assets],
    );

    for outcome in &report.outcomes {
        assert!(!outcome.summary.is_empty(), "{:?} said nothing", outcome.id);
    }
}

#[test]
fn the_busy_workspace_renders_a_report_naming_the_checks_that_failed() {
    let (_dir, root) = busy_workspace();

    let report = execute(&args(&root), &static_checks());
    let rendered = render_report(&report);

    assert!(report.failed(), "the planted flaws are found");
    assert!(rendered.contains("Queues"), "{rendered}");
    assert!(
        rendered.contains("already served by"),
        "the detail reaches the report: {rendered}"
    );
}

#[test]
fn the_module_typed_checks_read_the_swagger_and_storybook_modules() {
    let (_dir, root) = busy_workspace();

    let report = execute(
        &args(&root),
        &[CheckId::Openapi, CheckId::Stories, CheckId::Translations],
    );

    for outcome in &report.outcomes {
        assert!(!outcome.summary.is_empty(), "{:?} said nothing", outcome.id);
    }
    let openapi = &report.outcomes[0];
    assert_ne!(
        openapi.status,
        CheckStatus::Skipped,
        "the swagger module carries a specification: {openapi:?}"
    );
}

#[test]
fn a_translation_key_missing_a_locale_its_siblings_have_is_reported() {
    let (_dir, root) = busy_workspace();

    let report = execute(&args(&root), &[CheckId::Translations]);

    assert!(
        report.outcomes[0]
            .details
            .iter()
            .any(|detail| detail.contains("bye")),
        "{:?}",
        report.outcomes[0].details
    );
}

#[test]
fn a_foreign_key_with_no_index_behind_it_is_reported() {
    let (_dir, root) = busy_workspace();

    let report = execute(&args(&root), &[CheckId::Indexes]);

    assert!(
        !report.outcomes[0].summary.is_empty(),
        "the entity was read: {:?}",
        report.outcomes[0]
    );
}

#[test]
fn inside_a_git_repository_the_branch_and_commit_checks_have_something_to_read() {
    let (_dir, root) = busy_workspace();
    let git = |args: &[&str]| {
        std::process::Command::new("git")
            .args(args)
            .current_dir(&root)
            .env("GIT_AUTHOR_NAME", "Tester")
            .env("GIT_AUTHOR_EMAIL", "tester@example.com")
            .env("GIT_COMMITTER_NAME", "Tester")
            .env("GIT_COMMITTER_EMAIL", "tester@example.com")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .expect("git should run");
    };
    git(&["init", "--initial-branch=main"]);
    git(&["config", "user.name", "Tester"]);
    git(&["config", "user.email", "tester@example.com"]);
    git(&["add", "-A"]);
    git(&["commit", "--no-verify", "-m", "feat(user): Add the module"]);
    git(&[
        "commit",
        "--allow-empty",
        "--no-verify",
        "-m",
        "not a conventional subject",
    ]);

    let report = execute(
        &args(&root),
        &[CheckId::Branches, CheckId::Commits, CheckId::Git],
    );

    let commits = report
        .outcomes
        .iter()
        .find(|outcome| outcome.id == CheckId::Commits)
        .expect("the commit check ran");
    assert_ne!(commits.status, CheckStatus::Skipped);
    assert!(
        commits
            .details
            .iter()
            .any(|detail| detail.contains("not a conventional subject")),
        "{:?}",
        commits.details
    );

    let branches = report
        .outcomes
        .iter()
        .find(|outcome| outcome.id == CheckId::Branches)
        .expect("the branch check ran");
    assert_ne!(
        branches.status,
        CheckStatus::Skipped,
        "the repository and the issue file are both there"
    );
}
