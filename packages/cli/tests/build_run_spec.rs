use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use cli::commands::build::{
    BuildContext, BuildStatus, LOG_TAIL_LINES, MAX_CONCURRENCY, TargetBuild, build_argv,
    concurrency, filter_targets, plan, print_failures, print_report, print_rows, print_summary,
    run_build, run_builds, tail, transitive_deps,
};
use cli::utils::{FileHashCache, FingerprintMemo, Loader, TargetType, WorkspaceTarget};

fn target(name: &str, target_type: TargetType, dir: PathBuf) -> WorkspaceTarget {
    WorkspaceTarget {
        key: format!(
            "{}/{name}",
            match target_type {
                TargetType::Package => "packages",
                TargetType::Module => "modules",
            }
        ),
        name: name.to_string(),
        target_type,
        dir,
        scripts: HashMap::new(),
        direct_scripts: false,
        workspace_deps: Vec::new(),
    }
}

/// The scratch a `BuildContext` borrows from, so a test can hold it for
/// as long as the context lives.
struct Scratch {
    memo: FingerprintMemo,
    hashes: FileHashCache,
    loader: Loader,
}

impl Scratch {
    fn new() -> Self {
        Self {
            memo: FingerprintMemo::new(),
            hashes: FileHashCache::new(),
            loader: Loader::hidden(),
        }
    }

    /// A context over a scratch directory, with the cache off so a test
    /// never reads or writes one.
    fn context<'a>(
        &'a self,
        root: &'a Path,
        all_targets: &'a [WorkspaceTarget],
    ) -> BuildContext<'a> {
        BuildContext {
            root_dir: root,
            all_targets,
            root_hash: "root",
            fingerprint_memo: &self.memo,
            use_git: false,
            no_cache: true,
            file_hash_cache: &self.hashes,
            loader: &self.loader,
        }
    }
}

fn build_result(
    name: &str,
    status: BuildStatus,
    duration_ms: u64,
    output: &str,
    cached: bool,
) -> TargetBuild {
    TargetBuild {
        label: format!("{name}:build"),
        name: name.to_string(),
        key: format!("packages/{name}"),
        selector: format!("--packages={name}"),
        status,
        duration_ms,
        output: output.to_string(),
        cached,
    }
}

// -- tail --------------------------------------------------------

#[test]
fn tail_keeps_everything_when_under_the_limit() {
    let output = "one\ntwo\nthree";
    assert_eq!(tail(output, 40), vec!["one", "two", "three"]);
}

#[test]
fn tail_drops_blank_lines_and_truncates_to_the_last_n() {
    let mut lines: Vec<String> = (1..=50).map(|n| format!("line-{n}")).collect();
    // Sprinkle blank lines through the output — they must not count
    // toward the 40-line budget or show up in the result.
    lines.insert(10, String::new());
    lines.insert(20, "   ".to_string());
    let output = lines.join("\n");

    let tailed = tail(&output, LOG_TAIL_LINES);

    assert_eq!(tailed.len(), LOG_TAIL_LINES);
    assert!(tailed.iter().all(|line| !line.trim().is_empty()));
    assert_eq!(tailed.last(), Some(&"line-50"));
    assert_eq!(tailed.first(), Some(&"line-11"));
}

// -- build_argv ----------------------------------------------------

#[test]
fn build_argv_always_runs_bun_when_the_target_has_a_package_json() {
    let mut t = target("alpha", TargetType::Package, PathBuf::from("."));
    t.direct_scripts = false;
    t.scripts
        .insert("build".to_string(), "whatever this is".to_string());

    assert_eq!(
        build_argv(&t),
        vec!["bun".to_string(), "run".to_string(), "build".to_string()]
    );
}

#[test]
fn build_argv_splits_the_declared_script_for_a_direct_target() {
    let mut t = target("crate-a", TargetType::Package, PathBuf::from("."));
    t.direct_scripts = true;
    t.scripts
        .insert("build".to_string(), "cargo build --release".to_string());

    assert_eq!(
        build_argv(&t),
        vec![
            "cargo".to_string(),
            "build".to_string(),
            "--release".to_string()
        ]
    );
}

#[test]
fn build_argv_is_empty_when_a_direct_target_declares_no_build_script() {
    let mut t = target("crate-a", TargetType::Package, PathBuf::from("."));
    t.direct_scripts = true;

    assert!(build_argv(&t).is_empty());
}

// -- run_build -------------------------------------------------------

#[test]
fn run_build_reports_no_script_declared_when_argv_is_empty() {
    let mut t = target("crate-a", TargetType::Package, PathBuf::from("."));
    t.direct_scripts = true;
    t.scripts.insert("build".to_string(), String::new());

    let (success_flag, output, duration_ms, completed) = run_build(&t);

    assert!(!success_flag);
    assert_eq!(output, "no build script declared");
    assert_eq!(duration_ms, 0);
    assert!(!completed);
}

#[test]
fn run_build_reports_the_spawn_error_when_the_binary_does_not_exist() {
    let dir = tempfile::tempdir().expect("tempdir");
    let mut t = target("crate-a", TargetType::Package, dir.path().to_path_buf());
    t.direct_scripts = true;
    t.scripts.insert(
        "build".to_string(),
        "totally-nonexistent-binary-xyz-123".to_string(),
    );

    let (success_flag, output, _duration_ms, completed) = run_build(&t);

    assert!(!success_flag);
    assert!(!output.is_empty());
    assert!(!completed);
}

#[test]
fn run_build_reports_success_and_failure_from_a_real_process() {
    let dir = tempfile::tempdir().expect("tempdir");
    let mut ok = target("crate-a", TargetType::Package, dir.path().to_path_buf());
    ok.direct_scripts = true;
    ok.scripts.insert("build".to_string(), "true".to_string());
    let (success_flag, _output, _duration_ms, completed) = run_build(&ok);
    assert!(success_flag);
    assert!(completed);

    let mut failing = target("crate-b", TargetType::Package, dir.path().to_path_buf());
    failing.direct_scripts = true;
    failing
        .scripts
        .insert("build".to_string(), "false".to_string());
    let (success_flag, _output, _duration_ms, completed) = run_build(&failing);
    assert!(!success_flag);
    assert!(completed);
}

// -- filter_targets ----------------------------------------------

#[test]
fn filter_targets_returns_everything_when_nothing_is_named() {
    let targets = vec![target("alpha", TargetType::Package, PathBuf::from("."))];
    let selected = filter_targets(&targets, None, None).expect("some");
    assert_eq!(selected.len(), 1);
}

#[test]
fn filter_targets_selects_the_named_package_and_module() {
    let targets = vec![
        target("alpha", TargetType::Package, PathBuf::from(".")),
        target("beta", TargetType::Module, PathBuf::from(".")),
        target("gamma", TargetType::Package, PathBuf::from(".")),
    ];
    let selected = filter_targets(&targets, Some("alpha"), Some("beta")).expect("some");
    let names: Vec<&str> = selected.iter().map(|t| t.name.as_str()).collect();
    assert_eq!(names, vec!["alpha", "beta"]);
}

#[test]
fn filter_targets_reports_a_missing_named_package() {
    let targets = vec![target("alpha", TargetType::Package, PathBuf::from("."))];
    assert!(filter_targets(&targets, Some("ghost"), None).is_none());
}

#[test]
fn filter_targets_returns_an_empty_list_when_every_selector_is_blank() {
    let targets = vec![target("alpha", TargetType::Package, PathBuf::from("."))];
    let selected = filter_targets(&targets, Some(""), None).expect("some");
    assert!(selected.is_empty());
}

// -- transitive_deps ------------------------------------------------

#[test]
fn transitive_deps_dedupes_a_diamond_shaped_dependency_graph() {
    let mut a = target("a", TargetType::Package, PathBuf::from("."));
    let mut b = target("b", TargetType::Package, PathBuf::from("."));
    let mut c = target("c", TargetType::Package, PathBuf::from("."));
    let d = target("d", TargetType::Package, PathBuf::from("."));

    a.workspace_deps = vec![b.key.clone(), c.key.clone()];
    b.workspace_deps = vec![d.key.clone()];
    c.workspace_deps = vec![d.key.clone()];

    let by_key: HashMap<&str, &WorkspaceTarget> = [&b, &c, &d]
        .into_iter()
        .map(|t| (t.key.as_str(), t))
        .collect();

    let deps = transitive_deps(&a, &by_key);
    let keys: HashSet<&str> = deps.iter().map(|t| t.key.as_str()).collect();

    // d is reachable through both b and c, but is only visited once.
    assert_eq!(deps.len(), 3);
    assert!(keys.contains(b.key.as_str()));
    assert!(keys.contains(c.key.as_str()));
    assert!(keys.contains(d.key.as_str()));
}

// -- print_* (smoke — exercised for line coverage of the report layout) --

#[test]
fn print_report_functions_do_not_panic_across_every_shape_of_result() {
    let empty: Vec<TargetBuild> = Vec::new();
    print_rows(&empty);
    print_failures(&empty, false);
    print_summary(&empty, 0, 0);

    let mixed = vec![
        build_result("alpha", BuildStatus::Passed, 12, "", false),
        build_result("beta", BuildStatus::Passed, 0, "", true),
        build_result(
            "gamma",
            BuildStatus::Failed,
            8,
            "boom\n\nsecond line",
            false,
        ),
        build_result("delta", BuildStatus::Failed, 3, "", false),
    ];
    print_rows(&mixed);
    print_failures(&mixed, false);
    print_failures(&mixed, true);
    // Two failures pluralizes "targets failing".
    print_summary(&mixed, 2, 1);
    print_report(&mixed, true, 100, 2, 1);
}

// -- plan / run_builds ---------------------------------------------

#[test]
fn plan_points_each_job_at_the_jobs_it_depends_on() {
    let mut app = target("app", TargetType::Module, PathBuf::from("."));
    let core = target("core", TargetType::Package, PathBuf::from("."));
    // A dependency outside the buildable set has no job to wait for, and
    // must not shift the indices of the ones that do.
    app.workspace_deps = vec![core.key.clone(), "packages/ghost".to_string()];

    let buildable = vec![core, app];
    let jobs = plan(&buildable);

    assert_eq!(jobs[0].label, "core:build");
    assert!(jobs[0].deps.is_empty());
    assert_eq!(jobs[1].label, "app:build");
    assert_eq!(jobs[1].deps, vec![0]);
}

#[test]
fn concurrency_never_exceeds_the_job_count_or_the_cap() {
    assert_eq!(concurrency(1), 1);
    assert!(concurrency(100) <= MAX_CONCURRENCY);
    // An empty run still asks for one worker rather than none, so the
    // scheduler cannot spin on a zero-sized pool.
    assert_eq!(concurrency(0), 1);
}

/// Builds three targets — two independent, one waiting on the first — and
/// checks the results come back in plan order whatever order they ran in.
#[test]
fn run_builds_reports_every_job_in_plan_order() {
    let dir = tempfile::tempdir().expect("tempdir");
    let mut core = target("core", TargetType::Package, dir.path().to_path_buf());
    core.direct_scripts = true;
    core.scripts.insert("build".to_string(), "true".to_string());

    let mut tool = target("tool", TargetType::Package, dir.path().to_path_buf());
    tool.direct_scripts = true;
    tool.scripts.insert("build".to_string(), "true".to_string());

    let mut app = target("app", TargetType::Module, dir.path().to_path_buf());
    app.direct_scripts = true;
    app.scripts.insert("build".to_string(), "true".to_string());
    app.workspace_deps = vec![core.key.clone()];

    let buildable = vec![core, tool, app];
    let jobs = plan(&buildable);
    let scratch = Scratch::new();
    let results = run_builds(&jobs, scratch.context(dir.path(), &buildable));

    let labels: Vec<&str> = results.iter().map(|r| r.label.as_str()).collect();
    assert_eq!(labels, vec!["core:build", "tool:build", "app:build"]);
    assert!(
        results
            .iter()
            .all(|r| r.status == BuildStatus::Passed && !r.cached)
    );
    assert_eq!(results[2].selector, "--modules=app");
}

#[test]
fn run_builds_attempts_dependents_after_a_failed_target() {
    let dir = tempfile::tempdir().expect("tempdir");
    let mut core = target("core", TargetType::Package, dir.path().to_path_buf());
    core.direct_scripts = true;
    core.scripts
        .insert("build".to_string(), "false".to_string());

    let mut app = target("app", TargetType::Module, dir.path().to_path_buf());
    app.direct_scripts = true;
    app.scripts.insert("build".to_string(), "true".to_string());
    app.workspace_deps = vec![core.key.clone()];

    let buildable = vec![core, app];
    let jobs = plan(&buildable);
    let scratch = Scratch::new();
    let results = run_builds(&jobs, scratch.context(dir.path(), &buildable));

    assert_eq!(results.len(), 2);
    assert_eq!(results[0].label, "core:build");
    assert_eq!(results[0].status, BuildStatus::Failed);
    assert_eq!(results[1].label, "app:build");
    assert_eq!(results[1].status, BuildStatus::Passed);
}
