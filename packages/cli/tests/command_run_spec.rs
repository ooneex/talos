use clap::Parser;
use cli::commands::command_run::CommandRunArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: CommandRunArgs,
}

#[test]
fn command_run_parses_id_and_cwd() {
    let cli = TestCli::try_parse_from(["talos", "--id", "seed", "--cwd", "./here"])
        .expect("valid arguments should parse");

    assert_eq!(cli.args.id.as_deref(), Some("seed"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.args.is_empty());
}

#[test]
fn command_run_collects_trailing_var_args() {
    let cli = TestCli::try_parse_from(["talos", "--id", "seed", "--", "run", "--flag", "-x"])
        .expect("trailing arguments should parse");

    assert_eq!(cli.args.id.as_deref(), Some("seed"));
    assert_eq!(
        cli.args.args,
        vec!["run".to_string(), "--flag".to_string(), "-x".to_string(),]
    );
}

#[test]
fn command_run_allows_hyphen_values_in_trailing_args() {
    let cli = TestCli::try_parse_from(["talos", "--", "--only-hyphenated"])
        .expect("hyphenated trailing arguments should parse");

    assert_eq!(cli.args.args, vec!["--only-hyphenated".to_string()]);
}

#[test]
fn command_run_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.id.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(cli.args.args.is_empty());
}

// ---------------------------------------------------------------------------
// package name and command discovery
// ---------------------------------------------------------------------------

mod support;

use cli::commands::command_run::{package_name, visit_command_files};
use support::TempDir;

#[test]
fn package_name_reads_the_manifest() {
    let dir = TempDir::new("command-run-name");
    dir.write("package.json", r#"{"name": "@acme/user"}"#);

    assert_eq!(package_name(dir.path(), "fallback"), "@acme/user");
}

#[test]
fn package_name_falls_back_when_the_manifest_is_unusable() {
    let dir = TempDir::new("command-run-name-fallback");

    assert_eq!(package_name(dir.path(), "fallback"), "fallback");

    dir.write("package.json", "not json");
    assert_eq!(package_name(dir.path(), "fallback"), "fallback");

    dir.write("package.json", r#"{"version": "1.0.0"}"#);
    assert_eq!(package_name(dir.path(), "fallback"), "fallback");
}

#[test]
fn visit_command_files_collects_nested_command_classes() {
    let dir = TempDir::new("command-run-visit");
    dir.write("commands/SeedCommand.ts", "");
    dir.write("commands/nested/MigrateCommand.ts", "");
    dir.write("commands/helper.ts", "");

    let mut files = Vec::new();
    visit_command_files(dir.path(), &mut files);
    let mut names: Vec<String> = files
        .iter()
        .filter_map(|p| p.file_name().and_then(|n| n.to_str()).map(str::to_string))
        .collect();
    names.sort();

    assert_eq!(names, ["MigrateCommand.ts", "SeedCommand.ts"]);
}

#[test]
fn visit_command_files_is_empty_for_a_missing_directory() {
    let dir = TempDir::new("command-run-visit-missing");

    let mut files = Vec::new();
    visit_command_files(&dir.path().join("nope"), &mut files);

    assert!(files.is_empty());
}
