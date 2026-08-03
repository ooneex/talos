use clap::Parser;
use cli::commands::command_run::CommandRunArgs;
use std::os::unix::fs::PermissionsExt;
use std::process::{Command, Output};

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

fn write(path: &std::path::Path, content: &str) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).expect("parent");
    }
    std::fs::write(path, content).expect("file");
}

fn executable(path: &std::path::Path, content: &str) {
    write(path, content);
    let mut permissions = std::fs::metadata(path).expect("metadata").permissions();
    permissions.set_mode(0o755);
    std::fs::set_permissions(path, permissions).expect("permissions");
}

fn talos(root: &std::path::Path, path: &std::path::Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .env("NO_COLOR", "1")
        .env("PATH", path)
        .current_dir(root)
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
fn command_run_requires_an_identifier() {
    let dir = tempfile::tempdir().expect("tempdir");

    let output = talos(dir.path(), dir.path(), &["command:run"]);

    assert!(!output.status.success());
    assert!(text(&output).contains("Command name is required"));
}

#[test]
fn command_run_warns_when_no_modules_directory_exists() {
    let dir = tempfile::tempdir().expect("tempdir");

    let output = talos(dir.path(), dir.path(), &["command:run", "--id", "seed"]);

    assert!(output.status.success());
    assert!(text(&output).contains("not found in any module"));
}

#[test]
fn command_run_executes_the_matching_module_command() {
    let dir = tempfile::tempdir().expect("tempdir");
    let bin = dir.path().join("bin");
    std::fs::create_dir_all(&bin).expect("bin");
    executable(
        &bin.join("bun"),
        &format!(
            "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"{}\"\nexit 0\n",
            dir.path().join("bun.log").display()
        ),
    );
    write(
        &dir.path().join("modules/shared/package.json"),
        "{ \"name\": \"@module/shared\" }\n",
    );
    write(
        &dir.path().join("modules/shared/bin/command/run.ts"),
        "// runner\n",
    );
    write(
        &dir.path()
            .join("modules/shared/src/commands/SeedCommand.ts"),
        "export class SeedCommand { getName() { return 'seed'; } }\n",
    );

    let output = talos(
        dir.path(),
        &bin,
        &["command:run", "--id", "seed", "--", "--flag", "value"],
    );

    let output_text = text(&output);
    assert!(output.status.success(), "{output_text}");
    assert!(
        output_text.contains("completed for @module/shared"),
        "{output_text}"
    );
    let log = std::fs::read_to_string(dir.path().join("bun.log")).expect("log");
    assert!(log.contains("run"), "{log}");
    assert!(log.contains("seed"), "{log}");
    assert!(log.contains("--flag"), "{log}");
}

#[test]
fn command_run_exits_when_the_confirmed_command_fails() {
    let dir = tempfile::tempdir().expect("tempdir");
    let bin = dir.path().join("bin");
    std::fs::create_dir_all(&bin).expect("bin");
    executable(
        &bin.join("bun"),
        "#!/bin/sh\nprintf 'boom\\n' >&2\nexit 7\n",
    );
    write(
        &dir.path().join("modules/shared/package.json"),
        "{ \"name\": \"@module/shared\" }\n",
    );
    write(
        &dir.path().join("modules/shared/bin/command/run.ts"),
        "// runner\n",
    );
    write(
        &dir.path()
            .join("modules/shared/src/commands/SeedCommand.ts"),
        "export class SeedCommand { getName() { return 'seed'; } }\n",
    );

    let output = talos(dir.path(), &bin, &["command:run", "--id", "seed"]);

    let output_text = text(&output);
    assert!(!output.status.success());
    assert!(
        output_text.contains("failed in @module/shared"),
        "{output_text}"
    );
    assert!(output_text.contains("boom"), "{output_text}");
}

#[test]
fn command_run_reports_when_no_module_declares_the_command() {
    let dir = tempfile::tempdir().expect("tempdir");
    let bin = dir.path().join("bin");
    std::fs::create_dir_all(&bin).expect("bin");
    executable(&bin.join("bun"), "#!/bin/sh\nexit 0\n");
    write(
        &dir.path().join("modules/shared/package.json"),
        "{ \"name\": \"@module/shared\" }\n",
    );
    write(
        &dir.path().join("modules/shared/bin/command/run.ts"),
        "// runner\n",
    );
    write(
        &dir.path()
            .join("modules/shared/src/commands/OtherCommand.ts"),
        "export class OtherCommand { getName() { return 'other'; } }\n",
    );

    let output = talos(dir.path(), &bin, &["command:run", "--id", "seed"]);

    assert!(!output.status.success());
    assert!(text(&output).contains("not found in any module"));
}
