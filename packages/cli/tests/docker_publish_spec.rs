use clap::Parser;
use cli::commands::docker_publish::DockerPublishArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: DockerPublishArgs,
}

#[test]
fn docker_publish_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--packages",
        "core",
        "--modules",
        "user",
        "--tag",
        "1.0.0",
        "--silent",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.packages.as_deref(), Some("core"));
    assert_eq!(cli.args.modules.as_deref(), Some("user"));
    assert_eq!(cli.args.tag.as_deref(), Some("1.0.0"));
    assert!(cli.args.silent);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn docker_publish_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.packages.is_none());
    assert!(cli.args.modules.is_none());
    assert!(cli.args.tag.is_none());
    assert!(!cli.args.silent);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn docker_publish_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// target resolution
// ---------------------------------------------------------------------------

mod support;

use cli::commands::docker_publish::{discover, resolve_targets, split_csv};
use support::TempDir;

#[test]
fn split_csv_trims_and_drops_empty_entries() {
    assert_eq!(split_csv(Some("a, b ,,c")), ["a", "b", "c"]);
    assert!(split_csv(Some("  , ,")).is_empty());
    assert!(split_csv(None).is_empty());
}

#[test]
fn discover_lists_directories_under_the_given_folder() {
    let dir = TempDir::new("docker-discover");
    dir.dir("modules/api");
    dir.dir("modules/gateway");
    dir.write("modules/notes.md", "");

    let mut bases: Vec<String> = discover(dir.path(), "modules", "module")
        .into_iter()
        .map(|t| t.base)
        .collect();
    bases.sort();

    assert_eq!(bases, ["modules/api", "modules/gateway"]);
}

#[test]
fn resolve_targets_scans_everything_when_nothing_is_named() {
    let dir = TempDir::new("docker-resolve-all");
    dir.dir("packages/cli");
    dir.dir("modules/api");

    let mut bases: Vec<String> = resolve_targets(dir.path(), None, None)
        .into_iter()
        .map(|t| t.base)
        .collect();
    bases.sort();

    assert_eq!(bases, ["modules/api", "packages/cli"]);
}

#[test]
fn resolve_targets_honours_an_explicit_selection() {
    let dir = TempDir::new("docker-resolve-explicit");
    dir.dir("modules/unwanted");

    let bases: Vec<String> = resolve_targets(dir.path(), Some("cli"), Some("api"))
        .into_iter()
        .map(|t| t.base)
        .collect();

    assert_eq!(bases, ["packages/cli", "modules/api"]);
}
