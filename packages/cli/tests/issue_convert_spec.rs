use std::fs;
use std::path::Path;

use clap::Parser;
use cli::commands::issue_convert::{ConvertOutcome, IssueConvertArgs, execute, output_path};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: IssueConvertArgs,
}

fn write(path: &Path, contents: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create parent dir");
    }
    fs::write(path, contents).expect("write file");
}

fn write_module(root: &Path, group: &str, name: &str, module_type: Option<&str>) {
    let dir = root.join(group).join(name);
    fs::create_dir_all(dir.join("issues")).expect("create issues dir");
    if let Some(module_type) = module_type {
        write(
            &dir.join(format!("{name}.yml")),
            &format!("type: \"{module_type}\" # descriptor\n"),
        );
    }
}

// --- Argument parsing ---------------------------------------------------------

#[test]
fn issue_convert_parses_all_flags() {
    let cli = TestCli::try_parse_from(["talos", "--destination", "spa,user", "--cwd", "./here"])
        .expect("valid arguments should parse");

    assert_eq!(
        cli.args.destination,
        vec!["spa".to_string(), "user".to_string()]
    );
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn issue_convert_parses_repeated_destination_flags() {
    let cli = TestCli::try_parse_from(["talos", "--destination", "spa", "--destination", "admin"])
        .expect("repeated destination flags should parse");

    assert_eq!(
        cli.args.destination,
        vec!["spa".to_string(), "admin".to_string()]
    );
}

#[test]
fn issue_convert_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.destination.is_empty());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn issue_convert_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// --- Output path placement rule ----------------------------------------------

#[test]
fn output_path_puts_ui_types_under_src_shared() {
    let module_dir = Path::new("/tmp/modules/spa");
    for module_type in ["spa", "storybook", "swagger", "admin"] {
        assert_eq!(
            output_path(module_dir, module_type),
            module_dir.join("src").join("shared").join("issues.json"),
            "{module_type} should land under src/shared"
        );
    }
}

#[test]
fn output_path_puts_other_types_under_src() {
    let module_dir = Path::new("/tmp/modules/user");
    for module_type in ["module", "api", "microservice", "design", "sdk", "unknown"] {
        assert_eq!(
            output_path(module_dir, module_type),
            module_dir.join("src").join("issues.json"),
            "{module_type} should land directly under src"
        );
    }
}

// --- Conversion behaviour -----------------------------------------------------

#[test]
fn execute_bundles_spa_issues_under_src_shared() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let cwd = tmp.path();
    write_module(cwd, "modules", "spa", Some("spa"));
    write(
        &cwd.join("modules/spa/issues/ABC-2.yml"),
        "id: \"ABC-2\"\ntitle: \"Second\"\nstate: \"Todo\"\nlabels: []\n",
    );
    write(
        &cwd.join("modules/spa/issues/ABC-1.yml"),
        "id: \"ABC-1\"\ntitle: \"First\"\nstate: \"Todo\"\nlabels:\n  - \"bug\"\n",
    );

    let outcome = execute(cwd, &["spa".to_string()]);
    assert_eq!(outcome, ConvertOutcome::Completed { failures: 0 });

    let json_path = cwd.join("modules/spa/src/shared/issues.json");
    assert!(
        json_path.exists(),
        "issues.json should be written to src/shared"
    );
    let value: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&json_path).unwrap()).expect("valid json array");
    let array = value.as_array().expect("issues.json is an array");
    assert_eq!(array.len(), 2);
    // Sorted by file name: ABC-1 before ABC-2.
    assert_eq!(array[0]["id"], "ABC-1");
    assert_eq!(array[1]["id"], "ABC-2");
    assert_eq!(array[0]["labels"][0], "bug");
}

#[test]
fn execute_bundles_plain_module_under_src() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let cwd = tmp.path();
    write_module(cwd, "modules", "user", Some("module"));
    write(
        &cwd.join("modules/user/issues/USR-1.yml"),
        "id: \"USR-1\"\ntitle: \"User issue\"\n",
    );

    let outcome = execute(cwd, &["user".to_string()]);
    assert_eq!(outcome, ConvertOutcome::Completed { failures: 0 });
    assert!(cwd.join("modules/user/src/issues.json").exists());
    assert!(!cwd.join("modules/user/src/shared/issues.json").exists());
}

#[test]
fn execute_falls_back_to_packages_when_module_missing() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let cwd = tmp.path();
    // Package without a type descriptor defaults to the plain src/ location.
    write_module(cwd, "packages", "sdk", None);
    write(
        &cwd.join("packages/sdk/issues/SDK-1.yml"),
        "id: \"SDK-1\"\ntitle: \"Sdk issue\"\n",
    );

    let outcome = execute(cwd, &["sdk".to_string()]);
    assert_eq!(outcome, ConvertOutcome::Completed { failures: 0 });
    assert!(cwd.join("packages/sdk/src/issues.json").exists());
}

#[test]
fn execute_without_destinations_discovers_every_issues_owner() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let cwd = tmp.path();
    write_module(cwd, "modules", "admin", Some("admin"));
    write(
        &cwd.join("modules/admin/issues/ADM-1.yml"),
        "id: \"ADM-1\"\ntitle: \"Admin\"\n",
    );
    write_module(cwd, "packages", "sdk", Some("sdk"));
    write(
        &cwd.join("packages/sdk/issues/SDK-1.yml"),
        "id: \"SDK-1\"\ntitle: \"Sdk\"\n",
    );

    let outcome = execute(cwd, &[]);
    assert_eq!(outcome, ConvertOutcome::Completed { failures: 0 });
    assert!(cwd.join("modules/admin/src/shared/issues.json").exists());
    assert!(cwd.join("packages/sdk/src/issues.json").exists());
}

#[test]
fn execute_reports_failure_for_unknown_destination() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let cwd = tmp.path();
    fs::create_dir_all(cwd.join("modules")).expect("create modules dir");

    let outcome = execute(cwd, &["ghost".to_string()]);
    assert_eq!(outcome, ConvertOutcome::Completed { failures: 1 });
}

#[test]
fn execute_returns_no_destinations_when_nothing_to_convert() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let cwd = tmp.path();

    assert_eq!(execute(cwd, &[]), ConvertOutcome::NoDestinations);
}

#[test]
fn execute_writes_empty_array_when_issues_dir_has_no_yaml() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let cwd = tmp.path();
    write_module(cwd, "modules", "user", Some("module"));

    let outcome = execute(cwd, &["user".to_string()]);
    assert_eq!(outcome, ConvertOutcome::Completed { failures: 0 });
    let contents = fs::read_to_string(cwd.join("modules/user/src/issues.json")).unwrap();
    assert_eq!(contents.trim(), "[]");
}
