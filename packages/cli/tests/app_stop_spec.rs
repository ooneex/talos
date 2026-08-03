use clap::Parser;
use cli::commands::app_stop::AppStopArgs;
use std::os::unix::fs::PermissionsExt;
use std::process::{Command, Output};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: AppStopArgs,
}

#[test]
fn app_stop_parses_all_flags() {
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
fn app_stop_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.modules.is_none());
    assert!(cli.args.packages.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn app_stop_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

fn write_executable(path: &std::path::Path, content: &str) {
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

#[test]
fn app_stop_stops_docker_for_selected_back_end_modules() {
    let dir = tempfile::tempdir().expect("tempdir");
    std::fs::create_dir_all(dir.path().join("modules/app")).expect("app dir");
    std::fs::create_dir_all(dir.path().join("modules/api")).expect("api dir");
    std::fs::write(
        dir.path().join("modules/app/package.json"),
        r#"{"name": "@acme/app"}"#,
    )
    .expect("package");
    std::fs::write(dir.path().join("modules/app/app.yml"), "type: \"api\"\n").expect("yml");
    std::fs::write(
        dir.path().join("modules/app/docker-compose.yml"),
        "services: {}\n",
    )
    .expect("compose");
    std::fs::write(dir.path().join("modules/api/api.yml"), "type: \"api\"\n").expect("api yml");
    let bin = dir.path().join("bin");
    std::fs::create_dir_all(&bin).expect("bin");
    let log = dir.path().join("docker.log");
    write_executable(
        &bin.join("docker"),
        &format!(
            "#!/bin/sh\nprintf 'docker:%s\\n' \"$*\" >> \"{}\"\nif [ \"$1\" = \"--version\" ]; then exit 0; fi\nexit 0\n",
            log.display()
        ),
    );

    let output = run_talos(
        dir.path(),
        &bin,
        &[
            "app:stop",
            "--cwd",
            dir.path().to_str().expect("utf8"),
            "--modules",
            "api",
        ],
    );

    let output_text = text(&output);
    assert!(output.status.success(), "{output_text}");
    assert!(output_text.contains("Stopping Docker services for @acme/app"));
    let log_text = std::fs::read_to_string(log).expect("log");
    assert!(log_text.contains("docker:compose down"));
}

#[test]
fn app_stop_exits_when_the_app_module_is_missing() {
    let dir = tempfile::tempdir().expect("tempdir");

    let output = run_talos(
        dir.path(),
        dir.path(),
        &["app:stop", "--cwd", dir.path().to_str().expect("utf8")],
    );

    assert!(!output.status.success());
    assert!(text(&output).contains("Module app not found"));
}

#[test]
fn app_stop_exits_when_no_matching_docker_services_exist() {
    let dir = tempfile::tempdir().expect("tempdir");
    std::fs::create_dir_all(dir.path().join("modules/app")).expect("app dir");
    std::fs::create_dir_all(dir.path().join("modules/web")).expect("web dir");
    std::fs::write(
        dir.path().join("modules/app/package.json"),
        r#"{"name": "@acme/app"}"#,
    )
    .expect("package");
    std::fs::write(dir.path().join("modules/app/app.yml"), "type: \"api\"\n").expect("yml");
    std::fs::write(dir.path().join("modules/web/web.yml"), "type: \"spa\"\n").expect("web yml");
    let bin = dir.path().join("bin");
    std::fs::create_dir_all(&bin).expect("bin");
    write_executable(
        &bin.join("docker"),
        "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then exit 0; fi\nexit 0\n",
    );

    let output = run_talos(
        dir.path(),
        &bin,
        &[
            "app:stop",
            "--cwd",
            dir.path().to_str().expect("utf8"),
            "--modules",
            "web",
        ],
    );

    assert!(!output.status.success());
    assert!(text(&output).contains("No matching Docker services to stop"));
}
