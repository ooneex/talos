//! `project:check` against Python modules.
//!
//! Every check that reads sources has a TypeScript, a Rust and a Python path;
//! these tests pin the Python one so a distribution in the workspace is
//! validated instead of silently skipped.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use cli::commands::project_check::conventions::inspect_python;
use cli::commands::project_check::dependencies::{
    compare_python_packages, imported_packages, read_python_entry, unpinned_requirements,
};
use cli::commands::project_check::modules::{
    discover_modules, normalize_distribution, parse_python_manifest, parse_requirement,
    parse_requirements,
};
use cli::commands::project_check::tests::{missing_specs, python_needs_test, python_spec_names};
use cli::commands::project_check::{
    CheckOutcome, CheckStatus, ProjectCheckArgs, conventions, dependencies, scan_source, structure,
    tests,
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
fn detailed(outcome: &CheckOutcome, level: &str) -> Vec<String> {
    outcome
        .details
        .iter()
        .filter(|detail| detail.starts_with(level))
        .map(|detail| detail.trim_start_matches(level).trim().to_string())
        .collect()
}

/// A minimal Python package under `packages/<name>`.
fn package_at(root: &Path, name: &str, manifest: &str) -> PathBuf {
    write(
        &root.join("package.json"),
        "{\n  \"name\": \"fixture\",\n  \"workspaces\": [\"packages/*\"]\n}\n",
    );
    let dir = root.join("packages").join(name);
    write(&dir.join("pyproject.toml"), manifest);
    dir
}

#[test]
fn parses_a_pep_621_manifest() {
    let manifest = parse_python_manifest(
        r#"
[project]
name = "talos-worker"
version = "0.1.0"
dependencies = ["requests>=2.31", "pydantic[email]==2.6.0", "httpx ; python_version < '3.12'"]

[project.optional-dependencies]
dev = ["pytest>=8"]
"#,
    )
    .expect("the manifest parses");

    assert_eq!(manifest.name.as_deref(), Some("talos-worker"));
    assert_eq!(
        manifest.dependencies.get("requests").map(String::as_str),
        Some(">=2.31")
    );
    // Extras are not part of the distribution name.
    assert_eq!(
        manifest.dependencies.get("pydantic").map(String::as_str),
        Some("==2.6.0")
    );
    // An environment marker is not a version.
    assert_eq!(
        manifest.dependencies.get("httpx").map(String::as_str),
        Some("")
    );
    assert_eq!(
        manifest.dependencies.get("pytest").map(String::as_str),
        Some(">=8")
    );
}

#[test]
fn parses_a_poetry_manifest() {
    let manifest = parse_python_manifest(
        r#"
[tool.poetry]
name = "talos-worker"
version = "0.1.0"

[tool.poetry.dependencies]
python = "^3.12"
requests = "^2.31"
httpx = { version = "0.27", extras = ["http2"] }
"#,
    )
    .expect("the manifest parses");

    assert_eq!(manifest.name.as_deref(), Some("talos-worker"));
    assert_eq!(
        manifest.dependencies.get("requests").map(String::as_str),
        Some("^2.31")
    );
    assert_eq!(
        manifest.dependencies.get("httpx").map(String::as_str),
        Some("0.27")
    );
    // The interpreter is not a dependency.
    assert!(!manifest.dependencies.contains_key("python"));
}

#[test]
fn reads_uv_workspace_members() {
    let manifest = parse_python_manifest("[tool.uv.workspace]\nmembers = [\"packages/*\"]\n")
        .expect("the manifest parses");

    assert!(manifest.is_workspace);
    assert_eq!(manifest.workspace_members, vec!["packages/*"]);
}

#[test]
fn splits_a_requirement_into_name_and_specifier() {
    assert_eq!(
        parse_requirement("requests>=2.31"),
        Some(("requests".to_string(), ">=2.31".to_string()))
    );
    assert_eq!(
        parse_requirement("uvicorn[standard]==0.30"),
        Some(("uvicorn".to_string(), "==0.30".to_string()))
    );
    assert_eq!(
        parse_requirement("httpx"),
        Some(("httpx".to_string(), String::new()))
    );
    assert_eq!(parse_requirement("# a comment"), None);
}

#[test]
fn parses_a_requirements_file() {
    let requirements = parse_requirements(
        "# runtime\nrequests==2.31.0\n-r other.txt\n\nhttpx>=0.27  # pinned later\n",
    );
    assert_eq!(
        requirements.get("requests").map(String::as_str),
        Some("==2.31.0")
    );
    assert!(requirements.contains_key("httpx"));
    assert_eq!(requirements.len(), 2, "options and comments are ignored");
}

#[test]
fn normalises_distribution_names() {
    assert_eq!(
        normalize_distribution("Django_REST.framework"),
        "django-rest-framework"
    );
    assert_eq!(normalize_distribution("PyYAML"), "pyyaml");
}

#[test]
fn discovers_a_package_without_a_package_json() {
    let (_guard, path) = root();
    package_at(&path, "worker", "[project]\nname = \"worker\"\n");

    let modules = discover_modules(&path);
    let module = modules
        .iter()
        .find(|module| module.name == "worker")
        .expect("the package is discovered");
    assert!(module.is_python());
    assert!(module.is_python_only());
}

#[test]
fn structure_accepts_a_python_package() {
    let (_guard, path) = root();
    let dir = package_at(&path, "worker", "[project]\nname = \"worker\"\n");
    write(&dir.join("src/worker.py"), "def run():\n    return 1\n");
    write(
        &dir.join("tests/test_worker.py"),
        "def test_run():\n    assert True\n",
    );

    let outcome = structure::run(&args(), &path);
    assert!(
        detailed(&outcome, "error").is_empty(),
        "a Python package needs no package.json: {:?}",
        outcome.details
    );
}

#[test]
fn structure_reports_a_manifest_without_a_project_name() {
    let (_guard, path) = root();
    let dir = package_at(&path, "worker", "[tool.black]\nline-length = 88\n");
    write(&dir.join("src/worker.py"), "def run():\n    return 1\n");
    write(
        &dir.join("tests/test_worker.py"),
        "def test_run():\n    assert True\n",
    );

    let outcome = structure::run(&args(), &path);
    assert!(
        detailed(&outcome, "error")
            .iter()
            .any(|error| error.contains("pyproject.toml") && error.contains("name")),
        "{:?}",
        outcome.details
    );
}

#[test]
fn structure_accepts_the_flat_layout() {
    let (_guard, path) = root();
    let dir = package_at(&path, "worker", "[project]\nname = \"worker\"\n");
    write(&dir.join("worker/__init__.py"), "");
    write(&dir.join("worker/run.py"), "def run():\n    return 1\n");
    write(
        &dir.join("tests/test_run.py"),
        "def test_run():\n    assert True\n",
    );

    let outcome = structure::run(&args(), &path);
    assert!(
        !detailed(&outcome, "warn")
            .iter()
            .any(|warning| warning.contains("no src/")),
        "a package directory is a valid layout: {:?}",
        outcome.details
    );
}

#[test]
fn structure_reports_a_package_outside_the_workspace_members() {
    let (_guard, path) = root();
    write(
        &path.join("pyproject.toml"),
        "[tool.uv.workspace]\nmembers = [\"packages/other\"]\n",
    );
    let dir = package_at(&path, "worker", "[project]\nname = \"worker\"\n");
    write(&dir.join("src/worker.py"), "def run():\n    return 1\n");
    write(
        &dir.join("tests/test_worker.py"),
        "def test_run():\n    assert True\n",
    );

    let outcome = structure::run(&args(), &path);
    assert!(
        detailed(&outcome, "error")
            .iter()
            .any(|error| error.contains("workspace members") && error.contains("packages/worker")),
        "{:?}",
        outcome.details
    );
}

#[test]
fn a_python_module_of_private_helpers_needs_no_spec() {
    assert!(python_needs_test("parser", "def parse():\n    pass\n"));
    assert!(python_needs_test("parser", "class Parser:\n    pass\n"));
    assert!(!python_needs_test("parser", "def _parse():\n    pass\n"));
    assert!(!python_needs_test("__init__", "def parse():\n    pass\n"));
    assert!(!python_needs_test("conftest", "def fixture():\n    pass\n"));
}

#[test]
fn python_specs_may_carry_either_convention() {
    let names = python_spec_names("parser");
    assert!(names.contains(&"test_parser".to_string()));
    assert!(names.contains(&"parser_test".to_string()));
    assert!(names.contains(&"parser_spec".to_string()));
}

#[test]
fn reports_a_python_source_without_a_spec() {
    let (_guard, path) = root();
    let dir = package_at(&path, "worker", "[project]\nname = \"worker\"\n");
    write(&dir.join("src/parser.py"), "def parse():\n    pass\n");
    write(&dir.join("src/writer.py"), "def write():\n    pass\n");
    write(
        &dir.join("tests/test_parser.py"),
        "def test_parse():\n    assert True\n",
    );

    let modules = discover_modules(&path);
    let module = modules
        .iter()
        .find(|module| module.name == "worker")
        .expect("the package is discovered");
    let missing = missing_specs(module);
    assert_eq!(missing.len(), 1, "{missing:?}");
    assert!(missing[0].contains("writer"));
}

#[test]
fn a_directory_spec_covers_the_python_modules_it_groups() {
    let (_guard, path) = root();
    let dir = package_at(&path, "worker", "[project]\nname = \"worker\"\n");
    write(
        &dir.join("src/handlers/parser.py"),
        "def parse():\n    pass\n",
    );
    write(
        &dir.join("src/handlers/writer.py"),
        "def write():\n    pass\n",
    );
    write(
        &dir.join("tests/test_handlers.py"),
        "def test_all():\n    assert True\n",
    );

    let modules = discover_modules(&path);
    let module = modules
        .iter()
        .find(|module| module.name == "worker")
        .expect("the package is discovered");
    assert!(
        missing_specs(module).is_empty(),
        "{:?}",
        missing_specs(module)
    );
}

#[test]
fn tests_check_covers_a_python_module() {
    let (_guard, path) = root();
    let dir = package_at(&path, "worker", "[project]\nname = \"worker\"\n");
    write(&dir.join("src/parser.py"), "def parse():\n    pass\n");
    write(
        &dir.join("tests/test_other.py"),
        "def test_other():\n    assert True\n",
    );

    let outcome = tests::run(&args(), &path);
    assert_eq!(outcome.status, CheckStatus::Warned, "{:?}", outcome.details);
    assert!(
        detailed(&outcome, "warn")
            .iter()
            .any(|warning| warning.contains("parser")),
        "{:?}",
        outcome.details
    );
}

#[test]
fn conventions_flag_a_bare_except() {
    let findings = inspect_python("try:\n    run()\nexcept:\n    pass\n");
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "conventions.python-bare-except");
    assert_eq!(findings[0].line, 3);
}

#[test]
fn conventions_allow_a_typed_except() {
    let findings = inspect_python("try:\n    run()\nexcept ValueError:\n    pass\n");
    assert!(findings.is_empty(), "{findings:?}");
}

#[test]
fn conventions_flag_a_mutable_default_argument() {
    let findings = inspect_python("def collect(items=[]):\n    return items\n");
    assert!(
        findings
            .iter()
            .any(|finding| finding.rule == "conventions.python-mutable-default"),
        "{findings:?}"
    );
}

#[test]
fn conventions_flag_a_wildcard_import() {
    let findings = inspect_python("from models import *\n");
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "conventions.python-wildcard-import");
}

#[test]
fn conventions_flag_pep_8_naming() {
    let findings = inspect_python("class user_service:\n    pass\n\ndef readFile():\n    pass\n");
    assert!(
        findings
            .iter()
            .any(|finding| finding.rule == "conventions.python-class-name"),
        "{findings:?}"
    );
    assert!(
        findings
            .iter()
            .any(|finding| finding.rule == "conventions.python-function-name"),
        "{findings:?}"
    );
}

#[test]
fn conventions_accept_conforming_names() {
    let findings = inspect_python(
        "class UserService:\n    def read_file(self):\n        pass\n\n    def __init__(self):\n        pass\n",
    );
    assert!(findings.is_empty(), "{findings:?}");
}

#[test]
fn conventions_ignore_a_rule_described_in_a_string() {
    let findings = inspect_python("MESSAGE = \"never write from x import * here\"\n");
    assert!(findings.is_empty(), "{findings:?}");
}

#[test]
fn conventions_check_inspects_python_sources() {
    let (_guard, path) = root();
    let dir = package_at(&path, "worker", "[project]\nname = \"worker\"\n");
    write(
        &dir.join("src/parser.py"),
        "def parse():\n    try:\n        pass\n    except:\n        pass\n",
    );

    let outcome = conventions::run(&args(), &path);
    assert_eq!(outcome.status, CheckStatus::Warned, "{:?}", outcome.details);
    assert!(
        detailed(&outcome, "warn")
            .iter()
            .any(|warning| warning.contains("parser.py:4")),
        "{:?}",
        outcome.details
    );
}

#[test]
fn collects_the_packages_a_file_imports() {
    let imported = imported_packages(
        "import os\nimport requests\nfrom pydantic import BaseModel\nfrom .models import User\n",
    );
    assert!(imported.contains("requests"));
    assert!(imported.contains("pydantic"));
    assert!(
        !imported.contains("os"),
        "the standard library is not a dependency"
    );
    assert_eq!(
        imported.len(),
        2,
        "a relative import stays inside the package"
    );
}

#[test]
fn compares_declared_and_imported_packages() {
    let imported: BTreeSet<String> = ["requests", "yaml", "worker"]
        .into_iter()
        .map(str::to_string)
        .collect();
    let declared: BTreeMap<String, String> =
        [("requests", ">=2"), ("PyYAML", ">=6"), ("boto3", ">=1")]
            .into_iter()
            .map(|(name, specifier)| (name.to_string(), specifier.to_string()))
            .collect();
    let local: BTreeSet<String> = ["worker"].into_iter().map(str::to_string).collect();

    let (undeclared, unused) = compare_python_packages(&imported, &[], &declared, &local);
    assert!(undeclared.is_empty(), "yaml is PyYAML: {undeclared:?}");
    assert_eq!(unused, vec!["boto3".to_string()]);
}

#[test]
fn a_tool_is_never_reported_as_unused() {
    let declared: BTreeMap<String, String> = [("ruff", ">=0.5"), ("pytest-asyncio", ">=0.23")]
        .into_iter()
        .map(|(name, specifier)| (name.to_string(), specifier.to_string()))
        .collect();

    let (_, unused) = compare_python_packages(&BTreeSet::new(), &[], &declared, &BTreeSet::new());
    assert!(unused.is_empty(), "{unused:?}");
}

#[test]
fn flags_a_requirement_without_a_version() {
    let manifest = parse_python_manifest(
        "[project]\nname = \"worker\"\ndependencies = [\"requests\", \"httpx>=0.27\"]\n",
    )
    .expect("the manifest parses");
    let entry = read_python_entry("packages/worker", &manifest);

    let findings = unpinned_requirements(&[entry]);
    assert_eq!(findings.len(), 1);
    assert!(findings[0].contains("requests"));
}

#[test]
fn dependencies_check_reads_pyproject_manifests() {
    let (_guard, path) = root();
    let dir = package_at(
        &path,
        "worker",
        "[project]\nname = \"worker\"\ndependencies = [\"requests>=2.31\", \"boto3>=1.34\"]\n",
    );
    write(
        &dir.join("src/worker.py"),
        "import requests\n\n\ndef run():\n    return requests.get\n",
    );

    let outcome = dependencies::run(&args(), &path);
    assert_eq!(outcome.status, CheckStatus::Warned, "{:?}", outcome.details);
    assert!(
        detailed(&outcome, "warn")
            .iter()
            .any(|warning| warning.contains("boto3") && warning.contains("nothing imports it")),
        "{:?}",
        outcome.details
    );
}

#[test]
fn dependencies_check_reports_an_undeclared_import() {
    let (_guard, path) = root();
    let dir = package_at(
        &path,
        "worker",
        "[project]\nname = \"worker\"\ndependencies = [\"requests>=2.31\"]\n",
    );
    write(
        &dir.join("src/worker.py"),
        "import requests\nimport boto3\n",
    );

    let outcome = dependencies::run(&args(), &path);
    assert!(
        detailed(&outcome, "warn")
            .iter()
            .any(|warning| warning.contains("imports `boto3`")),
        "{:?}",
        outcome.details
    );
}

#[test]
fn hygiene_flags_a_skipped_python_test() {
    let findings = scan_source(
        "tests/test_parser.py",
        "@pytest.mark.skip(reason=\"flaky\")\ndef test_parse():\n    assert True\n",
    );
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "hygiene.skipped-test");
}

#[test]
fn hygiene_flags_a_leftover_debugger() {
    let findings = scan_source("src/parser.py", "def parse():\n    breakpoint()\n");
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule, "hygiene.debug-print");
    assert_eq!(findings[0].line, 2);
}

#[test]
fn the_workspace_runs_uv_for_a_locked_package() {
    let (_guard, path) = root();
    let dir = package_at(&path, "worker", "[project]\nname = \"worker\"\n");
    write(&dir.join("uv.lock"), "version = 1\n");

    let targets = discover_targets(&path);
    let target = targets
        .iter()
        .find(|target| target.name == "worker")
        .expect("a package with no package.json is still a workspace target");

    assert_eq!(
        target.scripts.get("install").map(String::as_str),
        Some("uv sync")
    );
    assert_eq!(
        target.scripts.get("test").map(String::as_str),
        Some("uv run pytest")
    );
}

#[test]
fn the_workspace_falls_back_to_poetry_and_pip() {
    let (_guard, path) = root();
    let poetry = package_at(&path, "worker", "[tool.poetry]\nname = \"worker\"\n");
    write(&poetry.join("poetry.lock"), "");
    let plain = package_at(&path, "tools", "[project]\nname = \"tools\"\n");
    write(&plain.join("src/tools.py"), "def run():\n    pass\n");

    let targets = discover_targets(&path);
    let poetry_target = targets
        .iter()
        .find(|target| target.name == "worker")
        .expect("the poetry package is a target");
    let plain_target = targets
        .iter()
        .find(|target| target.name == "tools")
        .expect("the plain package is a target");

    assert_eq!(
        poetry_target.scripts.get("test").map(String::as_str),
        Some("poetry run pytest")
    );
    assert_eq!(
        plain_target.scripts.get("test").map(String::as_str),
        Some("python -m pytest")
    );
}

#[test]
fn a_hand_written_script_wins_over_the_python_default() {
    let (_guard, path) = root();
    let dir = package_at(&path, "worker", "[project]\nname = \"worker\"\n");
    write(&dir.join("uv.lock"), "version = 1\n");
    write(
        &dir.join("package.json"),
        "{\n  \"name\": \"@talos/worker\",\n  \"scripts\": { \"test\": \"uv run pytest -x\" }\n}\n",
    );

    let targets = discover_targets(&path);
    let target = targets
        .iter()
        .find(|target| target.name == "worker")
        .expect("the package is a target");

    assert_eq!(
        target.scripts.get("test").map(String::as_str),
        Some("uv run pytest -x")
    );
    assert_eq!(
        target.scripts.get("lint").map(String::as_str),
        Some("uv run ruff check")
    );
}
