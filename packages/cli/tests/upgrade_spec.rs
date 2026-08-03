use clap::Parser;
use serde_json::json;
use std::process::{Command, Output};
use std::sync::Mutex;

use cli::commands::upgrade::{
    UpgradeArgs, build_install_command, manual_install_command, parse_latest_version_value,
    parse_version_from_tag,
};

mod support;

use support::http::{Reply, Server};

static ENV_GUARD: Mutex<()> = Mutex::new(());

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: UpgradeArgs,
}

#[test]
fn upgrade_parses_all_flags() {
    let cli = TestCli::try_parse_from(["talos", "--cwd", "./here"])
        .expect("valid arguments should parse");

    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn upgrade_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.cwd.is_none());
}

#[test]
fn upgrade_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn parses_scoped_package_release_tag() {
    assert_eq!(parse_version_from_tag("@talosjs/cli@1.2.3"), "1.2.3");
}

#[test]
fn parses_v_prefixed_and_plain_tags() {
    assert_eq!(parse_version_from_tag("v0.4.0"), "0.4.0");
    assert_eq!(parse_version_from_tag("0.4.0"), "0.4.0");
}

#[test]
fn reads_the_latest_version_from_a_release_payload() {
    assert_eq!(
        parse_latest_version_value(&json!({ "tag_name": "@talosjs/cli@1.2.3" })).as_deref(),
        Some("1.2.3")
    );
    assert!(parse_latest_version_value(&json!({ "name": "no tag" })).is_none());
}

#[test]
fn builds_the_platform_install_command_in_the_requested_directory() {
    let cwd = std::path::Path::new("/work/tree");
    let command = build_install_command(cwd);

    assert_eq!(command.get_current_dir(), Some(cwd));
    if cfg!(windows) {
        assert_eq!(command.get_program().to_string_lossy(), "powershell");
    } else {
        assert_eq!(command.get_program().to_string_lossy(), "bash");
        let args: Vec<String> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();
        assert!(args.iter().any(|arg| arg.contains("install.sh")));
    }
}

#[test]
fn exposes_the_manual_upgrade_command() {
    let manual = manual_install_command();

    if cfg!(windows) {
        assert!(manual.contains("install.ps1"));
        assert!(manual.contains("powershell"));
    } else {
        assert!(manual.contains("install.sh"));
        assert!(manual.contains("curl -fsSL"));
    }
}

fn talos(args: &[&str], envs: &[(&str, &str)]) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_talos"));
    command.args(args).env("NO_COLOR", "1");
    for (key, value) in envs {
        command.env(key, value);
    }
    command.output().expect("the talos binary should run")
}

fn text(output: &Output) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

#[test]
fn upgrade_reports_when_already_on_the_latest_version() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let server = Server::start(|request| match request.path.as_str() {
        "/release" => Reply::json(json!({ "tag_name": format!("v{}", env!("CARGO_PKG_VERSION")) })),
        _ => Reply::status(404, ""),
    });

    let output = talos(
        &["upgrade"],
        &[("TALOS_LATEST_RELEASE_URL", &server.url("/release"))],
    );

    assert!(output.status.success(), "{}", text(&output));
    assert!(text(&output).contains("Already on the latest version"));
}

#[test]
fn upgrade_runs_the_install_script_when_a_newer_version_exists() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let server = Server::start(|request| match request.path.as_str() {
        "/release" => Reply::json(json!({ "tag_name": "@talosjs/cli@9.9.9" })),
        "/install.sh" => Reply::status(200, "#!/bin/sh\nexit 0\n"),
        _ => Reply::status(404, ""),
    });
    let cwd = tempfile::tempdir().expect("tempdir");

    let output = talos(
        &["upgrade", "--cwd", cwd.path().to_str().expect("utf8")],
        &[
            ("TALOS_LATEST_RELEASE_URL", &server.url("/release")),
            ("TALOS_INSTALL_SH_URL", &server.url("/install.sh")),
        ],
    );

    let output_text = text(&output);
    assert!(output.status.success(), "{output_text}");
    assert!(output_text.contains("Upgraded to v9.9.9"));
}

#[test]
fn upgrade_reports_the_manual_command_when_the_install_script_fails() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let server = Server::start(|request| match request.path.as_str() {
        "/release" => Reply::json(json!({ "tag_name": "@talosjs/cli@9.9.9" })),
        "/install.sh" => Reply::status(200, "#!/bin/sh\nexit 1\n"),
        _ => Reply::status(404, ""),
    });
    let cwd = tempfile::tempdir().expect("tempdir");

    let output = talos(
        &["upgrade", "--cwd", cwd.path().to_str().expect("utf8")],
        &[
            ("TALOS_LATEST_RELEASE_URL", &server.url("/release")),
            ("TALOS_INSTALL_SH_URL", &server.url("/install.sh")),
        ],
    );

    let output_text = text(&output);
    assert!(output.status.success(), "{output_text}");
    assert!(output_text.contains("Upgrade failed."));
    assert!(output_text.contains("/install.sh"));
}

#[test]
fn upgrade_exits_when_the_latest_release_cannot_be_determined() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());

    let output = talos(
        &["upgrade"],
        &[("TALOS_LATEST_RELEASE_URL", "http://127.0.0.1:1/release")],
    );

    assert!(!output.status.success());
    assert!(text(&output).contains("Unable to determine the latest version"));
}
