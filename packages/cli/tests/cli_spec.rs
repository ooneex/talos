//! Drives the compiled `talos` binary the way a user does.
//!
//! The in-process specs call each command's `run` directly, which cannot reach
//! the parts that end the process — the `--strict` exits, the argument errors —
//! and never exercises the subcommand table that routes a name to a command.
//! Running the real binary does both.
//!
//! Every run is sandboxed: `--cwd` (or the child's working directory) points at
//! a scratch workspace, `HOME` at a scratch home whose skeleton cache is
//! pre-seeded, and stdin is closed so a command that would prompt gives up
//! instead of hanging.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("a parent")).expect("create parent");
    fs::write(path, content).expect("write file");
}

/// A scratch directory that removes itself with the test.
struct Scratch(PathBuf);

impl Scratch {
    fn new(tag: &str) -> Self {
        let path = std::env::temp_dir().join(format!(
            "talos-cli-{tag}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("create scratch dir");
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// A home directory whose skeleton cache is already populated, so nothing the
/// binary runs reaches for the network.
fn seed_home(home: &Path) {
    let skeleton = home.join(".talos/skeleton/modules");
    write(
        &skeleton.join("templates/module/module.txt"),
        "export const {{NAME}}Module = {};\n",
    );
    write(
        &skeleton.join("templates/module/package.txt"),
        "{\n  \"name\": \"@module/{{NAME}}\",\n  \"scripts\": { \"test\": \"bun test\" }\n}\n",
    );
    write(
        &skeleton.join("templates/module/tsconfig.txt"),
        "{ \"extends\": \"../../tsconfig.json\" }\n",
    );
    write(
        &skeleton.join("templates/module/yml.txt"),
        "type: \"module\"\n",
    );
    write(
        &skeleton.join("templates/module/test.txt"),
        "// {{NAME}}Module {{name}}\n",
    );
    write(
        &skeleton.join("templates/module/bunfig.txt"),
        "[test]\ncoverage = true\n",
    );
    write(
        &skeleton.join("templates/service.txt"),
        "export class {{NAME}}Service {}\n",
    );
    write(
        &skeleton.join("templates/service.test.txt"),
        "// {{NAME}}Service in {{MODULE}}\n",
    );
    write(
        &skeleton.join("templates/cache.txt"),
        "export class {{NAME}}Cache {}\n",
    );
    write(
        &skeleton.join("templates/cache.test.txt"),
        "// {{NAME}}Cache in {{MODULE}}\n",
    );
    write(
        &skeleton.join("templates/e2e.spec.txt"),
        "// {{NAME}} e2e\n",
    );
    write(
        &skeleton.join("templates/playwright.config.txt"),
        "export default { testDir: \"./e2e\" };\n",
    );
}

/// A workspace holding one backend module, enough for the checks to have
/// something to read.
fn seed_workspace(root: &Path) {
    write(
        &root.join("package.json"),
        "{\n  \"name\": \"scratch\",\n  \"private\": true,\n  \"workspaces\": [\"modules/*\"]\n}\n",
    );
    write(
        &root.join("tsconfig.json"),
        "{ \"compilerOptions\": { \"strict\": true, \"paths\": {} } }\n",
    );
    write(&root.join(".gitignore"), "node_modules\ndist\n");
    write(&root.join("bun.lock"), "{}\n");
    write(&root.join("README.md"), "# Scratch\n");

    let user = root.join("modules/user");
    write(&user.join("user.yml"), "type: \"module\"\n");
    write(
        &user.join("package.json"),
        "{\n  \"name\": \"@module/user\",\n  \"scripts\": { \"test\": \"bun test\" }\n}\n",
    );
    write(
        &user.join("src/UserModule.ts"),
        "export const UserModule = { controllers: [], entities: [] };\n",
    );
    write(
        &user.join("tests/UserModule.spec.ts"),
        "// UserModule user\n",
    );
}

/// The compiled binary, run with a closed stdin and a sandboxed environment.
fn talos(cwd: &Path, home: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .current_dir(cwd)
        .env("HOME", home)
        .env("NO_COLOR", "1")
        .env_remove("TALOS_TEMPLATES_DIR")
        .stdin(Stdio::null())
        .output()
        .expect("the talos binary should run")
}

fn stdout(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout).to_string()
}

/// A scratch home and workspace wired together.
fn sandbox(tag: &str) -> (Scratch, Scratch) {
    let home = Scratch::new(&format!("{tag}-home"));
    let root = Scratch::new(&format!("{tag}-root"));
    seed_home(home.path());
    seed_workspace(root.path());
    (home, root)
}

// ---------------------------------------------------------------------------
// The subcommand table
// ---------------------------------------------------------------------------

#[test]
fn the_binary_reports_its_version() {
    let (home, root) = sandbox("version");

    let output = talos(root.path(), home.path(), &["--version"]);

    assert!(output.status.success());
    assert!(stdout(&output).contains("talos"));
}

#[test]
fn an_unknown_subcommand_is_an_error_rather_than_a_silent_no_op() {
    let (home, root) = sandbox("unknown");

    let output = talos(root.path(), home.path(), &["definitely:not:a:command"]);

    assert!(!output.status.success());
}

#[test]
fn running_with_no_subcommand_does_nothing_and_succeeds() {
    let (home, root) = sandbox("bare");

    let output = talos(root.path(), home.path(), &[]);

    assert!(output.status.success(), "{:?}", output);
}

#[test]
fn the_version_command_prints_the_crate_version() {
    let (home, root) = sandbox("version-cmd");

    let output = talos(root.path(), home.path(), &["version"]);

    assert!(output.status.success());
    assert!(!stdout(&output).trim().is_empty());
}

#[test]
fn the_help_command_lists_the_commands_it_offers() {
    let (home, root) = sandbox("help");

    let output = talos(root.path(), home.path(), &["help"]);

    assert!(output.status.success(), "{:?}", output);
    let text = stdout(&output);
    assert!(text.contains("project:check"), "{text}");
    assert!(text.contains("module:create"), "{text}");
}

#[test]
fn each_shell_gets_a_completion_script_naming_the_binary() {
    let (home, root) = sandbox("completions");

    for command in ["completion:bash", "completion:fish", "completion:zsh"] {
        let output = talos(root.path(), home.path(), &[command]);
        assert!(output.status.success(), "{command}: {output:?}");
        assert!(
            stdout(&output).contains("talos"),
            "{command} produced no script"
        );
    }
}

// ---------------------------------------------------------------------------
// Scaffolding
// ---------------------------------------------------------------------------

#[test]
fn module_create_lands_a_module_the_other_commands_can_see() {
    let (home, root) = sandbox("module-create");

    let output = talos(
        root.path(),
        home.path(),
        &["module:create", "--name=billing", "--destination=app"],
    );

    assert!(output.status.success(), "{output:?}");
    let module = root.path().join("modules/billing");
    assert!(module.join("package.json").is_file());
    assert!(module.join("billing.yml").is_file());
    assert!(module.join("src/BillingModule.ts").is_file());
}

#[test]
fn service_create_writes_into_the_module_it_is_pointed_at() {
    let (home, root) = sandbox("service-create");

    let output = talos(
        root.path(),
        home.path(),
        &["service:create", "--name=invoice", "--module=user"],
    );

    assert!(output.status.success(), "{output:?}");
    assert!(
        root.path()
            .join("modules/user/src/services/InvoiceService.ts")
            .is_file()
    );
}

#[test]
fn module_remove_takes_the_module_back_out() {
    let (home, root) = sandbox("module-remove");
    talos(
        root.path(),
        home.path(),
        &["module:create", "--name=billing", "--destination=app"],
    );
    assert!(root.path().join("modules/billing").exists());

    let output = talos(
        root.path(),
        home.path(),
        &["module:remove", "--name=billing", "--silent"],
    );

    assert!(output.status.success(), "{output:?}");
    assert!(!root.path().join("modules/billing").exists());
}

#[test]
fn the_app_and_shared_modules_cannot_be_removed() {
    let (home, root) = sandbox("module-remove-guard");

    for name in ["app", "shared"] {
        let output = talos(
            root.path(),
            home.path(),
            &["module:remove", &format!("--name={name}")],
        );
        assert!(output.status.success(), "{name}: {output:?}");
    }
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

#[test]
fn project_check_prints_a_json_report_for_the_checks_it_was_asked_for() {
    let (home, root) = sandbox("project-check-json");

    let output = talos(
        root.path(),
        home.path(),
        &[
            "project:check",
            "--only=folders,git,docs",
            "--json",
            "--no-cache",
        ],
    );

    let payload: serde_json::Value =
        serde_json::from_str(&stdout(&output)).expect("the report is valid JSON");
    assert_eq!(
        payload["checks"].as_array().map(Vec::len),
        Some(3),
        "one entry per requested check"
    );
}

#[test]
fn project_check_takes_its_working_directory_from_the_flag() {
    let (home, root) = sandbox("project-check-cwd");
    let elsewhere = Scratch::new("project-check-elsewhere");

    let output = talos(
        elsewhere.path(),
        home.path(),
        &[
            "project:check",
            &format!("--cwd={}", root.path().display()),
            "--only=folders",
            "--json",
            "--no-cache",
        ],
    );

    let payload: serde_json::Value =
        serde_json::from_str(&stdout(&output)).expect("the report is valid JSON");
    assert_eq!(
        payload["root"].as_str().map(Path::new),
        Some(root.path()),
        "the report names the directory it checked"
    );
}

#[test]
fn project_check_rejects_a_check_it_does_not_know() {
    let (home, root) = sandbox("project-check-unknown");

    let output = talos(
        root.path(),
        home.path(),
        &["project:check", "--only=not-a-check"],
    );

    assert!(!output.status.success(), "an unknown check ends the run");
}

#[test]
fn coverage_says_so_when_no_module_carries_a_suite() {
    let home = Scratch::new("coverage-home");
    let root = Scratch::new("coverage-root");
    seed_home(home.path());
    write(
        &root.path().join("package.json"),
        "{ \"name\": \"empty\" }\n",
    );

    let output = talos(root.path(), home.path(), &["coverage", "--no-cache"]);

    // Nothing measured is a failure, not a warning: a coverage run that found
    // no suite to measure cannot vouch for the workspace it was pointed at.
    assert!(!output.status.success(), "{output:?}");
    let text = format!(
        "{}{}",
        stdout(&output),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(text.contains("No module"), "{text}");
}

#[test]
fn issue_check_passes_over_a_workspace_holding_no_issue() {
    let (home, root) = sandbox("issue-check");

    let output = talos(root.path(), home.path(), &["issue:check"]);

    assert!(
        output.status.success(),
        "nothing to check is not a failure: {output:?}"
    );
}

#[test]
fn issue_check_reports_a_malformed_issue() {
    let (home, root) = sandbox("issue-check-bad");
    write(
        &root.path().join("modules/user/issues/OON-123456.yml"),
        "title: \"No id, no state\"\n",
    );

    let output = talos(root.path(), home.path(), &["issue:check"]);

    let text = format!(
        "{}{}",
        stdout(&output),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        text.contains("OON-123456"),
        "the broken issue is named: {text}"
    );
}

#[test]
fn issue_convert_bundles_the_modules_issues_into_one_file() {
    let (home, root) = sandbox("issue-convert");
    write(
        &root.path().join("modules/user/issues/OON-123456.yml"),
        "id: \"OON-123456\"\ntitle: \"Add pagination\"\nstate: \"Todo\"\npriority: \"Medium\"\nmodule: \"user\"\ndescription: \"Page the list\"\n",
    );

    let output = talos(
        root.path(),
        home.path(),
        &["issue:convert", "--destination=user"],
    );

    assert!(output.status.success(), "{output:?}");
    let bundle = root.path().join("modules/user/src/issues.json");
    assert!(bundle.is_file(), "the bundle is written next to the source");
    let payload: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&bundle).expect("read bundle"))
            .expect("valid JSON");
    assert!(payload.to_string().contains("OON-123456"), "{}", payload);
}

#[test]
fn workspace_run_over_a_workspace_with_no_matching_script_succeeds() {
    let (home, root) = sandbox("workspace-run");

    let output = talos(
        root.path(),
        home.path(),
        &[
            "workspace:run",
            "--commands=definitely-not-a-script",
            "--logs",
            "--no-cache",
        ],
    );

    assert!(output.status.success(), "{output:?}");
}
