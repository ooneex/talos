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
        "--kill-ports",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.modules.as_deref(), Some("user"));
    assert_eq!(cli.args.packages.as_deref(), Some("core"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.kill_ports);
}

#[test]
fn app_start_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.modules.is_none());
    assert!(cli.args.packages.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.kill_ports);
}

#[test]
fn app_start_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// module name and dev command
// ---------------------------------------------------------------------------

mod support;

use std::process::{Command, Output};

use cli::commands::app_start::{command_line, load_app_module_name};
use cli::utils::{RunnableModule, RunnableModuleType};
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

fn module(dir: &std::path::Path, module_type: RunnableModuleType) -> RunnableModule {
    RunnableModule {
        name: "sample".to_string(),
        r#type: module_type,
        dir: dir.join("modules").join("sample"),
    }
}

#[test]
fn command_line_runs_the_dev_script_from_the_module_directory_for_front_end_modules() {
    let dir = TempDir::new("app-start-command-front");

    for module_type in [
        RunnableModuleType::Spa,
        RunnableModuleType::Storybook,
        RunnableModuleType::Swagger,
        RunnableModuleType::Admin,
    ] {
        assert_eq!(
            command_line(dir.path(), &module(dir.path(), module_type)),
            "bun run --cwd modules/sample dev"
        );
    }
}

#[test]
fn command_line_hot_reloads_the_entry_point_for_back_end_modules() {
    let dir = TempDir::new("app-start-command-back");

    for module_type in [RunnableModuleType::Api, RunnableModuleType::Microservice] {
        assert_eq!(
            command_line(dir.path(), &module(dir.path(), module_type)),
            "bun --hot run modules/sample/src/index.ts"
        );
    }
}

#[test]
fn command_line_keeps_the_absolute_path_when_the_module_is_outside_the_workspace() {
    let dir = TempDir::new("app-start-command-outside");
    let outside = module(std::path::Path::new("/elsewhere"), RunnableModuleType::Api);

    assert_eq!(
        command_line(dir.path(), &outside),
        "bun --hot run /elsewhere/modules/sample/src/index.ts"
    );
}

#[cfg(unix)]
fn write_executable(path: &std::path::Path, content: &str) {
    use std::os::unix::fs::PermissionsExt;

    std::fs::write(path, content).expect("script should be writable");
    let mut permissions = std::fs::metadata(path).expect("metadata").permissions();
    permissions.set_mode(0o755);
    std::fs::set_permissions(path, permissions).expect("permissions");
}

fn run_talos(root: &std::path::Path, bin: &std::path::Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .env("NO_COLOR", "1")
        .env("PATH", bin)
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

#[cfg(unix)]
#[test]
fn app_start_runs_selected_back_end_modules_and_starts_docker_when_needed() {
    let dir = TempDir::new("app-start-run");
    dir.write("modules/app/package.json", r#"{"name": "@acme/app"}"#);
    dir.write("modules/app/app.yml", "type: \"api\"\n");
    dir.write("modules/app/docker-compose.yml", "services: {}\n");
    dir.write("modules/api/api.yml", "type: \"api\"\n");
    dir.write("modules/api/src/index.ts", "console.log('api');\n");
    let bin = dir.dir("bin");
    let log = dir.path().join("bin.log");
    write_executable(
        &bin.join("docker"),
        &format!(
            "#!/bin/sh\nprintf 'docker:%s\\n' \"$*\" >> \"{}\"\nif [ \"$1\" = \"--version\" ]; then exit 0; fi\nexit 0\n",
            log.display()
        ),
    );
    write_executable(
        &bin.join("bun"),
        &format!(
            "#!/bin/sh\nprintf 'bun:%s\\n' \"$*\" >> \"{}\"\necho \"started:$*\"\nexit 0\n",
            log.display()
        ),
    );

    let output = run_talos(
        dir.path(),
        &bin,
        &[
            "app:start",
            "--cwd",
            dir.path().to_str().expect("utf8"),
            "--modules",
            "api",
        ],
    );

    let output_text = text(&output);
    assert!(output.status.success(), "{output_text}");
    assert!(output_text.contains("Starting Docker services for @acme/app"));
    assert!(output_text.contains("Starting api"));
    let log_text = std::fs::read_to_string(log).expect("log");
    assert!(log_text.contains("docker:compose up -d"));
    assert!(
        log_text.contains(
            "bun:run --parallel --no-exit-on-error bun --hot run modules/api/src/index.ts"
        )
    );
}

#[test]
fn app_start_reports_missing_app_module() {
    let dir = TempDir::new("app-start-missing-app");

    let output = run_talos(
        dir.path(),
        dir.path(),
        &["app:start", "--cwd", dir.path().to_str().expect("utf8")],
    );

    assert!(output.status.success());
    assert!(text(&output).contains("Module app not found"));
}

#[test]
fn app_start_reports_when_no_modules_match_the_filter() {
    let dir = TempDir::new("app-start-no-match");
    dir.write("modules/app/package.json", r#"{"name": "@acme/app"}"#);
    dir.write("modules/app/app.yml", "type: \"api\"\n");
    dir.write("modules/api/api.yml", "type: \"api\"\n");
    dir.write("modules/api/src/index.ts", "console.log('api');\n");

    let output = run_talos(
        dir.path(),
        dir.path(),
        &[
            "app:start",
            "--cwd",
            dir.path().to_str().expect("utf8"),
            "--modules",
            "missing",
        ],
    );

    assert!(output.status.success());
    assert!(text(&output).contains("No matching modules found"));
}
