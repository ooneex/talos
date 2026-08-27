use clap::Parser;
use cli::commands::workspace_check::{
    OutputFormat, WorkspaceCheckArgs, install_args, lint_args, score,
};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: WorkspaceCheckArgs,
}

/// The arguments every helper is read against, so a test only has to say what
/// it is looking at.
fn args() -> WorkspaceCheckArgs {
    WorkspaceCheckArgs {
        packages: Some("core".to_string()),
        modules: Some("user".to_string()),
        logs: true,
        no_cache: true,
        threshold: Some(85.0),
        concurrency: Some(4),
        strict: true,
        output: None,
        cwd: Some("./here".to_string()),
    }
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
        "--output",
        "json",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.packages.as_deref(), Some("core"));
    assert_eq!(cli.args.modules.as_deref(), Some("user"));
    assert!(cli.args.logs);
    assert!(cli.args.no_cache);
    assert_eq!(cli.args.output, Some(OutputFormat::Json));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn workspace_check_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.packages.is_none());
    assert!(cli.args.modules.is_none());
    assert!(!cli.args.logs);
    assert!(!cli.args.no_cache);
    assert!(cli.args.output.is_none());
    assert!(cli.args.cwd.is_none());
    // Left to a programmatic caller: the gate has no flag for any of them.
    assert!(cli.args.threshold.is_none());
    assert!(cli.args.concurrency.is_none());
    assert!(!cli.args.strict);
}

#[test]
fn workspace_check_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

/// The gate installs and lints, so the flags that only ever meant something
/// to coverage or the performance score are not flags of it any more.
#[test]
fn workspace_check_rejects_the_flags_it_no_longer_reads() {
    assert!(TestCli::try_parse_from(["talos", "--threshold", "85"]).is_err());
    assert!(TestCli::try_parse_from(["talos", "--concurrency", "4"]).is_err());
    assert!(TestCli::try_parse_from(["talos", "--strict"]).is_err());
}

#[test]
fn workspace_check_builds_the_install_arguments() {
    let install = install_args(&args());

    assert!(!install.force);
    assert!(install.audit_level.is_none());
    assert!(!install.skip_audit);
    assert!(install.no_cache);
    assert_eq!(install.cwd.as_deref(), Some("./here"));
}

#[test]
fn workspace_check_builds_the_lint_arguments() {
    let lint = lint_args(&args());

    assert_eq!(lint.packages.as_deref(), Some("core"));
    assert_eq!(lint.modules.as_deref(), Some("user"));
    assert!(lint.logs);
    assert!(lint.no_cache);
    assert_eq!(lint.cwd.as_deref(), Some("./here"));
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
        cwd: Some(dir.path().to_string_lossy().to_string()),
        ..scoring_args()
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
        cwd: Some(dir.path().to_string_lossy().to_string()),
        ..scoring_args()
    };

    assert!(score(&args, true).is_err());
}

/// A bare set of arguments — `score` reads nothing but the modules, packages
/// and working directory.
fn scoring_args() -> WorkspaceCheckArgs {
    WorkspaceCheckArgs {
        packages: None,
        modules: None,
        logs: false,
        no_cache: false,
        threshold: None,
        concurrency: None,
        strict: false,
        output: None,
        cwd: None,
    }
}
