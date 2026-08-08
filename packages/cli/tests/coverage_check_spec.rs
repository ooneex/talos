use std::fs;
use std::path::{Path, PathBuf};

use clap::Parser;
use cli::commands::coverage_check::cache::{Fingerprints, read, write};
use cli::commands::coverage_check::{
    CoverageAudit, CoverageCheckArgs, FileCoverage, ModuleCoverage, RunStatus, Runner, audit,
    parse_counts, parse_lcov, parse_table, runner, skip_reason,
};
use cli::commands::project_check::cache::FileHashes;
use cli::commands::project_check::modules::discover_modules;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: CoverageCheckArgs,
}

const TABLE: &str = "\
bun test v1.3.14 (0d9b296a)
--------------------|---------|---------|-------------------
File                | % Funcs | % Lines | Uncovered Line #s
--------------------|---------|---------|-------------------
All files           |   83.33 |   99.61 |
 src/Hour.ts        |   75.00 |  100.00 |
 src/decompose.ts   |  100.00 |   97.64 | 152-154, 160
--------------------|---------|---------|-------------------

 93 pass
 0 fail
 93 expect() calls
Ran 93 tests across 4 files. [11.00ms]
";

fn module(label: &str, status: RunStatus, lines: f64, functions: f64) -> ModuleCoverage {
    ModuleCoverage {
        name: label.rsplit('/').next().unwrap_or(label).to_string(),
        label: label.to_string(),
        dir: PathBuf::from(label),
        status,
        passed: 10,
        failed: 0,
        lines,
        functions,
        files: Vec::new(),
        duration_ms: 0,
        output: String::new(),
        cached: false,
    }
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

#[test]
fn parses_with_no_arguments() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no argument is valid");
    assert!(!cli.args.issues);
    assert!(!cli.args.logs);
    assert!(!cli.args.no_cache);
    assert!(!cli.args.strict);
    assert!(cli.args.threshold.is_none());
}

#[test]
fn parses_every_flag() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--issues",
        "--logs",
        "--modules=user,billing",
        "--packages=color",
        "--threshold=75.5",
        "--concurrency=2",
        "--no-cache",
        "--strict",
        "--cwd=/tmp/app",
    ])
    .expect("every flag parses");

    assert!(cli.args.issues);
    assert!(cli.args.logs);
    assert!(cli.args.no_cache);
    assert!(cli.args.strict);
    assert_eq!(cli.args.modules.as_deref(), Some("user,billing"));
    assert_eq!(cli.args.packages.as_deref(), Some("color"));
    assert_eq!(cli.args.threshold, Some(75.5));
    assert_eq!(cli.args.concurrency, Some(2));
    assert_eq!(cli.args.cwd.as_deref(), Some("/tmp/app"));
}

#[test]
fn rejects_a_non_numeric_threshold() {
    assert!(TestCli::try_parse_from(["talos", "--threshold=high"]).is_err());
}

// ---------------------------------------------------------------------------
// Test tallies
// ---------------------------------------------------------------------------

#[test]
fn reads_the_pass_and_fail_tally() {
    assert_eq!(parse_counts(TABLE), (93, 0));
    assert_eq!(parse_counts(" 4 pass\n 2 fail\n 1 skip\n"), (4, 2));
}

#[test]
fn ignores_the_expect_call_tally() {
    // `93 expect() calls` counts assertions, and must never be read as tests.
    assert_eq!(parse_counts(" 0 pass\n 93 expect() calls\n"), (0, 0));
}

#[test]
fn reads_no_tally_from_output_without_one() {
    assert_eq!(
        parse_counts("error: Could not resolve: \"bun:test\"\n"),
        (0, 0)
    );
}

// ---------------------------------------------------------------------------
// Coverage table
// ---------------------------------------------------------------------------

#[test]
fn reads_the_coverage_table() {
    let report = parse_table(TABLE).expect("the table parses");

    assert_eq!(report.lines, 99.61);
    assert_eq!(report.functions, 83.33);
    assert_eq!(report.files.len(), 2);
    assert_eq!(report.files[0].path, "src/Hour.ts");
    assert_eq!(report.files[0].functions, 75.0);
    assert!(report.files[0].uncovered.is_empty());
    assert_eq!(report.files[1].uncovered, vec!["152-154", "160"]);
}

#[test]
fn reads_no_table_from_output_without_one() {
    assert!(parse_table(" 1 pass\n 0 fail\nRan 1 test across 1 file.\n").is_none());
}

// ---------------------------------------------------------------------------
// lcov fallback
// ---------------------------------------------------------------------------

#[test]
fn reads_an_lcov_report() {
    let report = parse_lcov(
        "TN:\nSF:src/math.ts\nFNF:4\nFNH:3\nDA:1,3\nDA:2,0\nDA:3,0\nDA:4,0\nDA:9,0\nLF:5\nLH:1\nend_of_record\n",
    )
    .expect("the lcov report parses");

    assert_eq!(report.files.len(), 1);
    assert_eq!(report.files[0].path, "src/math.ts");
    assert_eq!(report.files[0].functions, 75.0);
    assert_eq!(report.files[0].lines, 20.0);
    // Consecutive uncovered lines collapse into a range, isolated ones do not.
    assert_eq!(report.files[0].uncovered, vec!["2-4", "9"]);
    assert_eq!(report.lines, 20.0);
}

#[test]
fn reads_no_lcov_report_from_an_empty_file() {
    assert!(parse_lcov("").is_none());
}

// ---------------------------------------------------------------------------
// Runner selection
// ---------------------------------------------------------------------------

/// A workspace holding one bun package with tests.
fn mixed_workspace() -> tempfile::TempDir {
    let temp = tempfile::tempdir().expect("create temp dir");
    let root = temp.path();
    fs::write(root.join("package.json"), "{\"name\":\"app\"}").expect("write the root manifest");

    let bun = root.join("packages").join("color");
    fs::create_dir_all(bun.join("tests")).expect("create the bun package");
    // A `src/` is enough to be discovered, so dropping the manifest in a test
    // leaves a member behind rather than nothing at all.
    fs::create_dir_all(bun.join("src")).expect("create the sources");
    fs::write(bun.join("package.json"), "{\"name\":\"@app/color\"}").expect("write the manifest");

    temp
}

fn member(root: &Path, name: &str) -> cli::commands::project_check::modules::WorkspaceModule {
    discover_modules(root)
        .into_iter()
        .find(|module| module.name == name)
        .unwrap_or_else(|| panic!("{name} is discovered"))
}

#[test]
fn a_package_is_always_measured_by_bun() {
    let temp = mixed_workspace();
    let root = temp.path();

    assert_eq!(runner(&member(root, "color")), Runner::Bun);
}

#[test]
fn a_package_with_tests_and_a_manifest_is_run_rather_than_skipped() {
    let temp = mixed_workspace();
    let root = temp.path();

    assert_eq!(skip_reason(&member(root, "color")), None);
}

#[test]
fn a_package_without_a_manifest_is_skipped() {
    let temp = mixed_workspace();
    let root = temp.path();
    fs::remove_file(root.join("packages").join("color").join("package.json"))
        .expect("drop the manifest");

    assert_eq!(
        skip_reason(&member(root, "color")),
        Some("no package.json".to_string())
    );
}

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

#[test]
fn a_module_is_covered_only_when_both_rates_clear_the_threshold() {
    let covered = module("modules/user", RunStatus::Passed, 95.0, 92.0);
    let thin = module("modules/billing", RunStatus::Passed, 95.0, 80.0);
    let red = module("modules/order", RunStatus::Failed, 99.0, 99.0);

    assert!(covered.is_covered(90.0));
    assert!(!thin.is_covered(90.0));
    assert!(!red.is_covered(90.0));
}

#[test]
fn low_files_are_ranked_worst_first() {
    let mut module = module("modules/user", RunStatus::Passed, 70.0, 70.0);
    module.files = vec![
        FileCoverage {
            path: "src/a.ts".to_string(),
            lines: 100.0,
            functions: 100.0,
            uncovered: Vec::new(),
        },
        FileCoverage {
            path: "src/b.ts".to_string(),
            lines: 80.0,
            functions: 100.0,
            uncovered: vec!["12".to_string()],
        },
        FileCoverage {
            path: "src/c.ts".to_string(),
            lines: 40.0,
            functions: 50.0,
            uncovered: vec!["3-9".to_string()],
        },
    ];

    let low: Vec<&str> = module
        .low_files(90.0)
        .iter()
        .map(|file| file.path.as_str())
        .collect();
    assert_eq!(low, vec!["src/c.ts", "src/b.ts"]);
}

#[test]
fn an_audit_separates_broken_suites_from_thin_ones() {
    let audit = CoverageAudit {
        modules: vec![
            module("modules/user", RunStatus::Passed, 95.0, 95.0),
            module("modules/billing", RunStatus::Passed, 60.0, 70.0),
            module("modules/order", RunStatus::Failed, 0.0, 0.0),
            module(
                "packages/cli",
                RunStatus::Skipped("no package.json".to_string()),
                0.0,
                0.0,
            ),
        ],
        threshold: 90.0,
    };

    assert_eq!(audit.ran().len(), 3);
    assert_eq!(audit.broken().len(), 1);
    assert_eq!(audit.under().len(), 1);
    assert_eq!(audit.under()[0].label, "modules/billing");
    // Skipped modules never drag the average down.
    assert!((audit.lines() - (95.0 + 60.0) / 3.0).abs() < 0.001);
}

#[test]
fn a_module_with_no_code_to_measure_never_moves_the_average() {
    let audit = CoverageAudit {
        modules: vec![
            module("modules/user", RunStatus::Passed, 80.0, 80.0),
            // A suite of type assertions passes without covering a single line.
            module("packages/types", RunStatus::Unmeasured, 0.0, 0.0),
        ],
        threshold: 90.0,
    };

    assert_eq!(audit.ran().len(), 2);
    assert_eq!(audit.measured().len(), 1);
    assert_eq!(audit.lines(), 80.0);
    assert_eq!(audit.broken().len(), 0);
    // Nothing measured is nothing to raise, so it is never reported as thin.
    assert_eq!(audit.under().len(), 1);
    assert_eq!(audit.under()[0].label, "modules/user");
}

#[test]
fn a_run_fails_on_a_broken_suite_and_only_under_strict_on_a_thin_one() {
    let broken = CoverageAudit {
        modules: vec![module("modules/order", RunStatus::Failed, 0.0, 0.0)],
        threshold: 90.0,
    };
    let thin = CoverageAudit {
        modules: vec![module("modules/billing", RunStatus::Passed, 60.0, 70.0)],
        threshold: 90.0,
    };
    let clean = CoverageAudit {
        modules: vec![module("modules/user", RunStatus::Passed, 95.0, 95.0)],
        threshold: 90.0,
    };

    assert!(broken.is_failure(false));
    assert!(broken.is_failure(true));
    assert!(!thin.is_failure(false));
    assert!(thin.is_failure(true));
    assert!(!clean.is_failure(true));
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/// A workspace of two modules, the second depending on the first.
fn workspace() -> tempfile::TempDir {
    let temp = tempfile::tempdir().expect("create temp dir");
    let root = temp.path();

    fs::write(root.join("package.json"), "{\"name\":\"app\"}").expect("write the root manifest");
    for (group, name, deps) in [
        ("packages", "color", "{}"),
        ("modules", "user", "{\"@app/color\":\"workspace:*\"}"),
    ] {
        let dir = root.join(group).join(name);
        fs::create_dir_all(dir.join("src")).expect("create the module");
        fs::write(
            dir.join("package.json"),
            format!("{{\"name\":\"@app/{name}\",\"dependencies\":{deps}}}"),
        )
        .expect("write the manifest");
        fs::write(dir.join("src").join("index.ts"), "export const a = 1;\n")
            .expect("write a source file");
    }

    temp
}

fn fingerprints(root: &Path) -> Fingerprints {
    Fingerprints::build(root, &discover_modules(root), &FileHashes::load(root))
}

#[test]
fn an_entry_is_reused_only_for_the_tree_it_was_measured_from() {
    let temp = workspace();
    let root = temp.path();
    let before = fingerprints(root);

    let mut coverage = module("modules/user", RunStatus::Passed, 95.0, 91.0);
    coverage.files = vec![FileCoverage {
        path: "src/index.ts".to_string(),
        lines: 95.0,
        functions: 91.0,
        uncovered: vec!["12-14".to_string()],
    }];
    write(root, &coverage, &before.inputs("modules/user"));

    let entry = read(root, "modules/user").expect("the entry was written");
    assert!(entry.matches(&before.inputs("modules/user")));

    let restored = entry
        .coverage("user", "modules/user", &root.join("modules/user"))
        .expect("a stored status restores");
    assert_eq!(restored.status, RunStatus::Passed);
    assert_eq!(restored.lines, 95.0);
    assert_eq!(restored.files.len(), 1);
    assert_eq!(restored.files[0].uncovered, vec!["12-14"]);
    // A replayed suite is never counted as one that ran.
    assert!(restored.cached);

    fs::write(
        root.join("modules/user/src/index.ts"),
        "export const a = 2;\n",
    )
    .expect("edit the module");
    assert!(!entry.matches(&fingerprints(root).inputs("modules/user")));
}

#[test]
fn an_entry_is_dropped_when_a_workspace_dependency_changes() {
    let temp = workspace();
    let root = temp.path();
    let before = fingerprints(root);
    let inputs = before.inputs("modules/user");

    // The module reads its dependency, so the dependency is one of its inputs.
    assert!(inputs.contains_key("packages/color"));

    fs::write(
        root.join("packages/color/src/index.ts"),
        "export const a = 2;\n",
    )
    .expect("edit the dependency");
    let after = fingerprints(root);

    assert_ne!(inputs, after.inputs("modules/user"));
    // Nothing the dependency does moves what a module it never imports reads.
    assert_eq!(
        before.inputs("packages/color").get("modules/user"),
        after.inputs("packages/color").get("modules/user")
    );
}

#[test]
fn an_entry_is_dropped_when_a_root_file_a_suite_loads_changes() {
    let temp = workspace();
    let root = temp.path();
    let before = fingerprints(root).inputs("modules/user");

    fs::write(root.join("README.md"), "# app\n").expect("write a document");
    assert_eq!(before, fingerprints(root).inputs("modules/user"));

    fs::write(root.join("tsconfig.json"), "{\"compilerOptions\":{}}")
        .expect("write the typescript configuration");
    assert_ne!(before, fingerprints(root).inputs("modules/user"));
}

#[test]
fn a_suite_that_never_reported_is_never_stored() {
    let temp = workspace();
    let root = temp.path();
    let inputs = fingerprints(root).inputs("modules/user");

    let errored = module(
        "modules/user",
        RunStatus::Errored("could not run bun".to_string()),
        0.0,
        0.0,
    );
    write(root, &errored, &inputs);

    assert!(read(root, "modules/user").is_none());
}

#[test]
fn an_empty_workspace_reports_nothing_to_run() {
    let temp = tempfile::tempdir().expect("create temp dir");

    let outcome = audit(temp.path(), None, None, None, Some(1), true, true);
    assert!(
        outcome
            .expect_err("an empty workspace holds no suite")
            .starts_with("No module found to run")
    );
}

// ---------------------------------------------------------------------------
// formatting, ranking and issue-text helpers
// ---------------------------------------------------------------------------

use cli::commands::coverage_check::{
    build_issue_description, build_issue_title, collapse_ranges, coverage_dir, label, mean,
    percent, priority, rank, resolve_concurrency, sort_modules, tail, trim_percent, truncate,
};

fn file(path: &str, lines: f64, functions: f64, uncovered: &[&str]) -> FileCoverage {
    FileCoverage {
        path: path.to_string(),
        lines,
        functions,
        uncovered: uncovered.iter().map(|s| s.to_string()).collect(),
    }
}

#[test]
fn resolve_concurrency_honours_an_explicit_request() {
    assert_eq!(resolve_concurrency(Some(3)), 3);
    // Never zero — that would run nothing at all.
    assert_eq!(resolve_concurrency(Some(0)), 1);
}

#[test]
fn resolve_concurrency_defaults_within_the_cap() {
    let resolved = resolve_concurrency(None);

    assert!(
        (1..=8).contains(&resolved),
        "{resolved} should be capped at 8"
    );
}

#[test]
fn rank_puts_broken_suites_before_thin_ones() {
    assert!(rank(&RunStatus::Failed) < rank(&RunStatus::Errored("x".into())));
    assert!(rank(&RunStatus::Errored("x".into())) < rank(&RunStatus::Passed));
    assert!(rank(&RunStatus::Passed) < rank(&RunStatus::Unmeasured));
    assert!(rank(&RunStatus::Unmeasured) < rank(&RunStatus::Skipped("x".into())));
}

#[test]
fn sort_modules_orders_by_status_then_coverage_then_label() {
    let mut modules = vec![
        module("packages/z", RunStatus::Passed, 90.0, 90.0),
        module("modules/a", RunStatus::Skipped("no tests".into()), 0.0, 0.0),
        module("modules/b", RunStatus::Passed, 40.0, 40.0),
        module("modules/c", RunStatus::Failed, 80.0, 80.0),
        module("modules/d", RunStatus::Passed, 40.0, 20.0),
    ];

    sort_modules(&mut modules);

    let order: Vec<&str> = modules.iter().map(|m| m.label.as_str()).collect();
    assert_eq!(
        order,
        [
            "modules/c",
            "modules/d",
            "modules/b",
            "packages/z",
            "modules/a"
        ]
    );
}

#[test]
fn collapse_ranges_folds_consecutive_numbers() {
    assert_eq!(collapse_ranges(&[41, 42, 43, 66]), ["41-43", "66"]);
    assert_eq!(collapse_ranges(&[1]), ["1"]);
    assert_eq!(collapse_ranges(&[1, 3, 5]), ["1", "3", "5"]);
    assert!(collapse_ranges(&[]).is_empty());
}

#[test]
fn percent_treats_nothing_to_cover_as_fully_covered() {
    assert_eq!(percent(0, 0), 100.0);
    assert_eq!(percent(1, 2), 50.0);
    assert_eq!(percent(0, 4), 0.0);
}

#[test]
fn mean_of_no_values_is_zero() {
    assert_eq!(mean([].into_iter()), 0.0);
    assert_eq!(mean([10.0, 20.0, 30.0].into_iter()), 20.0);
}

#[test]
fn trim_percent_drops_a_pointless_decimal() {
    assert_eq!(trim_percent(92.0), "92");
    assert_eq!(trim_percent(92.02), "92");
    assert_eq!(trim_percent(92.5), "92.5");
    assert_eq!(trim_percent(0.0), "0");
}

#[test]
fn truncate_cuts_long_text_by_characters() {
    assert_eq!(truncate("short", 10), "short");
    assert_eq!(truncate("abcdefghij", 5), "abcd…");
    assert_eq!(truncate("ééééééé", 5), "éééé…");
}

#[test]
fn tail_returns_the_last_non_empty_lines() {
    let output = "one\n\ntwo\n   \nthree\nfour\n";

    assert_eq!(tail(output, 2), ["three", "four"]);
    // Asking for more than there is returns everything.
    assert_eq!(tail(output, 99), ["one", "two", "three", "four"]);
}

#[test]
fn coverage_dir_reads_the_bunfig_override() {
    let dir = std::env::temp_dir().join(format!(
        "talos-coverage-dir-{}-{:?}",
        std::process::id(),
        std::thread::current().id()
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("temp dir should be creatable");

    // No bunfig at all falls back to the default.
    assert_eq!(coverage_dir(&dir), "coverage");

    fs::write(
        dir.join("bunfig.toml"),
        "[test]\ncoverageDir = \"var/cov\"\n",
    )
    .unwrap();
    assert_eq!(coverage_dir(&dir), "var/cov");

    // An empty value is no override.
    fs::write(dir.join("bunfig.toml"), "[test]\ncoverageDir = \"\"\n").unwrap();
    assert_eq!(coverage_dir(&dir), "coverage");

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn label_calls_a_broken_suite_a_bug_and_a_thin_one_testing() {
    assert_eq!(label(&module("m", RunStatus::Failed, 90.0, 90.0)), "Bug");
    assert_eq!(
        label(&module("m", RunStatus::Errored("boom".into()), 0.0, 0.0)),
        "Bug"
    );
    assert_eq!(
        label(&module("m", RunStatus::Passed, 40.0, 40.0)),
        "Testing"
    );
}

#[test]
fn priority_scales_with_how_wide_the_gap_is() {
    assert_eq!(
        priority(&module("m", RunStatus::Failed, 90.0, 90.0), 90.0),
        "Urgent"
    );
    // More than 25 points short of the threshold.
    assert_eq!(
        priority(&module("m", RunStatus::Passed, 60.0, 60.0), 90.0),
        "High"
    );
    assert_eq!(
        priority(&module("m", RunStatus::Passed, 80.0, 80.0), 90.0),
        "Medium"
    );
}

#[test]
fn build_issue_title_counts_failing_tests() {
    let mut one = module("modules/user", RunStatus::Failed, 0.0, 0.0);
    one.failed = 1;
    assert_eq!(build_issue_title(&one, 90.0), "Fix 1 failing test in user");

    let mut many = module("modules/user", RunStatus::Failed, 0.0, 0.0);
    many.failed = 3;
    assert_eq!(
        build_issue_title(&many, 90.0),
        "Fix 3 failing tests in user"
    );
}

#[test]
fn build_issue_title_names_the_reason_a_suite_errored() {
    let errored = module(
        "modules/user",
        RunStatus::Errored("no test ran".into()),
        0.0,
        0.0,
    );

    assert_eq!(
        build_issue_title(&errored, 90.0),
        "Fix the user test suite (no test ran)"
    );
}

#[test]
fn build_issue_title_states_the_coverage_gap() {
    let thin = module("modules/user", RunStatus::Passed, 43.4, 54.25);

    assert_eq!(
        build_issue_title(&thin, 90.0),
        "Raise user test coverage to 90% (currently 43.4% lines, 54.2% functions)"
    );
}

#[test]
fn build_issue_description_lists_the_least_covered_files() {
    let mut thin = module("modules/user", RunStatus::Passed, 43.4, 54.3);
    thin.files = vec![
        file("src/a.rs", 10.0, 20.0, &["4-9", "12"]),
        file("src/b.rs", 95.0, 95.0, &[]),
        file("src/c.rs", 50.0, 50.0, &[]),
    ];

    let text = build_issue_description(&thin, 90.0);

    assert!(text.contains("covers 43.4% of its lines and 54.3% of its functions"));
    assert!(text.contains("- Module: modules/user"));
    assert!(text.contains("- Threshold: 90%"));
    assert!(text.contains("- Command: `talos coverage:check --modules=user`"));
    assert!(text.contains("Least covered files:"));
    // Worst first, and the file already over the threshold is not listed.
    let a = text.find("`src/a.rs`").expect("worst file is listed");
    let c = text
        .find("`src/c.rs`")
        .expect("second-worst file is listed");
    assert!(a < c);
    assert!(!text.contains("`src/b.rs`"));
    assert!(text.contains("(uncovered 4-9, 12)"));
}

#[test]
fn build_issue_description_describes_a_failing_suite() {
    let mut failed = module("modules/user", RunStatus::Failed, 0.0, 0.0);
    failed.failed = 2;

    let text = build_issue_description(&failed, 90.0);

    assert!(text.contains("`bun test` reports 2 failing tests in modules/user."));
    assert!(text.contains("- Tests: 10 passed, 2 failed"));
}

#[test]
fn build_issue_description_describes_an_errored_suite() {
    let errored = module(
        "modules/user",
        RunStatus::Errored("no test ran".into()),
        0.0,
        0.0,
    );

    let text = build_issue_description(&errored, 90.0);

    assert!(text.contains("could not report coverage for modules/user: no test ran."));
    // With no measured files there is nothing to list.
    assert!(!text.contains("Least covered files:"));
}
