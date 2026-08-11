use std::fs;
use std::process::{Command, Output};

use clap::Parser;
use cli::commands::app_create::{AppCreateArgs, CI_PROVIDERS, run, write_ci_cd_files, write_named};
use tempfile::tempdir;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: AppCreateArgs,
}

fn make_templates_dir() -> tempfile::TempDir {
    let dir = tempdir().unwrap();
    let files = [
        "github/ci.yml.txt",
        "github/production.yml.txt",
        "gitlab/ci.yml.txt",
        "gitlab/production.yml.txt",
        "bitbucket/pipelines.yml.txt",
        "renovate.json.txt",
    ];
    for file in files {
        let path = dir.path().join(file);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(&path, "name: {{NAME}}\n").unwrap();
    }
    dir
}

#[test]
fn app_create_args_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--name",
        "MyApi",
        "--destination",
        "./my-api",
        "--no-cache",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyApi"));
    assert_eq!(cli.args.destination.as_deref(), Some("./my-api"));
    assert!(cli.args.no_cache);
}

#[test]
fn app_create_args_defaults_are_none() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.destination.is_none());
    assert!(!cli.args.no_cache);
}

#[test]
fn write_named_substitutes_name_placeholder() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("nested").join("file.yml");

    write_named(&path, "service: {{NAME}}\n", "my_app").unwrap();

    assert_eq!(fs::read_to_string(&path).unwrap(), "service: my_app\n");
}

#[test]
fn write_ci_cd_files_writes_github_workflows_and_renovate() {
    let dir = tempdir().unwrap();
    let templates = make_templates_dir();

    write_ci_cd_files(templates.path(), dir.path(), "github", "my_app").unwrap();

    assert!(
        dir.path()
            .join(".github")
            .join("workflows")
            .join("ci.yml")
            .is_file()
    );
    assert!(
        dir.path()
            .join(".github")
            .join("workflows")
            .join("production.yml")
            .is_file()
    );
    assert_eq!(
        fs::read_to_string(dir.path().join(".github").join("workflows").join("ci.yml")).unwrap(),
        "name: my_app\n"
    );
    assert!(dir.path().join("renovate.json").is_file());
    assert!(!dir.path().join(".gitlab-ci.yml").exists());
}

#[test]
fn write_ci_cd_files_writes_gitlab_pipeline_and_include_file() {
    let dir = tempdir().unwrap();
    let templates = make_templates_dir();

    write_ci_cd_files(templates.path(), dir.path(), "gitlab", "my_app").unwrap();

    assert!(
        dir.path()
            .join(".gitlab")
            .join("ci")
            .join("ci.yml")
            .is_file()
    );
    assert!(
        dir.path()
            .join(".gitlab")
            .join("ci")
            .join("production.yml")
            .is_file()
    );
    let include = fs::read_to_string(dir.path().join(".gitlab-ci.yml")).unwrap();
    assert!(include.contains(".gitlab/ci/ci.yml"));
    assert!(include.contains(".gitlab/ci/production.yml"));
    assert!(dir.path().join("renovate.json").is_file());
}

#[test]
fn write_ci_cd_files_writes_bitbucket_pipelines() {
    let dir = tempdir().unwrap();
    let templates = make_templates_dir();

    write_ci_cd_files(templates.path(), dir.path(), "bitbucket", "my_app").unwrap();

    assert!(dir.path().join("bitbucket-pipelines.yml").is_file());
    assert_eq!(
        fs::read_to_string(dir.path().join("bitbucket-pipelines.yml")).unwrap(),
        "name: my_app\n"
    );
    assert!(dir.path().join("renovate.json").is_file());
}

#[test]
fn write_ci_cd_files_returns_error_when_template_missing() {
    let dir = tempdir().unwrap();
    let empty_templates = tempdir().unwrap();

    let result = write_ci_cd_files(empty_templates.path(), dir.path(), "github", "my_app");

    assert!(result.is_err());
    assert!(!dir.path().join(".github").exists());
}

#[test]
fn ci_providers_lists_the_three_supported_providers() {
    assert_eq!(CI_PROVIDERS, ["github", "gitlab", "bitbucket"]);
}

fn seed_skeleton(root: &std::path::Path) {
    let write = |path: &std::path::Path, content: &str| {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent");
        }
        fs::write(path, content).expect("write file");
    };

    write(&root.join("package.json"), "{ \"name\": \"skeleton\" }\n");
    write(&root.join("bun.lock"), "{}\n");
    write(&root.join("tsconfig.json"), "{ \"compilerOptions\": {} }\n");
    write(&root.join(".dockerignore"), "node_modules\n");
    write(&root.join("README.md"), "# skeleton\n");
    write(
        &root.join("modules/app/.env.example.yml"),
        "server:\n  port: 3000\n",
    );
    write(
        &root.join("modules/app/package.json"),
        "{ \"name\": \"@module/app\" }\n",
    );
    write(&root.join(".git/HEAD"), "ref: refs/heads/main\n");
}

fn run_talos(cwd: &std::path::Path, home: &std::path::Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .current_dir(cwd)
        .env("HOME", home)
        .env("NO_COLOR", "1")
        .output()
        .expect("talos should run")
}

fn text(output: &Output) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

#[test]
fn app_create_scaffolds_an_api_project_from_the_cached_skeleton() {
    let home = tempdir().unwrap();
    let workdir = tempdir().unwrap();
    seed_skeleton(&home.path().join(".talos/skeleton"));

    let output = run_talos(
        workdir.path(),
        home.path(),
        &["app:create", "--name", "MyApi", "--destination", "my-api"],
    );

    let output_text = text(&output);
    assert!(output.status.success(), "{output_text}");
    let destination = workdir.path().join("my-api");
    assert!(destination.join("package.json").is_file());
    assert!(destination.join("modules/my-api/.env.yml").is_file());
    assert!(!destination.join("modules/app").exists());
    assert!(output_text.contains("my-api created successfully"));
    assert!(output_text.contains("talos app:start"));
    assert!(output_text.contains("talos app:stop"));
}

#[test]
fn app_create_run_returns_cleanly_when_the_name_cannot_be_resolved() {
    let dir = tempdir().unwrap();

    run(&AppCreateArgs {
        name: None,
        destination: Some(dir.path().join("unused").display().to_string()),
        no_cache: false,
    });

    assert_eq!(
        fs::read_dir(dir.path()).unwrap().count(),
        0,
        "no project should be scaffolded when the prompt is unavailable"
    );
}
