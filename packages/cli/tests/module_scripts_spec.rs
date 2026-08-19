//! The commands that run a script a module ships in its `bin/` folder.
//!
//! `migration:up`, `migration:down`, `seed:run` and `command:run` all resolve a
//! `.ts` entry point inside each module and hand it to bun. The fixture's entry
//! points print their arguments, so a run is a few milliseconds and the test can
//! read back exactly what the command passed along.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("a parent")).expect("create parent");
    fs::write(path, content).expect("write file");
}

/// A script that writes its arguments to a file beside the workspace, so the
/// test can assert on what it was called with.
fn recorder(log: &Path) -> String {
    format!(
        "await Bun.write({:?}, process.argv.slice(2).join(\" \") + \"\\n\");\nconsole.log(\"ran\");\n",
        log.to_string_lossy()
    )
}

/// A workspace with one module carrying every bin entry point.
fn workspace() -> (tempfile::TempDir, PathBuf, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().to_path_buf();
    let log = root.join("calls.log");

    write(&root.join("package.json"), "{ \"name\": \"scratch\" }\n");
    let user = root.join("modules/user");
    write(
        &user.join("package.json"),
        "{ \"name\": \"@module/user\" }\n",
    );
    write(&user.join("bin/migration/up.ts"), &recorder(&log));
    write(&user.join("bin/migration/down.ts"), &recorder(&log));
    write(&user.join("bin/seed/run.ts"), &recorder(&log));
    write(&user.join("bin/command/run.ts"), &recorder(&log));
    write(
        &user.join("src/commands/SyncCommand.ts"),
        "export class SyncCommand {\n  getName(): string { return \"sync:users\"; }\n}\n",
    );

    (dir, root, log)
}

fn talos(root: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .arg(format!("--cwd={}", root.display()))
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .output()
        .expect("the talos binary should run")
}

fn text(output: &Output) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

fn calls(log: &Path) -> String {
    fs::read_to_string(log).unwrap_or_default()
}

// ---------------------------------------------------------------------------
// migrations and seeds
// ---------------------------------------------------------------------------

#[test]
fn migration_up_runs_every_modules_entry_point_and_says_which_one_it_ran() {
    let (_dir, root, _log) = workspace();

    let output = talos(&root, &["migration:up"]);

    assert!(output.status.success(), "{}", text(&output));
    assert!(
        text(&output).contains("@module/user"),
        "the module is named by its package: {}",
        text(&output)
    );
}

#[test]
fn drop_is_passed_through_to_the_script() {
    let (_dir, root, log) = workspace();

    talos(&root, &["migration:up", "--drop"]);

    assert!(calls(&log).contains("--drop"), "{}", calls(&log));
}

/// A workspace with two modules, each recording into its own log, so a run can
/// be read back per module.
fn two_module_workspace(bin_path: &str) -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().to_path_buf();

    write(&root.join("package.json"), "{ \"name\": \"scratch\" }\n");
    for name in ["alpha", "beta"] {
        let module = root.join("modules").join(name);
        write(
            &module.join("package.json"),
            &format!("{{ \"name\": \"@module/{name}\" }}\n"),
        );
        write(
            &module.join(bin_path),
            &recorder(&root.join(format!("{name}.log"))),
        );
    }

    (dir, root)
}

/// Overwrites each module's script with one that brackets a pause, so the log
/// shows both which module ran first and whether the two overlapped.
fn record_run_order(root: &Path, bin_path: &str, log: &Path) {
    for name in ["alpha", "beta"] {
        write(
            &root.join(format!("modules/{name}/{bin_path}")),
            &format!(
                "import {{ appendFileSync }} from \"node:fs\";\nappendFileSync({:?}, \"start {name}\\n\");\nawait Bun.sleep(300);\nappendFileSync({:?}, \"end {name}\\n\");\n",
                log.to_string_lossy(),
                log.to_string_lossy()
            ),
        );
    }
}

#[test]
fn only_the_first_module_is_told_to_drop_the_database() {
    let (_dir, root) = two_module_workspace("bin/migration/up.ts");

    let output = talos(&root, &["migration:up", "--drop"]);

    assert!(output.status.success(), "{}", text(&output));
    let alpha = calls(&root.join("alpha.log"));
    let beta = calls(&root.join("beta.log"));
    assert!(alpha.contains("--drop"), "the first module drops: {alpha}");
    assert!(
        !beta.contains("--drop"),
        "a later drop would wipe what the modules before it applied: {beta}"
    );
}

#[test]
fn modules_sharing_a_database_run_one_at_a_time() {
    let (_dir, root) = two_module_workspace("bin/migration/up.ts");
    let log = root.join("order.log");
    record_run_order(&root, "bin/migration/up.ts", &log);

    let output = talos(&root, &["migration:up"]);

    assert!(output.status.success(), "{}", text(&output));
    assert_eq!(
        calls(&log),
        "start alpha\nend alpha\nstart beta\nend beta\n",
        "two modules applying the same shared migration at once race on it"
    );
}

#[test]
fn rolling_back_walks_the_modules_in_the_reverse_order_it_applied_them() {
    let (_dir, root) = two_module_workspace("bin/migration/down.ts");
    let log = root.join("order.log");
    record_run_order(&root, "bin/migration/down.ts", &log);

    let output = talos(&root, &["migration:down"]);

    assert!(output.status.success(), "{}", text(&output));
    assert_eq!(
        calls(&log),
        "start beta\nend beta\nstart alpha\nend alpha\n",
        "a module stacked on another module's tables has to be undone first"
    );
}

#[test]
fn seeding_runs_one_module_at_a_time_in_the_order_the_migrations_did() {
    let (_dir, root) = two_module_workspace("bin/seed/run.ts");
    let log = root.join("order.log");
    record_run_order(&root, "bin/seed/run.ts", &log);

    let output = talos(&root, &["seed:run"]);

    assert!(output.status.success(), "{}", text(&output));
    assert_eq!(
        calls(&log),
        "start alpha\nend alpha\nstart beta\nend beta\n",
        "a seed inserting rows another module's seed points at must land first"
    );
}

#[test]
fn only_the_first_seeded_module_is_told_to_drop_the_database() {
    let (_dir, root) = two_module_workspace("bin/seed/run.ts");

    let output = talos(&root, &["seed:run", "--drop"]);

    assert!(output.status.success(), "{}", text(&output));
    let alpha = calls(&root.join("alpha.log"));
    let beta = calls(&root.join("beta.log"));
    assert!(alpha.contains("--drop"), "the first module drops: {alpha}");
    assert!(
        !beta.contains("--drop"),
        "a later drop would wipe the rows the modules before it seeded: {beta}"
    );
}

#[test]
fn migration_down_runs_the_other_entry_point() {
    let (_dir, root, _log) = workspace();
    fs::remove_file(root.join("modules/user/bin/migration/up.ts")).expect("drop the up script");

    let output = talos(&root, &["migration:down"]);

    assert!(output.status.success(), "{}", text(&output));
}

#[test]
fn seed_run_carries_the_environment_it_was_given() {
    let (_dir, root, log) = workspace();
    write(
        &root.join("modules/user/bin/seed/run.ts"),
        &format!(
            "await Bun.write({:?}, `${{process.env.APP_ENV}} ${{process.argv.slice(2).join(\" \")}}\\n`);\n",
            log.to_string_lossy()
        ),
    );

    let output = talos(&root, &["seed:run", "--env=staging", "--drop"]);

    assert!(output.status.success(), "{}", text(&output));
    let recorded = calls(&log);
    assert!(recorded.starts_with("staging"), "{recorded}");
    assert!(recorded.contains("--drop"), "{recorded}");
}

#[test]
fn a_workspace_with_no_module_carrying_the_script_says_so_rather_than_failing() {
    let dir = tempfile::tempdir().expect("create temp dir");
    write(
        &dir.path().join("package.json"),
        "{ \"name\": \"scratch\" }\n",
    );

    let output = talos(dir.path(), &["seed:run"]);

    assert!(output.status.success(), "{}", text(&output));
    assert!(
        text(&output).contains("No module found"),
        "{}",
        text(&output)
    );
}

#[test]
fn a_module_without_a_manifest_is_skipped() {
    let (_dir, root, _log) = workspace();
    fs::remove_file(root.join("modules/user/package.json")).expect("drop the manifest");

    let output = talos(&root, &["seed:run"]);

    assert!(
        text(&output).contains("No module found"),
        "{}",
        text(&output)
    );
}

#[test]
fn a_script_that_fails_ends_the_run_non_zero() {
    let (_dir, root, _log) = workspace();
    write(
        &root.join("modules/user/bin/seed/run.ts"),
        "console.error(\"the seed blew up\");\nprocess.exit(1);\n",
    );

    let output = talos(&root, &["seed:run"]);

    assert!(!output.status.success());
}

#[test]
fn a_failing_scripts_output_is_kept_for_logs() {
    let (_dir, root, _log) = workspace();
    write(
        &root.join("modules/user/bin/seed/run.ts"),
        "console.error(\"the seed blew up\");\nprocess.exit(1);\n",
    );

    let quiet = talos(&root, &["seed:run"]);
    let logged = talos(&root, &["seed:run", "--logs"]);

    assert!(
        !text(&quiet).contains("the seed blew up"),
        "the output is captured, not streamed: {}",
        text(&quiet)
    );
    assert!(
        text(&quiet).contains("--logs"),
        "a failure says where its output went: {}",
        text(&quiet)
    );
    assert!(
        text(&logged).contains("the seed blew up"),
        "--logs replays what the script printed: {}",
        text(&logged)
    );
}

// ---------------------------------------------------------------------------
// command:run
// ---------------------------------------------------------------------------

#[test]
fn a_command_is_run_by_the_module_that_declares_it() {
    let (_dir, root, log) = workspace();

    let output = talos(&root, &["command:run", "--id=sync:users"]);

    assert!(output.status.success(), "{}", text(&output));
    assert!(calls(&log).contains("sync:users"), "{}", calls(&log));
}

#[test]
fn extra_arguments_are_handed_to_the_command_untouched() {
    let (_dir, root, log) = workspace();

    // The trailing arguments have to come last, so `--cwd` is placed by hand.
    let cwd = format!("--cwd={}", root.display());
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args([
            "command:run",
            "--id=sync:users",
            &cwd,
            "--",
            "--force",
            "42",
        ])
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .output()
        .expect("the talos binary should run");

    let recorded = calls(&log);
    assert!(recorded.contains("--force"), "{recorded}");
    assert!(recorded.contains("42"), "{recorded}");
}

#[test]
fn a_command_no_module_declares_is_reported() {
    let (_dir, root, _log) = workspace();

    let output = talos(&root, &["command:run", "--id=nope:nope"]);

    assert!(!output.status.success());
    assert!(text(&output).contains("nope:nope"), "{}", text(&output));
}

#[test]
fn command_run_without_an_id_says_how_to_call_it() {
    let (_dir, root, _log) = workspace();

    let output = talos(&root, &["command:run"]);

    assert!(!output.status.success());
    assert!(
        text(&output).contains("command:run --id"),
        "{}",
        text(&output)
    );
}

#[test]
fn command_run_in_a_workspace_with_no_modules_directory_says_so() {
    let dir = tempfile::tempdir().expect("create temp dir");

    let output = talos(dir.path(), &["command:run", "--id=sync:users"]);

    assert!(text(&output).contains("sync:users"), "{}", text(&output));
}
