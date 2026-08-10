use clap::Parser;
use cli::commands::workspace_check::{
    WorkspaceCheckArgs, build_args, coverage_args, install_args, lint_args, performance_args, score,
};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: WorkspaceCheckArgs,
}

#[test]
fn workspace_check_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--packages",
        "core",
        "--modules",
        "user",
        "--logs",
        "--no-cache",
        "--threshold",
        "85",
        "--concurrency",
        "4",
        "--strict",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.packages.as_deref(), Some("core"));
    assert_eq!(cli.args.modules.as_deref(), Some("user"));
    assert!(cli.args.logs);
    assert!(cli.args.no_cache);
    assert_eq!(cli.args.threshold, Some(85.0));
    assert_eq!(cli.args.concurrency, Some(4));
    assert!(cli.args.strict);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn workspace_check_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.packages.is_none());
    assert!(cli.args.modules.is_none());
    assert!(!cli.args.logs);
    assert!(!cli.args.no_cache);
    assert!(cli.args.threshold.is_none());
    assert!(cli.args.concurrency.is_none());
    assert!(!cli.args.strict);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn workspace_check_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn workspace_check_builds_the_install_arguments() {
    let args = WorkspaceCheckArgs {
        packages: Some("core".to_string()),
        modules: Some("user".to_string()),
        logs: true,
        no_cache: true,
        threshold: Some(85.0),
        concurrency: Some(4),
        strict: true,
        cwd: Some("./here".to_string()),
    };

    let install = install_args(&args);

    assert!(!install.force);
    assert!(install.audit_level.is_none());
    assert!(!install.skip_audit);
    assert!(install.no_cache);
    assert_eq!(install.cwd.as_deref(), Some("./here"));
}

#[test]
fn workspace_check_builds_the_build_arguments() {
    let args = WorkspaceCheckArgs {
        packages: Some("core".to_string()),
        modules: Some("user".to_string()),
        logs: true,
        no_cache: true,
        threshold: Some(85.0),
        concurrency: Some(4),
        strict: true,
        cwd: Some("./here".to_string()),
    };

    let build = build_args(&args);

    assert_eq!(build.packages.as_deref(), Some("core"));
    assert_eq!(build.modules.as_deref(), Some("user"));
    assert!(build.logs);
    assert!(build.no_cache);
    assert_eq!(build.cwd.as_deref(), Some("./here"));
}

#[test]
fn workspace_check_builds_the_lint_arguments() {
    let args = WorkspaceCheckArgs {
        packages: Some("core".to_string()),
        modules: Some("user".to_string()),
        logs: true,
        no_cache: true,
        threshold: Some(85.0),
        concurrency: Some(4),
        strict: true,
        cwd: Some("./here".to_string()),
    };

    let lint = lint_args(&args);

    assert_eq!(lint.packages.as_deref(), Some("core"));
    assert_eq!(lint.modules.as_deref(), Some("user"));
    assert!(lint.logs);
    assert!(lint.no_cache);
    assert_eq!(lint.cwd.as_deref(), Some("./here"));
}

#[test]
fn workspace_check_builds_the_coverage_arguments() {
    let args = WorkspaceCheckArgs {
        packages: Some("core".to_string()),
        modules: Some("user".to_string()),
        logs: true,
        no_cache: true,
        threshold: Some(85.0),
        concurrency: Some(4),
        strict: true,
        cwd: Some("./here".to_string()),
    };

    let coverage = coverage_args(&args);

    assert!(!coverage.issues);
    assert_eq!(coverage.packages.as_deref(), Some("core"));
    assert_eq!(coverage.modules.as_deref(), Some("user"));
    assert!(coverage.logs);
    assert!(coverage.no_cache);
    assert_eq!(coverage.threshold, Some(85.0));
    assert_eq!(coverage.concurrency, Some(4));
    assert!(coverage.strict);
    assert_eq!(coverage.cwd.as_deref(), Some("./here"));
}

#[test]
fn workspace_check_builds_the_performance_arguments() {
    let args = WorkspaceCheckArgs {
        packages: Some("core".to_string()),
        modules: Some("user".to_string()),
        logs: true,
        no_cache: true,
        threshold: Some(85.0),
        concurrency: Some(4),
        strict: true,
        cwd: Some("./here".to_string()),
    };

    let performance = performance_args(&args);

    assert!(!performance.issues);
    assert_eq!(performance.packages.as_deref(), Some("core"));
    assert_eq!(performance.modules.as_deref(), Some("user"));
    assert!(performance.logs);
    assert!(performance.strict);
    assert_eq!(performance.cwd.as_deref(), Some("./here"));
    // The gate's --threshold is a coverage rate, so it is never spent on the
    // performance score — that one keeps its own default.
    assert!(performance.threshold.is_none());
    assert!(performance.min_severity.is_none());
}

#[test]
fn workspace_check_scores_the_sources_it_is_pointed_at() {
    let dir = tempfile::tempdir().expect("tempdir");
    let module = dir.path().join("modules/user/src");
    std::fs::create_dir_all(&module).expect("module");
    std::fs::write(
        module.join("user.service.ts"),
        "export class UserService {\n  \
         public async syncAll(ids: string[]): Promise<void> {\n    \
         for (const id of ids) {\n      \
         await this.userRepository.findOne(id);\n    \
         }\n  }\n}\n",
    )
    .expect("source");

    let args = WorkspaceCheckArgs {
        packages: None,
        modules: None,
        logs: false,
        no_cache: false,
        threshold: None,
        concurrency: None,
        strict: false,
        cwd: Some(dir.path().to_string_lossy().to_string()),
    };

    let audit = score(&args, true).expect("the sources are scored");

    let module = audit
        .scanned()
        .into_iter()
        .find(|module| module.name == "user")
        .expect("the module is scanned");
    assert!(module.score() < audit.threshold);
    assert_eq!(module.hotspots(audit.threshold).len(), 1);
}

#[test]
fn workspace_check_reports_a_workspace_with_nothing_to_score() {
    let dir = tempfile::tempdir().expect("tempdir");
    let args = WorkspaceCheckArgs {
        packages: None,
        modules: None,
        logs: false,
        no_cache: false,
        threshold: None,
        concurrency: None,
        strict: false,
        cwd: Some(dir.path().to_string_lossy().to_string()),
    };

    assert!(score(&args, true).is_err());
}
