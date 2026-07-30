//! `project:check` against Rust modules.
//!
//! Every check that reads sources has a TypeScript path and a Rust path; these
//! tests pin the Rust one so a crate in the workspace is validated instead of
//! silently skipped.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use cli::commands::project_check::conventions::inspect_rust;
use cli::commands::project_check::dependencies::{
    cargo_loose_requirements, compare_crates, read_cargo_entry, used_crates,
};
use cli::commands::project_check::modules::{discover_modules, parse_cargo_manifest};
use cli::commands::project_check::tests::{missing_specs, rust_needs_test};
use cli::commands::project_check::{
    CheckStatus, ProjectCheckArgs, conventions, dependencies, scan_source, structure, tests,
};
use cli::utils::discover_targets;

fn root() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let path = dir.path().to_path_buf();
    (dir, path)
}

fn write(path: &Path, content: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create parent directory");
    }
    fs::write(path, content).expect("write file");
}

fn args() -> ProjectCheckArgs {
    ProjectCheckArgs::default()
}

/// The messages of one severity, with the severity prefix removed.
fn detailed(outcome: &cli::commands::project_check::CheckOutcome, level: &str) -> Vec<String> {
    outcome
        .details
        .iter()
        .filter(|detail| detail.starts_with(level))
        .map(|detail| detail.trim_start_matches(level).trim().to_string())
        .collect()
}

/// A minimal Rust crate under `packages/<name>`, with the root manifest the
/// structure check expects to find.
fn crate_at(root: &Path, name: &str, manifest: &str) -> PathBuf {
    write(
        &root.join("package.json"),
        "{\n  \"name\": \"fixture\",\n  \"workspaces\": [\"packages/*\"]\n}\n",
    );
    let dir = root.join("packages").join(name);
    write(&dir.join("Cargo.toml"), manifest);
    dir
}

#[test]
fn parses_a_cargo_manifest() {
    let manifest = parse_cargo_manifest(
        r#"
[package]
name = "talos-cli"
version = "0.1.0"

[dependencies]
regex = "1.11"
serde = { version = "1", features = ["derive"] }
shared = { path = "../shared" }

[dev-dependencies]
tempfile = "3"
"#,
    )
    .expect("the manifest parses");

    assert_eq!(manifest.name.as_deref(), Some("talos-cli"));
    assert_eq!(
        manifest.dependencies.get("regex").map(String::as_str),
        Some("1.11")
    );
    assert_eq!(
        manifest.dependencies.get("serde").map(String::as_str),
        Some("1")
    );
    // A path dependency carries no requirement of its own.
    assert_eq!(
        manifest.dependencies.get("shared").map(String::as_str),
        Some("")
    );
    assert_eq!(
        manifest.dependencies.get("tempfile").map(String::as_str),
        Some("3")
    );
    assert!(!manifest.is_workspace);
}

#[test]
fn reads_workspace_members() {
    let manifest = parse_cargo_manifest(
        r#"
[workspace]
members = ["packages/cli", "packages/core"]
"#,
    )
    .expect("the manifest parses");

    assert!(manifest.name.is_none());
    assert!(manifest.is_workspace);
    assert_eq!(
        manifest.workspace_members,
        vec!["packages/cli", "packages/core"]
    );
}

#[test]
fn rejects_a_broken_manifest() {
    assert!(parse_cargo_manifest("[package\nname = ").is_none());
}

#[test]
fn discovers_a_crate_without_a_package_json() {
    let (_guard, path) = root();
    crate_at(&path, "cli", "[package]\nname = \"cli\"\n");

    let modules = discover_modules(&path);
    let module = modules
        .iter()
        .find(|module| module.name == "cli")
        .expect("the crate is discovered");
    assert!(module.is_rust());
    assert!(module.is_rust_only());
}

#[test]
fn structure_accepts_a_crate_with_inline_tests() {
    let (_guard, path) = root();
    let dir = crate_at(&path, "cli", "[package]\nname = \"cli\"\n");
    write(
        &dir.join("src/main.rs"),
        "fn main() {}\n\n#[cfg(test)]\nmod tests {\n    #[test]\n    fn works() {}\n}\n",
    );

    let outcome = structure::run(&args(), &path);
    assert!(
        detailed(&outcome, "error").is_empty(),
        "a crate testing inline is complete: {:?}",
        outcome.details
    );
}

#[test]
fn structure_reports_a_crate_without_any_test() {
    let (_guard, path) = root();
    let dir = crate_at(&path, "cli", "[package]\nname = \"cli\"\n");
    write(&dir.join("src/main.rs"), "fn main() {}\n");

    let outcome = structure::run(&args(), &path);
    assert!(
        detailed(&outcome, "warn")
            .iter()
            .any(|warning| warning.contains("tests/")),
        "the missing tests are reported: {:?}",
        outcome.details
    );
}

#[test]
fn structure_reports_a_manifest_without_a_name() {
    let (_guard, path) = root();
    let dir = crate_at(&path, "cli", "[dependencies]\nregex = \"1\"\n");
    write(&dir.join("src/lib.rs"), "pub fn run() {}\n");
    write(&dir.join("tests/run_spec.rs"), "#[test]\nfn works() {}\n");

    let outcome = structure::run(&args(), &path);
    assert!(
        detailed(&outcome, "error")
            .iter()
            .any(|error| error.contains("Cargo.toml") && error.contains("name")),
        "the nameless manifest is reported: {:?}",
        outcome.details
    );
}

#[test]
fn workspace_members_cover_a_glob_and_a_literal_path() {
    let members = vec!["packages/*".to_string(), "tools/cli".to_string()];
    assert!(structure::members_cover(&members, "packages/cli"));
    assert!(structure::members_cover(&members, "tools/cli"));
    assert!(!structure::members_cover(&members, "modules/user"));
    // A glob covers one level only.
    assert!(!structure::members_cover(&members, "packages/group/cli"));
}

#[test]
fn structure_reports_a_crate_outside_the_workspace_members() {
    let (_guard, path) = root();
    write(
        &path.join("Cargo.toml"),
        "[workspace]\nmembers = [\"packages/core\"]\n",
    );
    let dir = crate_at(&path, "cli", "[package]\nname = \"cli\"\n");
    write(&dir.join("src/main.rs"), "fn main() {}\n");
    write(&dir.join("tests/main_spec.rs"), "#[test]\nfn works() {}\n");

    let outcome = structure::run(&args(), &path);
    assert!(
        detailed(&outcome, "error")
            .iter()
            .any(|error| error.contains("[workspace] members") && error.contains("packages/cli")),
        "{:?}",
        outcome.details
    );
}

#[test]
fn a_cargo_only_workspace_needs_no_root_package_json() {
    let (_guard, path) = root();
    write(
        &path.join("Cargo.toml"),
        "[workspace]\nmembers = [\"packages/*\"]\n",
    );
    let dir = path.join("packages/cli");
    write(&dir.join("Cargo.toml"), "[package]\nname = \"cli\"\n");
    write(&dir.join("src/main.rs"), "fn main() {}\n");
    write(&dir.join("tests/main_spec.rs"), "#[test]\nfn works() {}\n");

    let outcome = structure::run(&args(), &path);
    assert!(
        detailed(&outcome, "error").is_empty(),
        "Cargo alone is enough: {:?}",
        outcome.details
    );
}

#[test]
fn a_rust_file_with_inline_tests_needs_no_spec() {
    assert!(rust_needs_test("parser", "pub fn parse() {}\n"));
    assert!(!rust_needs_test(
        "parser",
        "pub fn parse() {}\n#[cfg(test)]\nmod tests {}\n"
    ));
    // Wiring files hold no behaviour.
    assert!(!rust_needs_test("mod", "pub fn parse() {}\n"));
    assert!(!rust_needs_test("main", "pub fn parse() {}\n"));
    // A file of private helpers is exercised through its caller.
    assert!(!rust_needs_test("parser", "fn parse() {}\n"));
}

#[test]
fn any_spec_covers_a_rust_crate() {
    let (_guard, path) = root();
    let dir = crate_at(&path, "cli", "[package]\nname = \"cli\"\n");
    write(&dir.join("src/parser.rs"), "pub fn parse() {}\n");
    write(&dir.join("src/writer.rs"), "pub fn write() {}\n");
    write(&dir.join("tests/other_spec.rs"), "#[test]\nfn works() {}\n");

    let modules = discover_modules(&path);
    let module = modules
        .iter()
        .find(|module| module.name == "cli")
        .expect("the crate is discovered");
    assert!(
        missing_specs(module).is_empty(),
        "one spec covers the crate: {:?}",
        missing_specs(module)
    );
}

#[test]
fn a_rust_crate_testing_nothing_inline_needs_a_spec() {
    let (_guard, path) = root();
    let dir = crate_at(&path, "cli", "[package]\nname = \"cli\"\n");
    write(&dir.join("src/parser.rs"), "pub fn parse() {}\n");
    fs::create_dir_all(dir.join("tests")).expect("create tests");

    let outcome = tests::run(&args(), &path);
    assert_eq!(outcome.status, CheckStatus::Warned, "{:?}", outcome.details);
    assert!(
        detailed(&outcome, "warn")
            .iter()
            .any(|warning| warning.contains("tests/ exists but holds no spec file")),
        "{:?}",
        outcome.details
    );
}

#[test]
fn conventions_flag_a_panicking_call() {
    let findings = inspect_rust("fn run() {\n    let value = fetch().unwrap();\n}\n");
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "conventions.rust-panic");
    assert_eq!(findings[0].line, 2);
    assert!(!findings[0].blocking);
}

#[test]
fn conventions_allow_a_poisoned_lock_unwrap() {
    let findings = inspect_rust("fn run() {\n    let mut state = self.state.lock().unwrap();\n}\n");
    assert!(findings.is_empty(), "{findings:?}");
}

#[test]
fn conventions_flag_a_todo_macro() {
    let findings = inspect_rust("fn run() {\n    todo!();\n}\n");
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "conventions.rust-panic");
}

#[test]
fn conventions_ignore_the_test_module() {
    let findings = inspect_rust(
        "pub fn run() {}\n\n#[cfg(test)]\nmod tests {\n    #[test]\n    fn works() {\n        run().unwrap();\n    }\n}\n",
    );
    assert!(findings.is_empty(), "a test may unwrap: {findings:?}");
}

#[test]
fn conventions_ignore_a_rule_described_in_a_string() {
    let findings =
        inspect_rust("fn message() -> &'static str {\n    \"call .unwrap() sparingly\"\n}\n");
    assert!(
        findings.is_empty(),
        "string contents are data: {findings:?}"
    );
}

#[test]
fn conventions_block_unsafe_code() {
    let findings = inspect_rust("fn run() {\n    unsafe {\n        raw();\n    }\n}\n");
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "conventions.rust-unsafe");
    assert!(findings[0].blocking);
}

#[test]
fn conventions_flag_a_silenced_lint_but_not_a_clippy_pragma() {
    let silenced = inspect_rust("#[allow(dead_code)]\nfn run() {}\n");
    assert_eq!(silenced.len(), 1);
    assert_eq!(silenced[0].rule, "conventions.rust-suppressed-lint");

    let pragma = inspect_rust("#[allow(clippy::too_many_arguments)]\nfn run() {}\n");
    assert!(pragma.is_empty(), "{pragma:?}");
}

#[test]
fn conventions_check_inspects_rust_sources() {
    let (_guard, path) = root();
    let dir = crate_at(&path, "cli", "[package]\nname = \"cli\"\n");
    write(
        &dir.join("src/parser.rs"),
        "pub fn parse() {\n    read().unwrap();\n}\n",
    );

    let outcome = conventions::run(&args(), &path);
    assert_eq!(outcome.status, CheckStatus::Warned, "{:?}", outcome.details);
    assert!(
        detailed(&outcome, "warn")
            .iter()
            .any(|warning| warning.contains("parser.rs:2")),
        "{:?}",
        outcome.details
    );
}

#[test]
fn collects_the_crates_a_file_uses() {
    let used = used_crates(
        "use std::fs;\nuse crate::utils::run;\nuse regex::Regex;\npub use serde_json::Value;\n",
    );
    assert!(used.contains("regex"));
    assert!(used.contains("serde_json"));
    assert!(
        !used.contains("std"),
        "the standard library is not a dependency"
    );
    assert!(
        !used.contains("crate"),
        "a self reference is not a dependency"
    );
}

#[test]
fn compares_declared_and_used_crates() {
    let used: BTreeSet<String> = ["regex", "serde_json", "commands"]
        .into_iter()
        .map(str::to_string)
        .collect();
    let declared: BTreeMap<String, String> = [("regex", "1"), ("num_cpus", "1")]
        .into_iter()
        .map(|(name, version)| (name.to_string(), version.to_string()))
        .collect();
    let local: BTreeSet<String> = ["commands"].into_iter().map(str::to_string).collect();

    let (undeclared, unused) = compare_crates(&used, &[], &declared, &local);
    assert_eq!(undeclared, vec!["serde_json".to_string()]);
    assert_eq!(unused, vec!["num_cpus".to_string()]);
}

#[test]
fn a_crate_mentioned_anywhere_counts_as_used() {
    let used = BTreeSet::new();
    let declared: BTreeMap<String, String> = [("num_cpus", "1")]
        .into_iter()
        .map(|(name, version)| (name.to_string(), version.to_string()))
        .collect();
    let corpus = vec!["let threads = num_cpus::get();".to_string()];

    let (_, unused) = compare_crates(&used, &corpus, &declared, &BTreeSet::new());
    assert!(unused.is_empty(), "{unused:?}");
}

#[test]
fn a_dash_and_an_underscore_name_the_same_crate() {
    let used: BTreeSet<String> = ["serde_json"].into_iter().map(str::to_string).collect();
    let declared: BTreeMap<String, String> = [("serde-json", "1")]
        .into_iter()
        .map(|(name, version)| (name.to_string(), version.to_string()))
        .collect();

    let (undeclared, unused) = compare_crates(&used, &[], &declared, &BTreeSet::new());
    assert!(undeclared.is_empty(), "{undeclared:?}");
    assert!(unused.is_empty(), "{unused:?}");
}

#[test]
fn flags_a_wildcard_requirement_but_not_a_path_dependency() {
    let manifest = parse_cargo_manifest(
        "[package]\nname = \"cli\"\n\n[dependencies]\nregex = \"*\"\nshared = { path = \"../shared\" }\n",
    )
    .expect("the manifest parses");
    let entry = read_cargo_entry("packages/cli", &manifest);

    let findings = cargo_loose_requirements(&[entry]);
    assert_eq!(findings.len(), 1);
    assert!(findings[0].contains("regex"));
}

#[test]
fn dependencies_check_reads_cargo_manifests() {
    let (_guard, path) = root();
    let dir = crate_at(
        &path,
        "cli",
        "[package]\nname = \"cli\"\n\n[dependencies]\nregex = \"1\"\nnum_cpus = \"1\"\n",
    );
    write(
        &dir.join("src/main.rs"),
        "use regex::Regex;\n\nfn main() {}\n",
    );

    let outcome = dependencies::run(&args(), &path);
    assert_eq!(outcome.status, CheckStatus::Warned, "{:?}", outcome.details);
    assert!(
        detailed(&outcome, "warn")
            .iter()
            .any(|warning| warning.contains("num_cpus") && warning.contains("never uses it")),
        "{:?}",
        outcome.details
    );
}

#[test]
fn the_workspace_runs_cargo_for_a_crate() {
    let (_guard, path) = root();
    let dir = crate_at(&path, "cli", "[package]\nname = \"cli\"\n");
    write(&dir.join("src/main.rs"), "fn main() {}\n");

    let targets = discover_targets(&path);
    let target = targets
        .iter()
        .find(|target| target.name == "cli")
        .expect("a crate with no package.json is still a workspace target");

    assert_eq!(
        target.scripts.get("build").map(String::as_str),
        Some("cargo build")
    );
    assert_eq!(
        target.scripts.get("test").map(String::as_str),
        Some("cargo test")
    );
    assert_eq!(
        target.scripts.get("install").map(String::as_str),
        Some("cargo fetch")
    );
}

#[test]
fn a_package_json_replaces_the_cargo_defaults_entirely() {
    let (_guard, path) = root();
    let dir = crate_at(&path, "cli", "[package]\nname = \"cli\"\n");
    write(
        &dir.join("package.json"),
        "{\n  \"name\": \"@talos/cli\",\n  \"scripts\": { \"test\": \"cargo nextest run\" }\n}\n",
    );
    write(&dir.join("src/main.rs"), "fn main() {}\n");

    let targets = discover_targets(&path);
    let target = targets
        .iter()
        .find(|target| target.name == "cli")
        .expect("the crate is a workspace target");

    assert_eq!(
        target.scripts.get("test").map(String::as_str),
        Some("cargo nextest run")
    );
    // The commands it does not define are skipped, not filled in.
    assert_eq!(target.scripts.get("lint"), None);
}

#[test]
fn hygiene_flags_an_ignored_test() {
    let findings = scan_source(
        "tests/parser_spec.rs",
        "#[ignore]\n#[test]\nfn works() {}\n",
    );
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "hygiene.skipped-test");
}

#[test]
fn hygiene_flags_a_leftover_debug_macro() {
    let findings = scan_source(
        "src/parser.rs",
        &format!("fn run() {{\n    {}!(value);\n}}\n", "dbg"),
    );
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "hygiene.debug-print");
    assert_eq!(findings[0].line, 2);
}
