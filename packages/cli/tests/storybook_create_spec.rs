mod support;

use clap::Parser;
use cli::commands::storybook_create::{
    DEFAULT_PORT, StorybookCreateArgs, collect_design_modules, collect_used_ports, find_free_port,
    visit_files_recursive, with_design_field,
};
use support::TempDir;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: StorybookCreateArgs,
}

#[test]
fn storybook_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--name",
        "MyBook",
        "--design",
        "material",
        "--cwd",
        "./here",
        "--silent",
        "--no-cache",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyBook"));
    assert_eq!(cli.args.design.as_deref(), Some("material"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
    assert!(cli.args.no_cache);
}

#[test]
fn storybook_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.design.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
    assert!(!cli.args.no_cache);
}

#[test]
fn storybook_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// design field, module discovery and port allocation
// ---------------------------------------------------------------------------

#[test]
fn with_design_field_replaces_appends_and_removes() {
    assert_eq!(
        with_design_field("design: \"old\"\n", Some("material")),
        "design: \"material\"\n"
    );
    assert_eq!(
        with_design_field("name: \"book\"\n", Some("material")),
        "name: \"book\"\ndesign: \"material\"\n"
    );
    assert!(!with_design_field("design: \"old\"\n", None).contains("design:"));
    assert_eq!(
        with_design_field("name: \"book\"\n", None),
        "name: \"book\"\n"
    );
}

#[test]
fn collect_design_modules_finds_only_design_modules() {
    let dir = TempDir::new("storybook-designs");
    dir.module("material", "design");
    dir.module("api", "api");
    dir.module("web", "spa");

    assert_eq!(collect_design_modules(dir.path()), ["material"]);
    assert!(collect_design_modules(&dir.path().join("nope")).is_empty());
}

#[test]
fn collect_used_ports_reads_port_flags_from_package_scripts() {
    let dir = TempDir::new("storybook-ports");
    dir.write(
        "one/package.json",
        r#"{"scripts": {"dev": "vite --port 3031"}}"#,
    );

    assert!(collect_used_ports(dir.path()).contains(&3031));
}

#[test]
fn find_free_port_starts_at_the_storybook_default() {
    let used = std::collections::BTreeSet::new();

    assert_eq!(find_free_port(&used), DEFAULT_PORT);
}

#[test]
fn visit_files_recursive_reaches_nested_files() {
    let dir = TempDir::new("storybook-visit");
    dir.write("a.txt", "");
    dir.write("nested/b.txt", "");

    let mut count = 0;
    visit_files_recursive(dir.path(), &mut |_| count += 1);

    assert_eq!(count, 2);
}
