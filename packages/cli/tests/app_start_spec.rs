use clap::Parser;
use cli::commands::app_start::AppStartArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: AppStartArgs,
}

#[test]
fn app_start_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--modules",
        "user",
        "--packages",
        "core",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.modules.as_deref(), Some("user"));
    assert_eq!(cli.args.packages.as_deref(), Some("core"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn app_start_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.modules.is_none());
    assert!(cli.args.packages.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn app_start_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// module name and dev command
// ---------------------------------------------------------------------------

mod support;

use cli::commands::app_start::{command_line, load_app_module_name};
use cli::utils::RunnableModuleType;
use support::TempDir;

#[test]
fn load_app_module_name_reads_the_manifest() {
    let dir = TempDir::new("app-start-name");
    dir.write("package.json", r#"{"name": "@acme/app"}"#);

    assert_eq!(
        load_app_module_name(dir.path(), "fallback").as_deref(),
        Some("@acme/app")
    );
}

#[test]
fn load_app_module_name_falls_back_when_the_manifest_has_no_name() {
    let dir = TempDir::new("app-start-name-fallback");
    dir.write("package.json", r#"{"version": "1.0.0"}"#);

    assert_eq!(
        load_app_module_name(dir.path(), "fallback").as_deref(),
        Some("fallback")
    );
}

#[test]
fn load_app_module_name_is_none_without_a_readable_manifest() {
    let dir = TempDir::new("app-start-name-missing");

    assert!(load_app_module_name(dir.path(), "fallback").is_none());

    dir.write("package.json", "not json");
    assert!(load_app_module_name(dir.path(), "fallback").is_none());
}

#[test]
fn command_line_runs_vite_for_front_end_modules() {
    let dir = TempDir::new("app-start-command-front");

    for module_type in [
        RunnableModuleType::Spa,
        RunnableModuleType::Storybook,
        RunnableModuleType::Swagger,
        RunnableModuleType::Admin,
    ] {
        assert_eq!(command_line(dir.path(), module_type), "bun run dev");
    }
}

#[test]
fn command_line_hot_reloads_the_entry_point_for_back_end_modules() {
    let dir = TempDir::new("app-start-command-back");

    for module_type in [RunnableModuleType::Api, RunnableModuleType::Microservice] {
        let line = command_line(dir.path(), module_type);
        assert!(line.starts_with("bun --hot run "));
        assert!(line.ends_with("src/index.ts"));
    }
}
