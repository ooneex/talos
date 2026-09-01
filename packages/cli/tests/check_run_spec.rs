#![cfg(unix)]

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;

use cli::utils::OUTPUT_DIR;

fn write(path: &Path, content: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("parent directory");
    }
    fs::write(path, content).expect("fixture file");
}

#[test]
fn check_runs_tests_after_lint_fails_and_writes_the_complete_report() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let root = tmp.path();
    let module = root.join("modules/app");
    write(
        &root.join("package.json"),
        "{\"name\":\"workspace\",\"private\":true,\"workspaces\":[\"modules/*\"]}",
    );
    write(
        &module.join("package.json"),
        "{\"name\":\"app\",\"scripts\":{\"lint\":\"fake\",\"test\":\"fake\"}}",
    );
    write(&module.join("tests/app.spec.ts"), "export {};\n");

    let bin = root.join("bin");
    let bun = bin.join("bun");
    write(
        &bun,
        "#!/bin/sh\ncase \"$1 $2\" in\n  \"run lint\") printf 'lint\\n' >> \"$CHECK_LOG\"; exit 7 ;;\n  \"run test\") printf 'test\\n' >> \"$CHECK_LOG\"; exit 0 ;;\n  *) exit 0 ;;\nesac\n",
    );
    let mut permissions = fs::metadata(&bun).expect("fake bun metadata").permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&bun, permissions).expect("fake bun executable");

    let log = root.join("commands.log");
    let path = format!(
        "{}:{}",
        bin.display(),
        std::env::var("PATH").unwrap_or_default()
    );
    let output = Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(["check", "--no-cache", "--output=json"])
        .current_dir(root)
        .env("PATH", path)
        .env("CHECK_LOG", &log)
        .output()
        .expect("talos check runs");

    assert!(!output.status.success());
    assert_eq!(
        fs::read_to_string(&log).expect("command log"),
        "lint\ntest\n"
    );

    let report =
        fs::read_to_string(root.join(OUTPUT_DIR).join("talos_check.json")).expect("check report");
    let report: serde_json::Value = serde_json::from_str(&report).expect("valid report JSON");
    assert_eq!(report["passed"], false);
    assert_eq!(report["summary"]["install"]["status"], "pass");
    assert_eq!(report["summary"]["lint"]["status"], "fail");
    assert_eq!(report["summary"]["test"]["status"], "pass");
}
