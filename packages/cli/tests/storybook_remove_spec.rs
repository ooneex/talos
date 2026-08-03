use clap::Parser;
use cli::commands::storybook_remove::{StorybookRemoveArgs, run};
use std::fs;
use tempfile::tempdir;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: StorybookRemoveArgs,
}

#[test]
fn storybook_remove_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--name",
        "MyStorybook",
        "--cwd",
        "./here",
        "--silent",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyStorybook"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
}

#[test]
fn storybook_remove_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn storybook_remove_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn storybook_remove_refuses_to_remove_reserved_modules() {
    let dir = tempdir().unwrap();
    run(&StorybookRemoveArgs {
        name: Some("shared".to_string()),
        cwd: Some(dir.path().to_string_lossy().to_string()),
        silent: true,
    });
    assert!(!dir.path().join("modules/shared").exists());
}

#[test]
fn storybook_remove_reports_missing_module_silently() {
    let dir = tempdir().unwrap();
    run(&StorybookRemoveArgs {
        name: Some("missing-storybook".to_string()),
        cwd: Some(dir.path().to_string_lossy().to_string()),
        silent: true,
    });
    assert!(!dir.path().join("modules/missing-storybook").exists());
}

#[test]
fn storybook_remove_reports_non_storybook_module_silently() {
    let dir = tempdir().unwrap();
    let module_dir = dir.path().join("modules/billing");
    fs::create_dir_all(&module_dir).unwrap();
    fs::write(module_dir.join("package.json"), "{}").unwrap();
    fs::write(module_dir.join("billing.yml"), "type: \"backend\"\n").unwrap();

    run(&StorybookRemoveArgs {
        name: Some("billing".to_string()),
        cwd: Some(dir.path().to_string_lossy().to_string()),
        silent: true,
    });

    assert!(module_dir.exists());
}

#[test]
fn storybook_remove_deletes_the_storybook_module_when_silent() {
    let dir = tempdir().unwrap();
    let module_dir = dir.path().join("modules/ui-book");
    fs::create_dir_all(&module_dir).unwrap();
    fs::write(module_dir.join("package.json"), "{}").unwrap();
    fs::write(module_dir.join("ui-book.yml"), "type: \"storybook\"\n").unwrap();

    run(&StorybookRemoveArgs {
        name: Some("ui-book".to_string()),
        cwd: Some(dir.path().to_string_lossy().to_string()),
        silent: true,
    });

    assert!(!module_dir.exists());
}
