use clap::Parser;
use cli::commands::spa_create::SpaCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: SpaCreateArgs,
}

#[test]
fn spa_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos", "--name", "MySpa", "--design", "material", "--target", "api", "--cwd", "./here",
        "--silent",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MySpa"));
    assert_eq!(cli.args.design.as_deref(), Some("material"));
    assert_eq!(cli.args.target.as_deref(), Some("api"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
}

#[test]
fn spa_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.design.is_none());
    assert!(cli.args.target.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn spa_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// yml fields, module discovery and port allocation
// ---------------------------------------------------------------------------

mod support;

use cli::commands::spa_create::{
    DEFAULT_PORT, collect_design_modules, collect_target_modules, collect_used_ports,
    find_free_port, visit_files_recursive, with_design_field, with_target_field,
};
use support::TempDir;

#[test]
fn with_target_field_replaces_appends_and_removes() {
    assert_eq!(
        with_target_field("name: \"web\"\ntarget: \"old\"\n", Some("api")),
        "name: \"web\"\ntarget: \"api\"\n"
    );
    assert_eq!(
        with_target_field("name: \"web\"\n", Some("api")),
        "name: \"web\"\ntarget: \"api\"\n"
    );
    assert!(!with_target_field("target: \"old\"\n", None).contains("target:"));
    assert_eq!(
        with_target_field("name: \"web\"\n", None),
        "name: \"web\"\n"
    );
}

#[test]
fn with_design_field_replaces_appends_and_removes() {
    assert_eq!(
        with_design_field("design: \"old\"\n", Some("material")),
        "design: \"material\"\n"
    );
    assert_eq!(
        with_design_field("name: \"web\"\n", Some("material")),
        "name: \"web\"\ndesign: \"material\"\n"
    );
    assert!(!with_design_field("design: \"old\"\n", None).contains("design:"));
    assert_eq!(
        with_design_field("name: \"web\"\n", None),
        "name: \"web\"\n"
    );
}

#[test]
fn collect_target_modules_finds_api_and_microservice_modules() {
    let dir = TempDir::new("spa-targets");
    dir.module("api", "api");
    dir.module("gateway", "microservice");
    dir.module("design", "design");

    let mut found = collect_target_modules(dir.path());
    found.sort();

    assert_eq!(found, ["api", "gateway"]);
}

#[test]
fn collect_design_modules_finds_only_design_modules() {
    let dir = TempDir::new("spa-designs");
    dir.module("material", "design");
    dir.module("api", "api");

    assert_eq!(collect_design_modules(dir.path()), ["material"]);
    assert!(collect_design_modules(&dir.path().join("nope")).is_empty());
}

#[test]
fn collect_used_ports_reads_port_flags_from_package_scripts() {
    let dir = TempDir::new("spa-ports");
    dir.write(
        "one/package.json",
        r#"{"scripts": {"dev": "vite --port 3030"}}"#,
    );
    dir.write(
        "two/package.json",
        r#"{"scripts": {"dev": "vite --port 3040"}}"#,
    );

    assert_eq!(
        collect_used_ports(dir.path(), "spa")
            .into_iter()
            .collect::<Vec<_>>(),
        [3030, 3040]
    );
}

#[test]
fn find_free_port_skips_ports_already_taken() {
    let mut used = std::collections::BTreeSet::new();
    used.insert(DEFAULT_PORT);

    assert_eq!(find_free_port(&used), DEFAULT_PORT + 1);
}

#[test]
fn visit_files_recursive_reaches_nested_files() {
    let dir = TempDir::new("spa-visit");
    dir.write("a.txt", "");
    dir.write("nested/b.txt", "");

    let mut count = 0;
    visit_files_recursive(dir.path(), &mut |_| count += 1);

    assert_eq!(count, 2);
}
