use clap::Parser;
use cli::commands::issue_create::IssueCreateArgs;
use cli::commands::issue_create::run;
use std::fs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: IssueCreateArgs,
}

#[test]
fn issue_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--title",
        "My issue",
        "--priority",
        "high",
        "--description",
        "details",
        "--label",
        "a",
        "--label",
        "b",
        "--module",
        "user",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.title.as_deref(), Some("My issue"));
    assert_eq!(cli.args.priority.as_deref(), Some("high"));
    assert_eq!(cli.args.description.as_deref(), Some("details"));
    assert_eq!(cli.args.labels, vec!["a".to_string(), "b".to_string()]);
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn issue_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.title.is_none());
    assert!(cli.args.priority.is_none());
    assert!(cli.args.description.is_none());
    assert!(cli.args.labels.is_empty());
    assert!(cli.args.module.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn issue_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn issue_create_run_writes_a_trimmed_issue_in_the_requested_module() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let cwd = tmp.path();
    let module_dir = cwd.join("modules/user");
    fs::create_dir_all(&module_dir).expect("module dir");
    fs::write(module_dir.join("package.json"), "{}").expect("package");

    run(&IssueCreateArgs {
        title: Some("  Add coverage  ".to_string()),
        priority: Some("  High  ".to_string()),
        description: Some("  Cover the last branches  ".to_string()),
        labels: vec!["testing".to_string(), "rust".to_string()],
        module: Some("user".to_string()),
        cwd: Some(cwd.display().to_string()),
    });

    let issues_dir = module_dir.join("issues");
    let entries = fs::read_dir(&issues_dir)
        .expect("issues dir")
        .collect::<Result<Vec<_>, _>>()
        .expect("entries");
    assert_eq!(entries.len(), 1);

    let yaml = fs::read_to_string(entries[0].path()).expect("issue yaml");
    assert!(yaml.contains("module: \"user\""));
    assert!(yaml.contains("title: \"Add coverage\""));
    assert!(yaml.contains("priority: \"High\""));
    assert!(yaml.contains("state: \"Todo\""));
    assert!(yaml.contains("Cover the last branches"));
    assert!(yaml.contains("- \"testing\""));
    assert!(yaml.contains("- \"rust\""));
}

#[test]
fn issue_create_run_defaults_to_shared_and_reports_write_failures_cleanly() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let cwd = tmp.path();
    let shared_dir = cwd.join("modules/shared");
    fs::create_dir_all(&shared_dir).expect("shared dir");
    fs::write(shared_dir.join("package.json"), "{}").expect("package");
    fs::write(shared_dir.join("issues"), "blocking file").expect("issues file");

    run(&IssueCreateArgs {
        title: None,
        priority: None,
        description: None,
        labels: Vec::new(),
        module: None,
        cwd: Some(cwd.display().to_string()),
    });

    assert!(shared_dir.join("issues").is_file());
    assert!(
        fs::read_dir(&shared_dir)
            .expect("shared dir entries")
            .filter_map(Result::ok)
            .all(|entry| entry.file_name() != std::ffi::OsStr::new("issues.yml"))
    );
}
