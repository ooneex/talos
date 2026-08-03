use clap::Parser;
use cli::commands::design_remove::{DesignRemoveArgs, run};
use std::fs;
use tempfile::tempdir;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: DesignRemoveArgs,
}

#[test]
fn design_remove_parses_all_flags() {
    let cli =
        TestCli::try_parse_from(["talos", "--name", "MyDesign", "--cwd", "./here", "--silent"])
            .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyDesign"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
}

#[test]
fn design_remove_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn design_remove_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn design_remove_refuses_to_remove_reserved_modules() {
    let dir = tempdir().unwrap();
    run(&DesignRemoveArgs {
        name: Some("app".to_string()),
        cwd: Some(dir.path().to_string_lossy().to_string()),
        silent: true,
    });

    assert!(!dir.path().join("modules/app").exists());
}

#[test]
fn design_remove_reports_missing_module_silently() {
    let dir = tempdir().unwrap();
    run(&DesignRemoveArgs {
        name: Some("missing-design".to_string()),
        cwd: Some(dir.path().to_string_lossy().to_string()),
        silent: true,
    });

    assert!(!dir.path().join("modules/missing-design").exists());
}

#[test]
fn design_remove_reports_non_design_module_silently() {
    let dir = tempdir().unwrap();
    let module_dir = dir.path().join("modules/billing");
    fs::create_dir_all(&module_dir).unwrap();
    fs::write(module_dir.join("package.json"), "{}").unwrap();
    fs::write(module_dir.join("billing.yml"), "type: \"backend\"\n").unwrap();

    run(&DesignRemoveArgs {
        name: Some("billing".to_string()),
        cwd: Some(dir.path().to_string_lossy().to_string()),
        silent: true,
    });

    assert!(module_dir.exists());
}

#[test]
fn design_remove_deletes_the_design_module_when_silent() {
    let dir = tempdir().unwrap();
    let module_dir = dir.path().join("modules/material");
    fs::create_dir_all(&module_dir).unwrap();
    fs::write(module_dir.join("package.json"), "{}").unwrap();
    fs::write(module_dir.join("material.yml"), "type: \"design\"\n").unwrap();

    run(&DesignRemoveArgs {
        name: Some("material".to_string()),
        cwd: Some(dir.path().to_string_lossy().to_string()),
        silent: true,
    });

    assert!(!module_dir.exists());
}
