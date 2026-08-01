use clap::Parser;
use cli::commands::translation_create::TranslationCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: TranslationCreateArgs,
}

#[test]
fn translation_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--name",
        "Messages",
        "--module",
        "user",
        "--override",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("Messages"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert!(cli.args.r#override);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn translation_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(!cli.args.r#override);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn translation_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// module type lookup
// ---------------------------------------------------------------------------

mod support;

use cli::commands::translation_create::read_module_type;
use support::TempDir;

#[test]
fn read_module_type_reads_the_declared_type() {
    let dir = TempDir::new("translation-type");
    dir.write("modules/web/web.yml", "name: \"web\"\ntype: \"spa\"\n");

    assert_eq!(read_module_type(dir.path(), "web"), "spa");
}

#[test]
fn read_module_type_defaults_to_module() {
    let dir = TempDir::new("translation-type-default");

    assert_eq!(read_module_type(dir.path(), "missing"), "module");

    dir.write("modules/user/user.yml", "name: \"user\"\n");
    assert_eq!(read_module_type(dir.path(), "user"), "module");
}
