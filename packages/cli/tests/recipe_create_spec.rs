use clap::Parser;
use cli::commands::recipe_create::{RecipeCreateArgs, run};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: RecipeCreateArgs,
}

fn recipe_args(cwd: &Path) -> RecipeCreateArgs {
    RecipeCreateArgs {
        title: None,
        description: None,
        steps: Vec::new(),
        dependencies: Vec::new(),
        module: None,
        cwd: Some(cwd.display().to_string()),
    }
}

fn seed_module(cwd: &Path, module: &str) -> PathBuf {
    let module_dir = cwd.join("modules").join(module);
    fs::create_dir_all(&module_dir).expect("module dir");
    fs::write(module_dir.join("package.json"), "{}").expect("package");
    module_dir
}

fn only_recipe(recipes_dir: &Path) -> (String, String) {
    let entries = fs::read_dir(recipes_dir)
        .expect("recipes dir")
        .collect::<Result<Vec<_>, _>>()
        .expect("entries");
    assert_eq!(entries.len(), 1);
    let path = entries[0].path();
    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .expect("file stem")
        .to_string();
    (stem, fs::read_to_string(&path).expect("recipe yaml"))
}

#[test]
fn recipe_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--title",
        "Sign in",
        "--description",
        "Signs in with an email code",
        "--step",
        "navigate http://localhost:3033",
        "--step",
        "click form button, a.link",
        "--dependency",
        "ABC-000001,ABC-000002",
        "--dependency",
        "ABC-000003",
        "--module",
        "user",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.title.as_deref(), Some("Sign in"));
    assert_eq!(
        cli.args.description.as_deref(),
        Some("Signs in with an email code")
    );
    // A comma inside a step is part of the step, not a separator.
    assert_eq!(
        cli.args.steps,
        vec![
            "navigate http://localhost:3033".to_string(),
            "click form button, a.link".to_string()
        ]
    );
    assert_eq!(
        cli.args.dependencies,
        vec![
            "ABC-000001".to_string(),
            "ABC-000002".to_string(),
            "ABC-000003".to_string()
        ]
    );
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn recipe_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.title.is_none());
    assert!(cli.args.description.is_none());
    assert!(cli.args.steps.is_empty());
    assert!(cli.args.dependencies.is_empty());
    assert!(cli.args.module.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn recipe_create_rejects_the_issue_only_flags() {
    for flag in ["--priority", "--label", "--definitely-not-a-flag"] {
        assert!(
            TestCli::try_parse_from(["talos", flag, "value"]).is_err(),
            "{flag}"
        );
    }
}

#[test]
fn recipe_create_run_writes_only_the_recipe_fields_in_the_module_recipes_folder() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let module_dir = seed_module(tmp.path(), "user");

    run(&RecipeCreateArgs {
        title: Some("  Sign in with an email code  ".to_string()),
        description: Some("  Checks the passwordless sign-in flow  ".to_string()),
        steps: vec![
            " navigate http://localhost:3033 ".to_string(),
            "click button[type='submit']".to_string(),
            "   ".to_string(),
            "wait 5s".to_string(),
            "fill input[name='email'] XXX".to_string(),
            "wait 5s".to_string(),
        ],
        dependencies: vec![
            " ABC-000001 ".to_string(),
            "".to_string(),
            "ABC-000002".to_string(),
            "ABC-000001".to_string(),
        ],
        module: Some("user".to_string()),
        ..recipe_args(tmp.path())
    });

    let (id, yaml) = only_recipe(&module_dir.join("recipes"));
    assert!(
        id.len() == 10
            && id[..3].chars().all(|c| ('A'..='F').contains(&c))
            && &id[3..4] == "-"
            && id[4..].chars().all(|c| c.is_ascii_digit()),
        "{id}"
    );
    // Blank values are dropped, repeated steps are kept, repeated dependencies are not.
    assert_eq!(
        yaml,
        format!(
            "id: \"{id}\"\n\
             module: \"user\"\n\
             title: \"Sign in with an email code\"\n\
             description: |\n\
             \x20 Checks the passwordless sign-in flow\n\
             dependencies:\n\
             \x20 - \"ABC-000001\"\n\
             \x20 - \"ABC-000002\"\n\
             steps:\n\
             \x20 - action: \"navigate\"\n\
             \x20   url: \"http://localhost:3033\"\n\
             \x20 - action: \"click\"\n\
             \x20   selector: \"button[type='submit']\"\n\
             \x20 - action: \"wait\"\n\
             \x20   duration: 5000\n\
             \x20 - action: \"fill\"\n\
             \x20   selector: \"input[name='email']\"\n\
             \x20   value: \"XXX\"\n\
             \x20 - action: \"wait\"\n\
             \x20   duration: 5000\n"
        )
    );
    assert!(!module_dir.join("issues").exists());
}

#[test]
fn recipe_create_run_defaults_to_shared_with_empty_fields() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let shared_dir = seed_module(tmp.path(), "shared");

    run(&recipe_args(tmp.path()));

    let (id, yaml) = only_recipe(&shared_dir.join("recipes"));
    assert_eq!(
        yaml,
        format!(
            "id: \"{id}\"\n\
             module: \"shared\"\n\
             title: \"\"\n\
             description: null\n\
             dependencies: []\n\
             steps: []\n"
        )
    );
}

#[test]
fn recipe_create_run_writes_nothing_when_a_step_is_invalid() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let shared_dir = seed_module(tmp.path(), "shared");

    run(&RecipeCreateArgs {
        steps: vec![
            "navigate http://localhost:3033".to_string(),
            "hover #menu".to_string(),
        ],
        ..recipe_args(tmp.path())
    });

    assert!(!shared_dir.join("recipes").exists());
}

#[test]
fn recipe_create_run_reports_write_failures_cleanly() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let shared_dir = seed_module(tmp.path(), "shared");
    fs::write(shared_dir.join("recipes"), "blocking file").expect("recipes file");

    run(&recipe_args(tmp.path()));

    assert!(shared_dir.join("recipes").is_file());
}
