//! Runs the generators that copy a whole module out of the skeleton.
//!
//! `design:create`, `spa:create`, `admin:create`, `storybook:create` and
//! `microservice:create` all start by cloning the skeleton repository. The
//! clone is cached under `$HOME/.talos/skeleton`, so seeding that cache with a
//! miniature skeleton is what keeps this offline: the resolver finds a
//! populated, fresh directory and never reaches the network.
//!
//! `$HOME` is process-wide, so the whole file is a single test.

use std::fs;
use std::path::{Path, PathBuf};

use cli::commands::{
    admin_create::{self, AdminCreateArgs},
    design_create::{self, DesignCreateArgs},
    microservice_create::{self, MicroserviceCreateArgs},
    spa_create::{self, SpaCreateArgs},
    storybook_create::{self, StorybookCreateArgs},
};

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("a parent")).expect("create parent");
    fs::write(path, content).expect("write file");
}

/// A front-end module template: the manifest, a package.json with no
/// dependencies to install, a vite config and one source file importing the
/// template's own alias so the rewrite has something to rewrite.
fn ui_template(dir: &Path, kind: &str) {
    write(
        &dir.join(format!("{kind}.yml")),
        &format!("type: \"{kind}\"\ndesign: \"design\"\ntarget: \"app\"\n"),
    );
    write(
        &dir.join("package.json"),
        &format!(
            "{{\n  \"name\": \"@module/{kind}\",\n  \"scripts\": {{ \"test\": \"bun test\" }}\n}}\n"
        ),
    );
    write(
        &dir.join("vite.config.ts"),
        "export default {\n  resolve: {\n    alias: {\n      \"@\": fileURLToPath(new URL(\"./src\", import.meta.url)),\n    },\n  },\n};\n",
    );
    write(
        &dir.join("src/main.ts"),
        &format!(
            "import {{ App }} from \"@module/{kind}/App\";\n\nexport const boot = () => App;\n"
        ),
    );
    write(&dir.join("src/App.ts"), "export const App = () => null;\n");
}

/// A `$HOME` whose skeleton cache is already populated and fresh.
fn seeded_home() -> PathBuf {
    let home = std::env::temp_dir().join(format!("talos-skeleton-home-{}", std::process::id()));
    let _ = fs::remove_dir_all(&home);
    seed(&home);
    home
}

/// Populate a home directory's skeleton cache with the miniature skeleton.
fn seed(home: &Path) {
    let skeleton = home.join(".talos/skeleton");

    ui_template(&skeleton.join("modules/design"), "design");
    ui_template(&skeleton.join("modules/spa"), "spa");
    ui_template(&skeleton.join("modules/admin"), "admin");
    ui_template(&skeleton.join("modules/storybook"), "storybook");

    let microservice = skeleton.join("modules/microservice");
    write(
        &microservice.join("microservice.yml"),
        "type: \"microservice\"\n",
    );
    write(
        &microservice.join("package.json"),
        "{\n  \"name\": \"@module/microservice\"\n}\n",
    );
    write(
        &microservice.join("src/MicroserviceModule.ts"),
        "export const MicroserviceModule = {};\n",
    );
    write(
        &microservice.join("src/index.ts"),
        "import { MicroserviceModule } from \"./MicroserviceModule\";\n\nexport default MicroserviceModule;\n",
    );
    write(
        &microservice.join("tests/MicroserviceModule.spec.ts"),
        "// MicroserviceModule\n",
    );
    write(
        &skeleton.join("modules/app/.env.example.yml"),
        "server:\n  port: 3000\n",
    );

    write(
        &skeleton.join("templates/module/module.txt"),
        "export const {{NAME}}Module = {};\n",
    );
    write(
        &skeleton.join("templates/module/test.txt"),
        "// {{NAME}}Module {{name}}\n",
    );
    write(
        &skeleton.join("templates/module/yml.txt"),
        "type: \"module\"\n",
    );
    write(
        &skeleton.join("templates/github/microservice-ci.yml.txt"),
        "name: {{name}} ci\nenv: {{NAME_UPPER}}\n",
    );
    write(
        &skeleton.join("templates/github/microservice-production.yml.txt"),
        "name: {{name}} production\n",
    );
    write(
        &skeleton.join("templates/gitlab/microservice.yml.txt"),
        "{{name}}-job:\n  script: echo {{NAME}}\n",
    );
    write(
        &skeleton.join("templates/bitbucket/microservice-pipelines.yml.txt"),
        "pipelines:\n  default:\n    - step: {{name}}\n",
    );
}

fn workspace() -> PathBuf {
    let root =
        std::env::temp_dir().join(format!("talos-skeleton-workspace-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("modules")).expect("create workspace");
    write(
        &root.join("tsconfig.json"),
        "{ \"compilerOptions\": { \"paths\": {} } }\n",
    );
    write(&root.join("package.json"), "{ \"name\": \"scratch\" }\n");
    root
}

fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_else(|_| panic!("{} should exist", path.display()))
}

#[test]
fn every_skeleton_generator_lands_a_renamed_module_in_the_workspace() {
    let home = seeded_home();
    let root = workspace();
    unsafe {
        std::env::set_var("HOME", &home);
        // A stale env var from the outer run would send the generators at the
        // real skeleton instead of the seeded one.
        std::env::remove_var(cli::utils::TEMPLATES_DIR_ENV);
    }
    let cwd = Some(root.to_string_lossy().to_string());

    // --- design -------------------------------------------------------------

    design_create::run(&DesignCreateArgs {
        name: Some("Brand".to_string()),
        cwd: cwd.clone(),
        silent: true,
        no_cache: false,
    });

    let brand = root.join("modules/brand");
    assert!(brand.join("brand.yml").is_file(), "the manifest is renamed");
    assert!(
        !brand.join("design.yml").exists(),
        "the template manifest is removed"
    );
    assert!(
        read(&brand.join("package.json")).contains("\"@module/brand\""),
        "the package takes the module's name"
    );
    assert!(
        read(&brand.join("src/main.ts")).contains("@module/brand/App"),
        "imports are re-pointed at the new alias"
    );
    assert!(
        read(&root.join("tsconfig.json")).contains("@module/brand"),
        "the root tsconfig gains the path alias"
    );

    // --- spa ----------------------------------------------------------------

    spa_create::run(&SpaCreateArgs {
        name: Some("WebModule".to_string()),
        design: Some("brand".to_string()),
        target: Some("api".to_string()),
        cwd: cwd.clone(),
        silent: true,
        no_cache: false,
    });

    let web = root.join("modules/web");
    let web_yml = read(&web.join("web.yml"));
    assert!(web_yml.contains("design: \"brand\""), "{web_yml}");
    assert!(web_yml.contains("target: \"api\""), "{web_yml}");
    assert!(
        read(&web.join("package.json")).contains("vite --port"),
        "the dev script is given a free port"
    );
    assert!(
        read(&web.join("src/main.ts")).contains("@module/web/App"),
        "imports are re-pointed"
    );
    assert!(
        web.join("src/shared/.gitkeep").is_file(),
        "the shared folder is seeded"
    );

    // --- admin --------------------------------------------------------------

    admin_create::run(&AdminCreateArgs {
        name: Some("back-office".to_string()),
        design: Some("brand".to_string()),
        target: None,
        cwd: cwd.clone(),
        silent: true,
        no_cache: false,
    });

    let back_office = root.join("modules/back-office");
    let admin_yml = read(&back_office.join("back-office.yml"));
    assert!(admin_yml.contains("design: \"brand\""), "{admin_yml}");
    assert!(
        !admin_yml.contains("target:"),
        "no target drops the field entirely: {admin_yml}"
    );

    // --- storybook ----------------------------------------------------------

    storybook_create::run(&StorybookCreateArgs {
        name: Some("gallery".to_string()),
        design: Some("brand".to_string()),
        cwd: cwd.clone(),
        silent: true,
        no_cache: false,
    });

    let gallery = root.join("modules/gallery");
    assert!(read(&gallery.join("gallery.yml")).contains("design: \"brand\""));
    assert!(read(&gallery.join("package.json")).contains("vite --port"));

    // Every front-end module gets its own port.
    let ports = spa_create::collect_used_ports(&root.join("modules"), "");
    assert!(
        ports.len() >= 3,
        "spa, admin and storybook each took a port: {ports:?}"
    );

    // --- microservice -------------------------------------------------------

    microservice_create::run(&MicroserviceCreateArgs {
        name: Some("billing".to_string()),
        cwd: cwd.clone(),
        silent: true,
        no_cache: false,
    });

    let billing = root.join("modules/billing");
    assert_eq!(
        read(&billing.join("billing.yml")).trim(),
        "type: \"microservice\"",
        "the module type is rewritten"
    );
    assert!(
        !billing.join("microservice.yml").exists(),
        "the template manifest is removed"
    );
    assert_eq!(
        read(&billing.join("src/BillingModule.ts")),
        "export const BillingModule = {};\n"
    );
    assert!(
        !billing.join("src/MicroserviceModule.ts").exists(),
        "the template module is removed"
    );
    assert!(
        read(&billing.join("src/index.ts")).contains("BillingModule"),
        "the entry point points at the renamed module"
    );
    assert!(
        read(&billing.join("tests/BillingModule.spec.ts")).contains("billing"),
        "the spec is rendered with both cases of the name"
    );
    assert!(
        read(&billing.join(".env.yml")).contains("port:"),
        "the service takes an environment of its own"
    );

    // --- discovery helpers see what the generators produced -----------------

    let designs = spa_create::collect_design_modules(&root.join("modules"));
    assert!(designs.contains(&"brand".to_string()), "{designs:?}");

    let targets = admin_create::collect_target_modules(&root.join("modules"));
    assert!(
        !targets.contains(&"brand".to_string()),
        "a design is not a target: {targets:?}"
    );

    let mut seen = Vec::new();
    storybook_create::visit_files_recursive(&gallery.join("src"), &mut |path| {
        seen.push(path.to_path_buf());
    });
    assert!(!seen.is_empty(), "the walk reaches the copied sources");

    let _ = fs::remove_dir_all(&root);
    let _ = fs::remove_dir_all(&home);
}

/// A scratch home whose skeleton cache is seeded, and a scratch workspace, both
/// removed with the test.
fn scratch() -> (tempfile::TempDir, tempfile::TempDir) {
    let home = tempfile::tempdir().expect("create temp home");
    let root = tempfile::tempdir().expect("create temp dir");
    seed(home.path());
    write(
        &root.path().join("package.json"),
        "{ \"name\": \"scratch\" }\n",
    );
    write(
        &root.path().join("tsconfig.json"),
        "{ \"compilerOptions\": { \"paths\": {} } }\n",
    );
    fs::create_dir_all(root.path().join("modules")).expect("create modules dir");
    (home, root)
}

/// A run with `--silent` off, so the generator reaches the prompts. Stdin is
/// closed, which is what makes those branches give up rather than hang.
fn talos(root: &Path, home: &Path, args: &[&str]) -> std::process::Output {
    std::process::Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .arg(format!("--cwd={}", root.display()))
        .env("HOME", home)
        .env("NO_COLOR", "1")
        // Nothing on the PATH, so the dependency install at the end of each
        // generator gives up instead of reaching a registry.
        .env("PATH", "/nonexistent")
        .env_remove("TALOS_TEMPLATES_DIR")
        .stdin(std::process::Stdio::null())
        .output()
        .expect("the talos binary should run")
}

#[test]
fn a_microservice_in_a_github_repository_gets_its_workflows_written() {
    let (home, root) = scratch();
    write(&root.path().join(".github/workflows/.gitkeep"), "");

    let output = talos(
        root.path(),
        home.path(),
        &["microservice:create", "--name=billing"],
    );

    assert!(output.status.success(), "{output:?}");
    let ci = read(&root.path().join(".github/workflows/billing-ci.yml"));
    assert!(ci.contains("billing ci"), "{ci}");
    assert!(
        ci.contains("BILLING"),
        "the upper-cased name is substituted: {ci}"
    );
    assert!(
        root.path()
            .join(".github/workflows/billing-production.yml")
            .is_file(),
        "the production workflow is written too"
    );
}

#[test]
fn a_microservice_in_a_gitlab_repository_gets_a_job_and_an_include() {
    let (home, root) = scratch();
    write(&root.path().join(".gitlab-ci.yml"), "stages:\n  - build\n");

    let output = talos(
        root.path(),
        home.path(),
        &["microservice:create", "--name=billing"],
    );

    assert!(output.status.success(), "{output:?}");
    assert!(read(&root.path().join(".gitlab/ci/billing.yml")).contains("billing-job"));
    assert!(
        read(&root.path().join(".gitlab-ci.yml")).contains("billing"),
        "the root pipeline includes the new job"
    );
}

#[test]
fn a_microservice_in_a_bitbucket_repository_gets_a_pipelines_file_to_merge() {
    let (home, root) = scratch();
    write(
        &root.path().join("bitbucket-pipelines.yml"),
        "pipelines:\n  default: []\n",
    );

    let output = talos(
        root.path(),
        home.path(),
        &["microservice:create", "--name=billing"],
    );

    assert!(output.status.success(), "{output:?}");
    assert!(
        read(&root.path().join(".bitbucket/billing-pipelines.yml")).contains("billing"),
        "the pipeline is written beside the root one rather than into it"
    );
}

#[test]
fn a_front_end_generator_asked_for_nothing_gives_up_rather_than_guessing() {
    let (home, root) = scratch();

    // No `--name`, and stdin is closed, so the prompt cannot be answered.
    let output = talos(root.path(), home.path(), &["spa:create"]);

    assert!(output.status.success(), "{output:?}");
    assert!(
        !root.path().join("modules/spa").exists(),
        "nothing is scaffolded from an unanswered prompt"
    );
}

#[test]
fn a_spa_naming_a_design_that_is_not_there_yet_scaffolds_it_too() {
    let (home, root) = scratch();

    let output = talos(
        root.path(),
        home.path(),
        &["spa:create", "--name=web", "--design=brand", "--silent"],
    );

    assert!(output.status.success(), "{output:?}");
    assert!(root.path().join("modules/web").is_dir());
    assert!(
        root.path().join("modules/brand").is_dir(),
        "the design module the spa points at is created alongside it"
    );
}
