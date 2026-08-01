use clap::Parser;
use cli::commands::issue_push::IssuePushArgs;
use cli::utils::Provider;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: IssuePushArgs,
}

#[test]
fn issue_push_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--id",
        "ABC-123",
        "--module",
        "user",
        "--provider",
        "github",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.id, vec!["ABC-123".to_string()]);
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert_eq!(cli.args.provider, Provider::Github);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn issue_push_parses_comma_separated_ids() {
    let cli = TestCli::try_parse_from(["talos", "--id", "ABC-1,ABC-2,ABC-3"])
        .expect("comma-separated ids should parse");

    assert_eq!(
        cli.args.id,
        vec![
            "ABC-1".to_string(),
            "ABC-2".to_string(),
            "ABC-3".to_string()
        ]
    );
}

#[test]
fn issue_push_parses_repeated_id_flags() {
    let cli = TestCli::try_parse_from(["talos", "--id", "ABC-1", "--id", "ABC-2"])
        .expect("repeated id flags should parse");

    assert_eq!(cli.args.id, vec!["ABC-1".to_string(), "ABC-2".to_string()]);
}

#[test]
fn issue_push_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.id.is_empty());
    assert!(cli.args.module.is_none());
    assert!(cli.args.cwd.is_none());
    assert_eq!(cli.args.provider, Provider::Linear);
}

#[test]
fn issue_push_parses_github_provider() {
    let cli = TestCli::try_parse_from(["talos", "--id", "123", "--provider", "github"])
        .expect("github provider should parse");

    assert_eq!(cli.args.provider, Provider::Github);
}

#[test]
fn issue_push_rejects_unknown_provider() {
    assert!(TestCli::try_parse_from(["talos", "--id", "1", "--provider", "gitlab"]).is_err());
}

#[test]
fn issue_push_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// description, priority and issue-file lookup
// ---------------------------------------------------------------------------

use std::fs;
use std::path::{Path, PathBuf};

use cli::commands::issue_push::{ParsedIssue, build_description, find_issue_file, priority_value};

/// A scratch directory that removes itself when the test ends.
struct TempDir(PathBuf);

impl TempDir {
    fn new(tag: &str) -> Self {
        let base = std::env::temp_dir().join(format!(
            "talos-issue-push-{tag}-{}-{:?}",
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

    fn issue(&self, module: &str, id: &str) -> PathBuf {
        let dir = self.0.join(module).join("issues");
        fs::create_dir_all(&dir).expect("issues dir should be creatable");
        let path = dir.join(format!("{id}.yml"));
        fs::write(&path, "id: ").expect("issue should be writable");
        path
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn priority_value_maps_every_known_label() {
    assert_eq!(priority_value(Some("No priority")), Some(0));
    assert_eq!(priority_value(Some("Urgent")), Some(1));
    assert_eq!(priority_value(Some("HIGH")), Some(2));
    assert_eq!(priority_value(Some("medium")), Some(3));
    assert_eq!(priority_value(Some("Normal")), Some(3));
    assert_eq!(priority_value(Some("low")), Some(4));
}

#[test]
fn priority_value_is_none_for_anything_unrecognised() {
    assert_eq!(priority_value(None), None);
    assert_eq!(priority_value(Some("")), None);
    assert_eq!(priority_value(Some("whenever")), None);
}

#[test]
fn build_description_always_leads_with_the_module() {
    let issue = ParsedIssue::default();

    assert_eq!(build_description(&issue, "user"), "**Module:** `user`");
}

#[test]
fn build_description_renders_each_section_in_order() {
    let issue = ParsedIssue {
        context: Some("Why".to_string()),
        goal: Some("What".to_string()),
        dod: Some("Done when".to_string()),
        testing: Some("How to verify".to_string()),
        dependencies: vec!["OON-1".to_string(), "OON-2".to_string()],
        ..ParsedIssue::default()
    };

    let text = build_description(&issue, "user");

    assert_eq!(
        text,
        "**Module:** `user`\n\n\
         ## Context\n\nWhy\n\n\
         ## Goal\n\nWhat\n\n\
         ## Definition of Done\n\nDone when\n\n\
         ## Testing\n\nHow to verify\n\n\
         ## Dependencies\n\n- OON-1\n- OON-2"
    );
}

#[test]
fn build_description_omits_sections_that_are_not_set() {
    let issue = ParsedIssue {
        goal: Some("What".to_string()),
        ..ParsedIssue::default()
    };

    let text = build_description(&issue, "user");

    assert!(text.contains("## Goal"));
    assert!(!text.contains("## Context"));
    assert!(!text.contains("## Dependencies"));
}

#[test]
fn find_issue_file_prefers_the_module_hint() {
    let dir = TempDir::new("hint");
    let expected = dir.issue("user", "OON-1");
    dir.issue("billing", "OON-2");

    let (module, path) =
        find_issue_file(dir.path(), Some("user"), "OON-1").expect("the issue should be found");

    assert_eq!(module, "user");
    assert_eq!(path, expected);
}

#[test]
fn find_issue_file_scans_every_module_when_the_hint_misses() {
    let dir = TempDir::new("scan");
    let expected = dir.issue("billing", "OON-2");

    // The hint points at a module that does not hold this issue.
    let (module, path) =
        find_issue_file(dir.path(), Some("user"), "OON-2").expect("the issue should be found");

    assert_eq!(module, "billing");
    assert_eq!(path, expected);
}

#[test]
fn find_issue_file_is_none_when_no_module_holds_the_issue() {
    let dir = TempDir::new("missing");
    dir.issue("user", "OON-1");

    assert!(find_issue_file(dir.path(), None, "OON-404").is_none());
    // An unreadable modules directory is not a panic either.
    assert!(find_issue_file(&dir.path().join("nope"), None, "OON-1").is_none());
}
