//! Runs `coverage` over a scratch workspace of real bun suites.
//!
//! The unit spec covers the parsers on canned output; this one drives the whole
//! command — discovery, the runners, the cache, the report and `--issues` — by
//! putting suites bun can actually run on disk. They are a handful of lines
//! each, so the whole file runs in well under a second.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

use cli::commands::coverage::{RunStatus, audit};

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("a parent")).expect("create parent");
    fs::write(path, content).expect("write file");
}

/// A bun module: a manifest, a source file, and the suite over it.
fn bun_module(root: &Path, name: &str, source: &str, spec: &str) {
    let dir = root.join("modules").join(name);
    write(&dir.join(format!("{name}.yml")), "type: \"module\"\n");
    write(
        &dir.join("package.json"),
        &format!("{{ \"name\": \"@module/{name}\", \"scripts\": {{ \"test\": \"bun test\" }} }}\n"),
    );
    write(&dir.join("src/index.ts"), source);
    write(&dir.join("tests/index.spec.ts"), spec);
}

/// One module of each outcome the report can draw: fully covered, thinly
/// covered, failing, measuring nothing, and carrying no suite at all.
fn workspace() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path().to_path_buf();
    write(&root.join("package.json"), "{ \"name\": \"scratch\" }\n");

    bun_module(
        &root,
        "covered",
        "export const add = (a: number, b: number): number => a + b;\n",
        "import { expect, test } from \"bun:test\";\nimport { add } from \"../src/index\";\n\ntest(\"adds\", () => {\n  expect(add(1, 2)).toBe(3);\n});\n",
    );

    bun_module(
        &root,
        "thin",
        "export const add = (a: number, b: number): number => a + b;\n\nexport const sub = (a: number, b: number): number => a - b;\n\nexport const mul = (a: number, b: number): number => a * b;\n\nexport const div = (a: number, b: number): number => {\n  if (b === 0) {\n    throw new Error(\"nope\");\n  }\n  return a / b;\n};\n",
        "import { expect, test } from \"bun:test\";\nimport { add } from \"../src/index\";\n\ntest(\"adds\", () => {\n  expect(add(1, 2)).toBe(3);\n});\n",
    );

    bun_module(
        &root,
        "broken",
        "export const add = (a: number, b: number): number => a + b;\n",
        "import { expect, test } from \"bun:test\";\nimport { add } from \"../src/index\";\n\ntest(\"adds\", () => {\n  expect(add(1, 2)).toBe(4);\n});\n",
    );

    // A module with a manifest but no tests/ directory carries nothing to run.
    let bare = root.join("modules/bare");
    write(&bare.join("bare.yml"), "type: \"module\"\n");
    write(
        &bare.join("package.json"),
        "{ \"name\": \"@module/bare\" }\n",
    );
    write(
        &bare.join("src/index.ts"),
        "export const noop = (): void => {};\n",
    );

    (dir, root)
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

// ---------------------------------------------------------------------------
// The audit
// ---------------------------------------------------------------------------

#[test]
fn the_audit_measures_every_module_that_carries_a_suite() {
    let (_dir, root) = workspace();

    let report =
        audit(&root, None, None, Some(90.0), Some(2), true, true).expect("modules were found");

    let by_name = |name: &str| {
        report
            .modules
            .iter()
            .find(|module| module.name == name)
            .unwrap_or_else(|| panic!("{name} is missing from the report"))
    };

    assert_eq!(by_name("covered").status, RunStatus::Passed);
    assert_eq!(by_name("covered").passed, 1);
    assert!(by_name("covered").lines >= 90.0, "{:?}", by_name("covered"));

    assert_eq!(by_name("thin").status, RunStatus::Passed);
    assert!(
        by_name("thin").lines < 90.0,
        "one test over four functions leaves a gap: {:?}",
        by_name("thin")
    );

    assert_eq!(by_name("broken").status, RunStatus::Failed);
    assert_eq!(by_name("broken").failed, 1);
}

#[test]
fn a_module_with_no_suite_is_skipped_with_the_reason_it_was_skipped_for() {
    let (_dir, root) = workspace();

    let report = audit(&root, None, None, None, None, true, true).expect("modules were found");

    let bare = report
        .modules
        .iter()
        .find(|module| module.name == "bare")
        .expect("bare is reported");
    assert!(
        matches!(&bare.status, RunStatus::Skipped(reason) if reason.contains("test")),
        "{:?}",
        bare.status
    );
}

#[test]
fn the_audit_reports_the_files_that_put_a_module_under_the_threshold() {
    let (_dir, root) = workspace();

    let report =
        audit(&root, Some("thin"), None, Some(90.0), None, true, true).expect("thin was found");

    assert_eq!(report.modules.len(), 1);
    let low = report.modules[0].low_files(90.0);
    assert!(
        low.iter().any(|file| file.path.contains("index.ts")),
        "the one source file is named: {low:?}"
    );
}

#[test]
fn restricting_the_audit_to_a_module_leaves_the_others_unmeasured() {
    let (_dir, root) = workspace();

    let report =
        audit(&root, Some("covered"), None, None, None, true, true).expect("covered was found");

    assert_eq!(report.modules.len(), 1);
    assert_eq!(report.modules[0].name, "covered");
}

#[test]
fn a_workspace_with_no_member_at_all_has_nothing_to_audit() {
    let dir = tempfile::tempdir().expect("create temp dir");

    assert!(audit(dir.path(), None, None, None, None, true, true).is_err());
}

#[test]
fn the_audit_fails_the_run_when_a_suite_is_red_whatever_the_threshold() {
    let (_dir, root) = workspace();

    let report =
        audit(&root, Some("broken"), None, Some(0.0), None, true, true).expect("broken was found");

    assert!(report.is_failure(false), "a red suite is always a failure");
    assert!(report.is_failure(true));
}

#[test]
fn a_thin_module_only_fails_the_run_under_strict() {
    let (_dir, root) = workspace();

    let report =
        audit(&root, Some("thin"), None, Some(90.0), None, true, true).expect("thin was found");

    assert!(!report.is_failure(false), "lenient is a warning");
    assert!(report.is_failure(true), "strict is a failure");
}

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

#[test]
fn the_report_draws_a_row_per_module_and_names_the_least_covered_files() {
    let (_dir, root) = workspace();

    let output = talos(&root, &["coverage", "--no-cache", "--threshold=90"]);

    let report = text(&output);
    // Rows are named for what was run — `name:coverage`, the way `lint` names
    // its own — rather than for the module's `group/name` label.
    assert!(report.contains("covered:coverage"), "{report}");
    assert!(report.contains("thin:coverage"), "{report}");
    assert!(report.contains("broken:coverage"), "{report}");
    assert!(report.contains("Coverage report"), "{report}");
    assert!(
        report.contains("src/index.ts"),
        "the thin module's file is named: {report}"
    );
    assert!(
        !output.status.success(),
        "a red suite ends the run non-zero"
    );
}

#[test]
fn logs_prints_the_output_of_the_suite_that_failed() {
    let (_dir, root) = workspace();

    let quiet = text(&talos(
        &root,
        &["coverage", "--no-cache", "--modules=broken"],
    ));
    let loud = text(&talos(
        &root,
        &["coverage", "--no-cache", "--logs", "--modules=broken"],
    ));

    assert!(loud.len() > quiet.len(), "--logs adds the suite output");
    assert!(loud.contains("adds"), "the failing test is named: {loud}");
}

#[test]
fn a_workspace_that_clears_the_threshold_exits_zero() {
    let (_dir, root) = workspace();

    let output = talos(
        &root,
        &["coverage", "--no-cache", "--modules=covered", "--strict"],
    );

    assert!(output.status.success(), "{}", text(&output));
}

#[test]
fn strict_turns_a_thin_module_into_a_failing_run() {
    let (_dir, root) = workspace();

    let lenient = talos(&root, &["coverage", "--no-cache", "--modules=thin"]);
    let strict = talos(
        &root,
        &["coverage", "--no-cache", "--modules=thin", "--strict"],
    );

    assert!(lenient.status.success(), "{}", text(&lenient));
    assert!(!strict.status.success(), "{}", text(&strict));
}

#[test]
fn the_second_run_is_served_from_the_cache() {
    let (_dir, root) = workspace();

    talos(&root, &["coverage", "--modules=covered"]);
    let warm = text(&talos(&root, &["coverage", "--modules=covered"]));

    assert!(warm.contains("cached"), "{warm}");
}

#[test]
fn editing_a_source_file_retires_the_cached_measurement() {
    let (_dir, root) = workspace();
    talos(&root, &["coverage", "--modules=covered"]);
    assert!(text(&talos(&root, &["coverage", "--modules=covered"])).contains("cached"));

    write(
        &root.join("modules/covered/src/index.ts"),
        "export const add = (a: number, b: number): number => a + b;\n\nexport const sub = (a: number, b: number): number => a - b;\n",
    );

    let after = text(&talos(&root, &["coverage", "--modules=covered"]));
    assert!(!after.contains("cached"), "{after}");
}

#[test]
fn a_workspace_with_no_suite_says_so_instead_of_drawing_an_empty_table() {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path();
    write(&root.join("package.json"), "{ \"name\": \"scratch\" }\n");
    let bare = root.join("modules/bare");
    write(&bare.join("bare.yml"), "type: \"module\"\n");
    write(
        &bare.join("package.json"),
        "{ \"name\": \"@module/bare\" }\n",
    );

    let output = talos(root, &["coverage", "--no-cache"]);

    let report = text(&output);
    assert!(report.contains("No suite ran"), "{report}");
    assert!(output.status.success());
}

// ---------------------------------------------------------------------------
// --issues
// ---------------------------------------------------------------------------

#[test]
fn issues_writes_one_yaml_per_module_that_misses_the_threshold() {
    let (_dir, root) = workspace();

    let output = talos(
        &root,
        &["coverage", "--no-cache", "--issues", "--threshold=90"],
    );

    assert!(output.status.success(), "{}", text(&output));

    let broken_issue = issue_body(&root.join("modules/broken/issues"));
    assert!(
        broken_issue.contains("Fix 1 failing test in broken"),
        "{broken_issue}"
    );
    assert!(broken_issue.contains("Urgent"), "{broken_issue}");
    assert!(broken_issue.contains("Bug"), "{broken_issue}");

    let thin_issue = issue_body(&root.join("modules/thin/issues"));
    assert!(
        thin_issue.contains("Raise thin test coverage to 90%"),
        "{thin_issue}"
    );
    assert!(thin_issue.contains("Testing"), "{thin_issue}");
    assert!(
        thin_issue.contains("talos coverage --modules=thin"),
        "the issue says how to reproduce it: {thin_issue}"
    );

    assert!(
        !root.join("modules/covered/issues").exists(),
        "a module that clears the threshold gets no issue"
    );
}

#[test]
fn issues_says_so_when_every_module_clears_the_threshold() {
    let (_dir, root) = workspace();

    let output = talos(
        &root,
        &[
            "coverage",
            "--no-cache",
            "--issues",
            "--modules=covered",
            "--threshold=50",
        ],
    );

    assert!(
        text(&output).contains("no issues created"),
        "{}",
        text(&output)
    );
}

/// The single YAML file written into an `issues/` directory.
fn issue_body(dir: &Path) -> String {
    let entry = fs::read_dir(dir)
        .unwrap_or_else(|_| panic!("{} should exist", dir.display()))
        .flatten()
        .next()
        .expect("one issue was written");
    fs::read_to_string(entry.path()).expect("read the issue")
}
