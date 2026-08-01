use clap::Parser;
use cli::commands::design_create::DesignCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: DesignCreateArgs,
}

#[test]
fn design_create_parses_all_flags() {
    let cli =
        TestCli::try_parse_from(["talos", "--name", "MyDesign", "--cwd", "./here", "--silent"])
            .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyDesign"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
}

#[test]
fn design_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn design_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// file walking
// ---------------------------------------------------------------------------

mod support;

use cli::commands::design_create::visit_files_recursive;
use support::TempDir;

#[test]
fn visit_files_recursive_reaches_every_nested_file() {
    let dir = TempDir::new("design-visit");
    dir.write("a.txt", "");
    dir.write("nested/b.txt", "");
    dir.write("nested/deeper/c.txt", "");

    let mut seen = Vec::new();
    visit_files_recursive(dir.path(), &mut |path| {
        seen.push(
            path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string(),
        );
    });
    seen.sort();

    assert_eq!(seen, ["a.txt", "b.txt", "c.txt"]);
}

#[test]
fn visit_files_recursive_ignores_an_unreadable_directory() {
    let dir = TempDir::new("design-visit-missing");

    let mut count = 0;
    visit_files_recursive(&dir.path().join("nope"), &mut |_| count += 1);

    assert_eq!(count, 0);
}
