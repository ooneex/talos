//! The lockfile readers behind `security:check`.
//!
//! Ten ecosystems, ten formats, one job: turn a lockfile into the
//! `(ecosystem, name, version)` tuples the audit queries. None of it needs the
//! network, so each format gets a fixture and a reading.

use std::fs;
use std::path::Path;

use cli::commands::security_check::{
    Ecosystem, PackageKey, collect_packages, parse_bun_lock, parse_cargo_lock,
    parse_composer_lock, parse_gemfile_lock, parse_go_sum, parse_package_lock, parse_pipfile_lock,
    parse_poetry_lock, parse_requirements_txt, parse_uv_lock, target_name, unquote,
};

/// A directory holding one lockfile.
fn with(file: &str, content: &str) -> tempfile::TempDir {
    let dir = tempfile::tempdir().expect("create temp dir");
    fs::write(dir.path().join(file), content).expect("write lockfile");
    dir
}

fn pairs(packages: &[PackageKey]) -> Vec<(&str, &str)> {
    packages
        .iter()
        .map(|key| (key.name.as_str(), key.version.as_str()))
        .collect()
}

// ---------------------------------------------------------------------------
// npm
// ---------------------------------------------------------------------------

#[test]
fn bun_lock_yields_one_package_per_resolved_descriptor() {
    let dir = with(
        "bun.lock",
        r#"{
  // bun writes a JSONC lockfile
  "packages": {
    "left-pad": ["left-pad@1.3.0", {}, "sha512-x"],
    "@talosjs/app": ["@talosjs/app@2.0.1", {}, "sha512-y"],
    "broken": [42, {}, "sha512-z"]
  }
}"#,
    );

    let packages = parse_bun_lock(dir.path());

    assert_eq!(
        pairs(&packages),
        vec![("@talosjs/app", "2.0.1"), ("left-pad", "1.3.0")],
        "a descriptor that is not a string is skipped"
    );
    assert!(packages.iter().all(|key| key.ecosystem == Ecosystem::Npm));
}

#[test]
fn package_lock_reads_the_version_out_of_each_install_path() {
    let dir = with(
        "package-lock.json",
        r#"{
  "lockfileVersion": 3,
  "packages": {
    "": { "name": "root", "version": "1.0.0" },
    "node_modules/left-pad": { "version": "1.3.0" },
    "node_modules/a/node_modules/left-pad": { "version": "1.2.0" },
    "node_modules/no-version": {}
  }
}"#,
    );

    let parsed = parse_package_lock(dir.path());
    let mut packages = pairs(&parsed);
    packages.sort();

    assert_eq!(
        packages,
        vec![("left-pad", "1.2.0"), ("left-pad", "1.3.0")],
        "the root entry and an entry with no version are both skipped"
    );
}

#[test]
fn a_lockfile_that_is_not_json_yields_nothing_rather_than_panicking() {
    let dir = with("package-lock.json", "not json at all");

    assert!(parse_package_lock(dir.path()).is_empty());
}

#[test]
fn a_directory_with_no_lockfile_yields_nothing() {
    let dir = tempfile::tempdir().expect("create temp dir");

    assert!(parse_bun_lock(dir.path()).is_empty());
    assert!(parse_package_lock(dir.path()).is_empty());
    assert!(parse_cargo_lock(dir.path()).is_empty());
    assert!(parse_go_sum(dir.path()).is_empty());
}

// ---------------------------------------------------------------------------
// crates.io
// ---------------------------------------------------------------------------

#[test]
fn cargo_lock_pairs_each_name_with_the_version_that_follows_it() {
    let dir = with(
        "Cargo.lock",
        r#"version = 4

[[package]]
name = "serde"
version = "1.0.200"

[[package]]
name = "regex"
version = "1.13.1"
dependencies = ["memchr"]
"#,
    );

    let packages = parse_cargo_lock(dir.path());

    assert_eq!(
        pairs(&packages),
        vec![("serde", "1.0.200"), ("regex", "1.13.1")]
    );
    assert!(packages.iter().all(|key| key.ecosystem == Ecosystem::Crates));
}

// ---------------------------------------------------------------------------
// PyPI
// ---------------------------------------------------------------------------

#[test]
fn requirements_only_yields_the_fully_pinned_lines() {
    let dir = with(
        "requirements.txt",
        "# a comment\n\ndjango==5.0.1\nrequests[security]==2.31.0\nflask>=3.0\n-r other.txt\nnumpy==1.26.0 ; python_version > \"3.9\"\n",
    );

    assert_eq!(
        pairs(&parse_requirements_txt(dir.path())),
        vec![
            ("django", "5.0.1"),
            ("requests", "2.31.0"),
            ("numpy", "1.26.0")
        ],
        "a range, a comment and an include are all skipped"
    );
}

#[test]
fn pipfile_lock_reads_both_the_default_and_the_develop_sections() {
    let dir = with(
        "Pipfile.lock",
        r#"{
  "default": { "django": { "version": "==5.0.1" }, "no-version": {} },
  "develop": { "pytest": { "version": "==8.0.0" } }
}"#,
    );

    let parsed = parse_pipfile_lock(dir.path());
    let mut packages = pairs(&parsed);
    packages.sort();

    assert_eq!(packages, vec![("django", "5.0.1"), ("pytest", "8.0.0")]);
}

#[test]
fn poetry_and_uv_share_the_package_block_layout() {
    let body = r#"version = 1

[[package]]
name = "django"
version = "5.0.1"

[[package]]
name = "pytest"
version = "8.0.0"

[metadata]
name = "not-a-package"
version = "0.0.0"
"#;

    let poetry = with("poetry.lock", body);
    let uv = with("uv.lock", body);

    let expected = vec![("django", "5.0.1"), ("pytest", "8.0.0")];
    assert_eq!(pairs(&parse_poetry_lock(poetry.path())), expected);
    assert_eq!(
        pairs(&parse_uv_lock(uv.path())),
        expected,
        "the metadata table is not read as a package"
    );
}

// ---------------------------------------------------------------------------
// Go, RubyGems and Packagist
// ---------------------------------------------------------------------------

#[test]
fn go_sum_reports_each_module_once_whichever_hash_line_named_it() {
    let dir = with(
        "go.sum",
        "github.com/pkg/errors v0.9.1 h1:abc=\ngithub.com/pkg/errors v0.9.1/go.mod h1:def=\ngolang.org/x/net v0.20.0 h1:ghi=\nnonsense\n",
    );

    assert_eq!(
        pairs(&parse_go_sum(dir.path())),
        vec![
            ("github.com/pkg/errors", "v0.9.1"),
            ("golang.org/x/net", "v0.20.0")
        ]
    );
}

#[test]
fn gemfile_lock_only_reads_the_specs_pinned_at_the_top_level() {
    let dir = with(
        "Gemfile.lock",
        "GEM\n  remote: https://rubygems.org/\n  specs:\n    rails (7.1.3)\n      actionpack (= 7.1.3)\n    rake (13.1.0)\n\nPLATFORMS\n  ruby\n",
    );

    assert_eq!(
        pairs(&parse_gemfile_lock(dir.path())),
        vec![("rails", "7.1.3"), ("rake", "13.1.0")],
        "the nested constraint is not a pinned spec"
    );
}

#[test]
fn composer_lock_reads_both_package_arrays_and_drops_the_version_prefix() {
    let dir = with(
        "composer.lock",
        r#"{
  "packages": [{ "name": "symfony/console", "version": "v6.4.0" }],
  "packages-dev": [{ "name": "phpunit/phpunit", "version": "10.5.0" }, { "name": "no-version" }]
}"#,
    );

    assert_eq!(
        pairs(&parse_composer_lock(dir.path())),
        vec![("symfony/console", "6.4.0"), ("phpunit/phpunit", "10.5.0")]
    );
}

// ---------------------------------------------------------------------------
// Everything at once
// ---------------------------------------------------------------------------

#[test]
fn a_directory_holding_several_lockfiles_yields_every_ecosystem_in_it() {
    let dir = tempfile::tempdir().expect("create temp dir");
    let write = |name: &str, body: &str| {
        fs::write(dir.path().join(name), body).expect("write lockfile");
    };
    write(
        "bun.lock",
        "{ \"packages\": { \"left-pad\": [\"left-pad@1.3.0\", {}, \"sha\"] } }",
    );
    write("Cargo.lock", "[[package]]\nname = \"serde\"\nversion = \"1.0.200\"\n");
    write("requirements.txt", "django==5.0.1\n");
    write("go.sum", "golang.org/x/net v0.20.0 h1:abc=\n");
    write("Gemfile.lock", "GEM\n  specs:\n    rake (13.1.0)\n");
    write(
        "composer.lock",
        "{ \"packages\": [{ \"name\": \"symfony/console\", \"version\": \"v6.4.0\" }] }",
    );

    let packages = collect_packages(dir.path());

    let ecosystems: Vec<Ecosystem> = packages.iter().map(|key| key.ecosystem).collect();
    for ecosystem in [
        Ecosystem::Npm,
        Ecosystem::Crates,
        Ecosystem::PyPI,
        Ecosystem::Go,
        Ecosystem::RubyGems,
        Ecosystem::Packagist,
    ] {
        assert!(
            ecosystems.contains(&ecosystem),
            "{ecosystem:?} is missing from {ecosystems:?}"
        );
    }
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

#[test]
fn a_module_is_named_by_its_path_below_the_workspace_root() {
    let dir = tempfile::tempdir().expect("create temp dir");
    let root = dir.path();

    assert_eq!(target_name(root, &root.join("modules/user")), "user");
    assert_eq!(target_name(root, &root.join("packages/core")), "core");
    assert_eq!(
        target_name(root, Path::new("/elsewhere/other")),
        "other",
        "a directory outside the root falls back to its own name"
    );
}

#[test]
fn a_quoted_toml_value_loses_its_quotes_and_its_padding() {
    assert_eq!(unquote("  \"serde\"  "), "serde");
    assert_eq!(unquote("serde"), "serde");
    assert_eq!(unquote("\"\""), "");
}
