use clap::Parser;
use cli::commands::spa_feature_create::SpaFeatureCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: SpaFeatureCreateArgs,
}

#[test]
fn spa_feature_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--name",
        "Dashboard",
        "--module",
        "user",
        "--override",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("Dashboard"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert!(cli.args.r#override);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn spa_feature_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.module.is_none());
    assert!(!cli.args.r#override);
    assert!(cli.args.cwd.is_none());
}

#[test]
fn spa_feature_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// template rendering
// ---------------------------------------------------------------------------

use cli::commands::spa_feature_create::render;

#[test]
fn render_substitutes_every_placeholder() {
    let out = render(
        "export const {{NAME}} = \"{{CAMEL}}\"; // {{KEBAB}}",
        "UserProfile",
        "userProfile",
        "user-profile",
    );

    assert_eq!(
        out,
        "export const UserProfile = \"userProfile\"; // user-profile"
    );
}

#[test]
fn render_substitutes_repeated_placeholders() {
    assert_eq!(render("{{NAME}}{{NAME}}", "A", "a", "a"), "AA");
}

#[test]
fn render_leaves_a_template_without_placeholders_alone() {
    assert_eq!(render("plain text", "A", "a", "a"), "plain text");
}
