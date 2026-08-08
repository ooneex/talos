use std::fs;
use std::path::{Path, PathBuf};

use clap::Parser;
use serde_json::json;

use cli::commands::security_check::{
    Ecosystem, Finding, ModuleReport, Origin, PackageKey, SecurityCheckArgs, Severity,
    build_filter, build_finding, build_issue_description, build_issue_title, collect_modules,
    collect_packages, cvss3_base_score, fixed_versions, parse_bun_lock, parse_composer_lock,
    parse_gemfile_lock, parse_go_sum, parse_package_lock, root_package_name, severity_from_record,
    sort_findings, split_name_version, target_name, truncate, unquote,
};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: SecurityCheckArgs,
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/// A scratch directory that removes itself when the test ends.
struct TempDir(PathBuf);

impl TempDir {
    fn new(tag: &str) -> Self {
        let base = std::env::temp_dir().join(format!(
            "talos-security-check-{tag}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).expect("temp dir should be creatable");
        Self(base)
    }

    fn path(&self) -> &Path {
        &self.0
    }

    fn write(&self, name: &str, content: &str) -> &Self {
        let target = self.0.join(name);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).expect("parent dir should be creatable");
        }
        fs::write(target, content).expect("fixture should be writable");
        self
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn names(packages: &[PackageKey]) -> Vec<(String, String)> {
    packages
        .iter()
        .map(|p| (p.name.clone(), p.version.clone()))
        .collect()
}

/// Comparison shape for [`names`], so assertions can stay written as literals.
fn pairs<const N: usize>(expected: [(&str, &str); N]) -> Vec<(String, String)> {
    expected
        .into_iter()
        .map(|(name, version)| (name.to_string(), version.to_string()))
        .collect()
}

fn finding(module: &str, subject: &str, severity: Severity, id: &str) -> Finding {
    Finding {
        module: module.to_string(),
        module_dir: PathBuf::from("/tmp/module"),
        origin: Origin::Dependency(Ecosystem::Npm),
        subject: subject.to_string(),
        version: "1.0.0".to_string(),
        severity,
        id: id.to_string(),
        title: "Some advisory".to_string(),
        url: format!("https://osv.dev/vulnerability/{id}"),
        aliases: String::new(),
        remediation: String::new(),
        evidence: String::new(),
    }
}

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------

#[test]
fn security_check_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--issues",
        "--modules",
        "user,billing",
        "--packages",
        "cli",
        "--audit-level",
        "high",
        "--skip-llm",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert!(cli.args.issues);
    assert_eq!(cli.args.modules.as_deref(), Some("user,billing"));
    assert_eq!(cli.args.packages.as_deref(), Some("cli"));
    assert_eq!(cli.args.audit_level.as_deref(), Some("high"));
    assert!(cli.args.skip_llm);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn security_check_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(!cli.args.issues);
    assert!(!cli.args.skip_llm);
    assert!(cli.args.modules.is_none());
    assert!(cli.args.packages.is_none());
    assert!(cli.args.audit_level.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn security_check_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

#[test]
fn severity_from_label_is_case_insensitive_and_accepts_medium() {
    assert_eq!(Severity::from_label("CRITICAL"), Severity::Critical);
    assert_eq!(Severity::from_label("  High "), Severity::High);
    assert_eq!(Severity::from_label("moderate"), Severity::Moderate);
    assert_eq!(Severity::from_label("MEDIUM"), Severity::Moderate);
    assert_eq!(Severity::from_label("low"), Severity::Low);
}

#[test]
fn severity_from_label_falls_back_to_unknown() {
    assert_eq!(Severity::from_label(""), Severity::Unknown);
    assert_eq!(Severity::from_label("informational"), Severity::Unknown);
}

#[test]
fn severity_from_cvss_uses_the_standard_bands() {
    assert_eq!(Severity::from_cvss(10.0), Severity::Critical);
    assert_eq!(Severity::from_cvss(9.0), Severity::Critical);
    assert_eq!(Severity::from_cvss(8.9), Severity::High);
    assert_eq!(Severity::from_cvss(7.0), Severity::High);
    assert_eq!(Severity::from_cvss(6.9), Severity::Moderate);
    assert_eq!(Severity::from_cvss(4.0), Severity::Moderate);
    assert_eq!(Severity::from_cvss(3.9), Severity::Low);
    assert_eq!(Severity::from_cvss(0.1), Severity::Low);
    assert_eq!(Severity::from_cvss(0.0), Severity::Unknown);
}

#[test]
fn severity_orders_from_unknown_up_to_critical() {
    let mut all = [
        Severity::High,
        Severity::Unknown,
        Severity::Critical,
        Severity::Low,
        Severity::Moderate,
    ];
    all.sort();

    assert_eq!(
        all,
        [
            Severity::Unknown,
            Severity::Low,
            Severity::Moderate,
            Severity::High,
            Severity::Critical,
        ]
    );
}

#[test]
fn severity_labels_and_priorities_are_stable() {
    assert_eq!(Severity::Critical.label(), "CRITICAL");
    assert_eq!(Severity::Unknown.label(), "UNKNOWN");

    assert_eq!(Severity::Critical.priority(), "Urgent");
    assert_eq!(Severity::High.priority(), "Urgent");
    assert_eq!(Severity::Moderate.priority(), "High");
    assert_eq!(Severity::Low.priority(), "Medium");
    assert_eq!(Severity::Unknown.priority(), "Medium");
}

#[test]
fn severity_styled_contains_the_label() {
    for severity in [
        Severity::Critical,
        Severity::High,
        Severity::Moderate,
        Severity::Low,
        Severity::Unknown,
    ] {
        assert!(severity.styled().contains(severity.label()));
    }
}

// ---------------------------------------------------------------------------
// Ecosystem + Origin
// ---------------------------------------------------------------------------

#[test]
fn ecosystem_osv_names_match_what_the_api_expects() {
    assert_eq!(Ecosystem::Npm.osv(), "npm");
    assert_eq!(Ecosystem::Go.osv(), "Go");
    assert_eq!(Ecosystem::RubyGems.osv(), "RubyGems");
    assert_eq!(Ecosystem::Packagist.osv(), "Packagist");
}

#[test]
fn ecosystem_report_labels_are_lower_case() {
    assert_eq!(Ecosystem::Go.label(), "go");
    assert_eq!(Ecosystem::RubyGems.label(), "rubygems");
}

#[test]
fn origin_label_lowercases_the_assistant_name() {
    assert_eq!(Origin::Dependency(Ecosystem::Go).label(), "go");
    assert_eq!(Origin::Assistant("Claude".to_string()).label(), "claude");
}

#[test]
fn origin_assistant_is_only_set_for_assistant_findings() {
    assert!(Origin::Dependency(Ecosystem::Npm).assistant().is_none());
    assert_eq!(
        Origin::Assistant("Cursor".to_string()).assistant(),
        Some("Cursor")
    );
}

// ---------------------------------------------------------------------------
// lockfile parsers
// ---------------------------------------------------------------------------

#[test]
fn parse_bun_lock_reads_name_at_version_descriptors() {
    let dir = TempDir::new("bun");
    dir.write(
        "bun.lock",
        r#"{
  // bun writes jsonc
  "lockfileVersion": 1,
  "packages": {
    "left-pad": ["left-pad@1.3.0", {}, "sha512-x"],
    "@scope/pkg": ["@scope/pkg@2.1.0", {}, "sha512-y"]
  }
}"#,
    );

    let mut found = names(&parse_bun_lock(dir.path()));
    found.sort();

    assert_eq!(
        found,
        pairs([("@scope/pkg", "2.1.0"), ("left-pad", "1.3.0")])
    );
}

#[test]
fn parse_bun_lock_returns_nothing_when_absent_or_malformed() {
    let dir = TempDir::new("bun-bad");
    assert!(parse_bun_lock(dir.path()).is_empty());

    dir.write("bun.lock", "not json at all {{{");
    assert!(parse_bun_lock(dir.path()).is_empty());

    dir.write("bun.lock", r#"{"lockfileVersion": 1}"#);
    assert!(parse_bun_lock(dir.path()).is_empty());
}

#[test]
fn parse_package_lock_reads_the_last_node_modules_segment() {
    let dir = TempDir::new("npm");
    dir.write(
        "package-lock.json",
        r#"{
  "packages": {
    "": { "name": "root", "version": "0.0.0" },
    "node_modules/left-pad": { "version": "1.3.0" },
    "node_modules/a/node_modules/nested": { "version": "9.9.9" },
    "node_modules/no-version": { "resolved": "https://example.test" }
  }
}"#,
    );

    let mut found = names(&parse_package_lock(dir.path()));
    found.sort();

    // The root entry ("") is skipped, a nested path resolves to the inner name,
    // and an entry without a resolved version is not auditable.
    assert_eq!(found, pairs([("left-pad", "1.3.0"), ("nested", "9.9.9")]));
}

#[test]
fn parse_package_lock_tags_packages_as_npm() {
    let dir = TempDir::new("npm-eco");
    dir.write(
        "package-lock.json",
        r#"{"packages": {"node_modules/x": {"version": "1.0.0"}}}"#,
    );

    let found = parse_package_lock(dir.path());

    assert_eq!(found.len(), 1);
    assert_eq!(found[0].ecosystem, Ecosystem::Npm);
}

#[test]
fn parse_go_sum_strips_go_mod_and_dedupes() {
    let dir = TempDir::new("go");
    dir.write(
        "go.sum",
        "github.com/pkg/errors v0.9.1 h1:aaa=\ngithub.com/pkg/errors v0.9.1/go.mod h1:bbb=\ngolang.org/x/net v0.17.0 h1:ccc=\nmalformed-line\n",
    );

    let found = parse_go_sum(dir.path());

    assert_eq!(
        names(&found),
        pairs([
            ("github.com/pkg/errors", "v0.9.1"),
            ("golang.org/x/net", "v0.17.0"),
        ])
    );
    assert!(found.iter().all(|p| p.ecosystem == Ecosystem::Go));
}

#[test]
fn parse_gemfile_lock_takes_only_direct_specs() {
    let dir = TempDir::new("gem");
    dir.write(
        "Gemfile.lock",
        "GEM\n  remote: https://rubygems.org/\n  specs:\n    rails (7.1.3)\n      actionpack (= 7.1.3)\n    nokogiri (1.16.2)\n\nPLATFORMS\n  ruby\n",
    );

    let found = parse_gemfile_lock(dir.path());

    // `actionpack` is indented 6 spaces — a constraint, not a pinned spec.
    assert_eq!(
        names(&found),
        pairs([("rails", "7.1.3"), ("nokogiri", "1.16.2")])
    );
    assert!(found.iter().all(|p| p.ecosystem == Ecosystem::RubyGems));
}

#[test]
fn parse_gemfile_lock_skips_specs_without_a_numeric_version() {
    let dir = TempDir::new("gem-nonnumeric");
    dir.write(
        "Gemfile.lock",
        "GEM\n  specs:\n    weird (abc)\n    fine (1.0.0)\n",
    );

    assert_eq!(
        names(&parse_gemfile_lock(dir.path())),
        pairs([("fine", "1.0.0")])
    );
}

#[test]
fn parse_composer_lock_reads_both_sections_and_trims_the_v_prefix() {
    let dir = TempDir::new("composer");
    dir.write(
        "composer.lock",
        r#"{
  "packages": [{ "name": "monolog/monolog", "version": "v2.9.1" }],
  "packages-dev": [{ "name": "phpunit/phpunit", "version": "10.5.0" }, { "name": "no-version" }]
}"#,
    );

    let found = parse_composer_lock(dir.path());

    assert_eq!(
        names(&found),
        pairs([("monolog/monolog", "2.9.1"), ("phpunit/phpunit", "10.5.0")])
    );
    assert!(found.iter().all(|p| p.ecosystem == Ecosystem::Packagist));
}

#[test]
fn collect_packages_merges_every_ecosystem_in_one_directory() {
    let dir = TempDir::new("mixed");
    dir.write(
        "package-lock.json",
        r#"{"packages": {"node_modules/left-pad": {"version": "1.3.0"}}}"#,
    );
    dir.write("go.sum", "github.com/pkg/errors v0.9.1 h1:aaa=\n");

    let found = collect_packages(dir.path());
    let mut ecosystems: Vec<&str> = found.iter().map(|p| p.ecosystem.label()).collect();
    ecosystems.sort();

    assert_eq!(found.len(), 2);
    assert_eq!(ecosystems, ["go", "npm"]);
}

#[test]
fn collect_packages_is_empty_for_a_directory_with_no_lockfile() {
    let dir = TempDir::new("empty");

    assert!(collect_packages(dir.path()).is_empty());
}

// ---------------------------------------------------------------------------
// descriptor helpers
// ---------------------------------------------------------------------------

#[test]
fn split_name_version_splits_on_the_last_at_sign() {
    assert_eq!(
        split_name_version("left-pad@1.3.0"),
        Some(("left-pad".to_string(), "1.3.0".to_string()))
    );
    assert_eq!(
        split_name_version("@scope/pkg@2.1.0"),
        Some(("@scope/pkg".to_string(), "2.1.0".to_string()))
    );
}

#[test]
fn split_name_version_rejects_descriptors_without_a_usable_at_sign() {
    assert_eq!(split_name_version("left-pad"), None);
    // A leading `@` is a scope marker, not a separator.
    assert_eq!(split_name_version("@scope"), None);
}

#[test]
fn unquote_strips_surrounding_whitespace_and_quotes() {
    assert_eq!(unquote("  \"serde\"  "), "serde");
    assert_eq!(unquote("bare"), "bare");
}

// ---------------------------------------------------------------------------
// module discovery
// ---------------------------------------------------------------------------

#[test]
fn target_name_uses_the_directory_under_modules_or_packages() {
    let root = Path::new("/repo");

    assert_eq!(target_name(root, &root.join("modules/user")), "user");
    assert_eq!(target_name(root, &root.join("packages/cli")), "cli");
    assert_eq!(target_name(root, &root.join("modules/user/nested")), "user");
}

#[test]
fn target_name_falls_back_to_the_last_component() {
    let root = Path::new("/repo");

    assert_eq!(target_name(root, &root.join("apps/web")), "web");
    // A directory outside the root cannot be relativized.
    assert_eq!(target_name(root, Path::new("/elsewhere/thing")), "thing");
}

#[test]
fn root_package_name_prefers_the_package_json_name() {
    let dir = TempDir::new("rootname");
    dir.write("package.json", r#"{"name": "@acme/workspace"}"#);

    assert_eq!(root_package_name(dir.path()), "@acme/workspace");
}

#[test]
fn root_package_name_falls_back_to_the_directory_name() {
    let dir = TempDir::new("rootname-fallback");
    let expected = dir
        .path()
        .file_name()
        .and_then(|n| n.to_str())
        .expect("temp dir has a name")
        .to_string();

    assert_eq!(root_package_name(dir.path()), expected);

    // A package.json without a name is no better than no package.json.
    dir.write("package.json", r#"{"version": "1.0.0"}"#);
    assert_eq!(root_package_name(dir.path()), expected);
}

#[test]
fn collect_modules_walks_the_workspace_and_names_each_module() {
    let dir = TempDir::new("walk");
    dir.write("package.json", r#"{"name": "workspace"}"#);
    dir.write(
        "modules/user/package-lock.json",
        r#"{"packages": {"node_modules/left-pad": {"version": "1.3.0"}}}"#,
    );
    dir.write(
        "packages/cli/go.sum",
        "github.com/pkg/errors v0.9.1 h1:aaa=\n",
    );

    let modules = collect_modules(dir.path());
    let found: Vec<&str> = modules.iter().map(|m| m.name.as_str()).collect();

    assert_eq!(found, ["cli", "user"]);
}

#[test]
fn collect_modules_does_not_descend_into_excluded_directories() {
    let dir = TempDir::new("walk-excluded");
    dir.write(
        "node_modules/dep/package-lock.json",
        r#"{"packages": {"node_modules/x": {"version": "1.0.0"}}}"#,
    );
    dir.write(
        "target/debug/package-lock.json",
        r#"{"packages": {"node_modules/y": {"version": "1.0.0"}}}"#,
    );
    dir.write(
        ".hidden/package-lock.json",
        r#"{"packages": {"node_modules/z": {"version": "1.0.0"}}}"#,
    );

    assert!(collect_modules(dir.path()).is_empty());
}

#[test]
fn collect_modules_dedupes_packages_within_a_module() {
    let dir = TempDir::new("walk-dedupe");
    // The same npm package pinned by two different lockfiles in one directory.
    dir.write(
        "package-lock.json",
        r#"{"packages": {"node_modules/left-pad": {"version": "1.3.0"}}}"#,
    );
    dir.write(
        "bun.lock",
        r#"{"packages": {"left-pad": ["left-pad@1.3.0", {}, "sha512-x"]}}"#,
    );

    let modules = collect_modules(dir.path());

    assert_eq!(modules.len(), 1);
    assert_eq!(names(&modules[0].packages), pairs([("left-pad", "1.3.0")]));
}

// ---------------------------------------------------------------------------
// filtering + sorting
// ---------------------------------------------------------------------------

#[test]
fn build_filter_merges_modules_and_packages_and_trims() {
    let filter = build_filter(Some("user, billing"), Some("cli,user"))
        .expect("a non-empty filter should be built");

    assert_eq!(filter.len(), 3);
    assert!(filter.contains("user"));
    assert!(filter.contains("billing"));
    assert!(filter.contains("cli"));
}

#[test]
fn build_filter_is_none_when_nothing_usable_is_given() {
    assert!(build_filter(None, None).is_none());
    assert!(build_filter(Some(""), Some("  , ,")).is_none());
}

#[test]
fn sort_findings_orders_by_module_then_severity_desc_then_subject() {
    let mut findings = vec![
        finding("user", "zeta", Severity::Low, "OSV-3"),
        finding("billing", "alpha", Severity::Low, "OSV-2"),
        finding("billing", "beta", Severity::Critical, "OSV-1"),
        finding("billing", "alpha", Severity::Low, "OSV-1"),
    ];

    sort_findings(&mut findings);

    let order: Vec<(&str, &str, &str)> = findings
        .iter()
        .map(|f| (f.module.as_str(), f.subject.as_str(), f.id.as_str()))
        .collect();

    assert_eq!(
        order,
        [
            ("billing", "beta", "OSV-1"),
            ("billing", "alpha", "OSV-1"),
            ("billing", "alpha", "OSV-2"),
            ("user", "zeta", "OSV-3"),
        ]
    );
}

// ---------------------------------------------------------------------------
// advisory records
// ---------------------------------------------------------------------------

#[test]
fn severity_from_record_prefers_the_database_specific_label() {
    let record = json!({
        "database_specific": { "severity": "HIGH" },
        "severity": [{ "type": "CVSS_V3", "score": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L" }]
    });

    assert_eq!(severity_from_record(&record), Severity::High);
}

#[test]
fn severity_from_record_falls_back_to_the_highest_cvss_entry() {
    let record = json!({
        "severity": [
            { "type": "CVSS_V3", "score": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L" },
            { "type": "CVSS_V3", "score": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }
        ]
    });

    assert_eq!(severity_from_record(&record), Severity::Critical);
}

#[test]
fn severity_from_record_accepts_a_bare_numeric_score() {
    let record = json!({ "severity": [{ "score": "7.5" }] });

    assert_eq!(severity_from_record(&record), Severity::High);
}

#[test]
fn severity_from_record_is_unknown_without_usable_severity() {
    assert_eq!(severity_from_record(&json!({})), Severity::Unknown);
    assert_eq!(
        severity_from_record(&json!({ "database_specific": { "severity": "nonsense" } })),
        Severity::Unknown
    );
    assert_eq!(
        severity_from_record(&json!({ "severity": [{ "score": "CVSS:2.0/AV:N" }] })),
        Severity::Unknown
    );
}

#[test]
fn fixed_versions_collects_sorted_unique_fixes_for_the_package() {
    let package = PackageKey {
        ecosystem: Ecosystem::Npm,
        name: "left-pad".to_string(),
        version: "1.0.0".to_string(),
    };
    let record = json!({
        "affected": [
            {
                "package": { "name": "left-pad", "ecosystem": "npm" },
                "ranges": [{ "events": [{ "introduced": "0" }, { "fixed": "1.3.0" }] }]
            },
            {
                "package": { "name": "left-pad", "ecosystem": "npm" },
                "ranges": [{ "events": [{ "fixed": "1.3.0" }, { "fixed": "1.2.0" }] }]
            },
            {
                "package": { "name": "other", "ecosystem": "npm" },
                "ranges": [{ "events": [{ "fixed": "9.9.9" }] }]
            }
        ]
    });

    assert_eq!(fixed_versions(&record, &package), "1.2.0, 1.3.0");
}

#[test]
fn fixed_versions_is_empty_when_nothing_matches() {
    let package = PackageKey {
        ecosystem: Ecosystem::Npm,
        name: "left-pad".to_string(),
        version: "1.0.0".to_string(),
    };

    assert_eq!(fixed_versions(&json!({}), &package), "");
    assert_eq!(
        fixed_versions(
            &json!({ "affected": [{ "package": { "name": "left-pad", "ecosystem": "PyPI" } }] }),
            &package
        ),
        ""
    );
}

#[test]
fn build_finding_reads_the_record_and_links_to_osv() {
    let module = ModuleReport {
        name: "user".to_string(),
        dir: PathBuf::from("/repo/modules/user"),
        packages: Vec::new(),
    };
    let package = PackageKey {
        ecosystem: Ecosystem::Npm,
        name: "left-pad".to_string(),
        version: "1.0.0".to_string(),
    };
    let record = json!({
        "summary": "Denial of service",
        "database_specific": { "severity": "MODERATE" },
        "aliases": ["CVE-2024-0001", "GHSA-xxxx"],
        "affected": [{
            "package": { "name": "left-pad", "ecosystem": "npm" },
            "ranges": [{ "events": [{ "fixed": "1.3.0" }] }]
        }]
    });

    let found = build_finding(&module, &package, "OSV-2024-1", Some(&record));

    assert_eq!(found.module, "user");
    assert_eq!(found.subject, "left-pad");
    assert_eq!(found.version, "1.0.0");
    assert_eq!(found.severity, Severity::Moderate);
    assert_eq!(found.title, "Denial of service");
    assert_eq!(found.url, "https://osv.dev/vulnerability/OSV-2024-1");
    // Only CVE aliases are kept.
    assert_eq!(found.aliases, "CVE-2024-0001");
    assert_eq!(found.remediation, "1.3.0");
}

#[test]
fn build_finding_without_a_record_synthesizes_a_title() {
    let module = ModuleReport {
        name: "user".to_string(),
        dir: PathBuf::from("/repo/modules/user"),
        packages: Vec::new(),
    };
    let package = PackageKey {
        ecosystem: Ecosystem::Npm,
        name: "left-pad".to_string(),
        version: "1.0.0".to_string(),
    };

    let found = build_finding(&module, &package, "OSV-2024-1", None);

    assert_eq!(found.severity, Severity::Unknown);
    assert_eq!(found.title, "Known vulnerability in left-pad");
    assert_eq!(found.aliases, "");
    assert_eq!(found.remediation, "");
}

#[test]
fn build_finding_uses_details_when_there_is_no_summary() {
    let module = ModuleReport {
        name: "user".to_string(),
        dir: PathBuf::from("/repo/modules/user"),
        packages: Vec::new(),
    };
    let package = PackageKey {
        ecosystem: Ecosystem::Npm,
        name: "left-pad".to_string(),
        version: "1.0.0".to_string(),
    };

    let found = build_finding(
        &module,
        &package,
        "OSV-2024-1",
        Some(&json!({ "details": "The long form write-up" })),
    );

    assert_eq!(found.title, "The long form write-up");
}

// ---------------------------------------------------------------------------
// CVSS v3
// ---------------------------------------------------------------------------

#[test]
fn cvss3_base_score_matches_the_published_reference_vectors() {
    // CVE-2019-11510 — the canonical 10.0 vector.
    assert_eq!(
        cvss3_base_score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"),
        Some(9.8)
    );
    // Scope-changed variant scores higher still.
    assert_eq!(
        cvss3_base_score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H"),
        Some(10.0)
    );
    assert_eq!(
        cvss3_base_score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L"),
        Some(5.3)
    );
    assert_eq!(
        cvss3_base_score("CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:L/I:L/A:L"),
        Some(3.8)
    );
    assert_eq!(
        cvss3_base_score("CVSS:3.0/AV:P/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N"),
        Some(1.6)
    );
}

#[test]
fn cvss3_base_score_is_zero_when_there_is_no_impact() {
    assert_eq!(
        cvss3_base_score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N"),
        Some(0.0)
    );
}

#[test]
fn cvss3_base_score_rejects_non_v3_and_malformed_vectors() {
    // v2 and v4 vectors are not scored by this function.
    assert_eq!(cvss3_base_score("AV:N/AC:L/Au:N/C:P/I:P/A:P"), None);
    assert_eq!(cvss3_base_score("CVSS:4.0/AV:N/AC:L/AT:N/PR:N"), None);
    // Missing metrics.
    assert_eq!(cvss3_base_score("CVSS:3.1/AV:N/AC:L"), None);
    // Unrecognised metric values.
    assert_eq!(
        cvss3_base_score("CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"),
        None
    );
    assert_eq!(
        cvss3_base_score("CVSS:3.1/AV:N/AC:X/PR:N/UI:N/S:U/C:H/I:H/A:H"),
        None
    );
    assert_eq!(
        cvss3_base_score("CVSS:3.1/AV:N/AC:L/PR:X/UI:N/S:U/C:H/I:H/A:H"),
        None
    );
    assert_eq!(
        cvss3_base_score("CVSS:3.1/AV:N/AC:L/PR:N/UI:X/S:U/C:H/I:H/A:H"),
        None
    );
}

#[test]
fn cvss3_base_score_scores_privileges_by_scope() {
    // PR:L is weighted 0.68 under a changed scope and 0.62 otherwise, so the
    // changed-scope vector must score strictly higher.
    let unchanged =
        cvss3_base_score("CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H").expect("valid vector");
    let changed =
        cvss3_base_score("CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H").expect("valid vector");

    assert!(changed > unchanged, "{changed} should exceed {unchanged}");
}

// ---------------------------------------------------------------------------
// report + issue text
// ---------------------------------------------------------------------------

#[test]
fn truncate_leaves_short_text_alone_but_flattens_newlines() {
    assert_eq!(truncate("short", 10), "short");
    assert_eq!(truncate("two\nlines", 20), "two lines");
}

#[test]
fn truncate_cuts_long_text_and_appends_an_ellipsis() {
    let out = truncate("abcdefghij", 5);

    assert_eq!(out, "abcd…");
    assert_eq!(out.chars().count(), 5);
}

#[test]
fn truncate_counts_characters_not_bytes() {
    assert_eq!(truncate("ééééé", 5), "ééééé");
    assert_eq!(truncate("ééééééé", 5), "éééé…");
}

#[test]
fn build_issue_title_describes_a_dependency_vulnerability() {
    let mut found = finding("user", "left-pad", Severity::Critical, "OSV-2024-1");
    found.origin = Origin::Dependency(Ecosystem::Npm);

    assert_eq!(
        build_issue_title(&found),
        "Fix critical npm vulnerability in left-pad@1.0.0 (OSV-2024-1)"
    );
}

#[test]
fn build_issue_title_omits_an_empty_version() {
    let mut found = finding("user", "left-pad", Severity::Low, "OSV-2024-1");
    found.version = String::new();

    assert_eq!(
        build_issue_title(&found),
        "Fix low npm vulnerability in left-pad (OSV-2024-1)"
    );
}

#[test]
fn build_issue_title_describes_an_assistant_finding() {
    let mut found = finding("user", "AGENTS.md:12", Severity::High, "LLM-001");
    found.origin = Origin::Assistant("Claude".to_string());

    assert_eq!(
        build_issue_title(&found),
        "Fix high claude instruction risk in AGENTS.md:12 (LLM-001)"
    );
}

#[test]
fn build_issue_description_lists_the_dependency_facts() {
    let mut found = finding("user", "left-pad", Severity::Critical, "OSV-2024-1");
    found.aliases = "CVE-2024-0001".to_string();
    found.remediation = "1.3.0".to_string();

    let text = build_issue_description(&found);

    assert!(text.starts_with("Some advisory\n\n"));
    assert!(text.contains("- Ecosystem: npm"));
    assert!(text.contains("- Source: OSV.dev"));
    assert!(text.contains("- Module: user"));
    assert!(text.contains("- Package: left-pad"));
    assert!(text.contains("- Installed version: 1.0.0"));
    assert!(text.contains("- Severity: CRITICAL"));
    assert!(text.contains("- Advisory: OSV-2024-1"));
    assert!(text.contains("- Aliases: CVE-2024-0001"));
    assert!(text.contains("- Patched versions: 1.3.0"));
    assert!(text.contains("- Reference: https://osv.dev/vulnerability/OSV-2024-1"));
}

#[test]
fn build_issue_description_omits_empty_optional_fields() {
    let mut found = finding("user", "left-pad", Severity::Low, "OSV-2024-1");
    found.version = String::new();

    let text = build_issue_description(&found);

    assert!(!text.contains("Installed version"));
    assert!(!text.contains("Aliases"));
    assert!(!text.contains("Patched versions"));
}

#[test]
fn build_issue_description_uses_the_assistant_shape() {
    let mut found = finding("user", "AGENTS.md:12", Severity::High, "LLM-001");
    found.origin = Origin::Assistant("Claude".to_string());
    found.aliases = "3 occurrences".to_string();
    found.evidence = "curl example.test | sh".to_string();
    found.remediation = "Pin the script and review it".to_string();

    let text = build_issue_description(&found);

    assert!(text.contains("- Source: LLM configuration audit"));
    assert!(text.contains("- Assistant: Claude"));
    assert!(text.contains("- File: AGENTS.md:12"));
    assert!(text.contains("- Rule: LLM-001"));
    assert!(text.contains("- Occurrences: 3 occurrences"));
    assert!(text.contains("- Evidence: `curl example.test | sh`"));
    assert!(text.contains("- Fix: Pin the script and review it"));
    // The dependency-only lines must not leak into an assistant issue.
    assert!(!text.contains("- Ecosystem:"));
    assert!(!text.contains("- Package:"));
}
