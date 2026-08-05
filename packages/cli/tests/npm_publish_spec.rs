use clap::Parser;
use cli::commands::npm_publish::NpmPublishArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: NpmPublishArgs,
}

#[test]
fn npm_publish_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--packages",
        "core",
        "--modules",
        "user",
        "--access",
        "restricted",
        "--silent",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.packages.as_deref(), Some("core"));
    assert_eq!(cli.args.modules.as_deref(), Some("user"));
    assert_eq!(cli.args.access, "restricted");
    assert!(cli.args.silent);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn npm_publish_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.packages.is_none());
    assert!(cli.args.modules.is_none());
    assert_eq!(cli.args.access, "public");
    assert!(!cli.args.silent);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn npm_publish_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// target resolution and URL encoding
// ---------------------------------------------------------------------------

mod support;

use cli::commands::npm_publish::{discover, percent_encode, resolve_targets, split_csv};
use support::TempDir;

#[test]
fn split_csv_trims_and_drops_empty_entries() {
    assert_eq!(split_csv(Some("a, b ,,c")), ["a", "b", "c"]);
    assert!(split_csv(Some("")).is_empty());
    assert!(split_csv(Some("  , ,")).is_empty());
    assert!(split_csv(None).is_empty());
}

#[test]
fn discover_lists_every_directory_under_the_given_folder() {
    let dir = TempDir::new("npm-discover");
    dir.dir("packages/cli");
    dir.dir("packages/color");
    dir.write("packages/README.md", "");

    let mut found: Vec<String> = discover(dir.path(), "packages", "package")
        .into_iter()
        .map(|t| t.base)
        .collect();
    found.sort();

    assert_eq!(found, ["packages/cli", "packages/color"]);
}

#[test]
fn discover_is_empty_for_a_missing_folder() {
    let dir = TempDir::new("npm-discover-missing");

    assert!(discover(dir.path(), "packages", "package").is_empty());
}

#[test]
fn resolve_targets_falls_back_to_every_package_and_module() {
    let dir = TempDir::new("npm-resolve-all");
    dir.dir("packages/cli");
    dir.dir("modules/user");

    let targets = resolve_targets(dir.path(), None, None);
    let mut bases: Vec<String> = targets.iter().map(|t| t.base.clone()).collect();
    bases.sort();

    assert_eq!(bases, ["modules/user", "packages/cli"]);
    // The kind travels with the target so the publish step knows what it holds.
    assert_eq!(
        targets
            .iter()
            .find(|t| t.base == "packages/cli")
            .map(|t| t.kind),
        Some("package")
    );
}

#[test]
fn resolve_targets_honours_an_explicit_selection() {
    let dir = TempDir::new("npm-resolve-explicit");
    dir.dir("packages/cli");
    dir.dir("packages/unwanted");

    let targets = resolve_targets(dir.path(), Some("cli"), Some("user"));
    let bases: Vec<String> = targets.iter().map(|t| t.base.clone()).collect();

    // A named selection is taken at face value — the folders are not scanned.
    assert_eq!(bases, ["packages/cli", "modules/user"]);
}

#[test]
fn percent_encode_leaves_unreserved_characters_alone() {
    assert_eq!(percent_encode("abcXYZ019-_.~"), "abcXYZ019-_.~");
}

#[test]
fn percent_encode_escapes_everything_else() {
    assert_eq!(percent_encode("@talos/cli"), "%40talos%2Fcli");
    assert_eq!(percent_encode("a b"), "a%20b");
}
