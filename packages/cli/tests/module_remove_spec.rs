use clap::Parser;
use cli::commands::module_remove::ModuleRemoveArgs;
use std::process::{Command, Output};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: ModuleRemoveArgs,
}

#[test]
fn module_remove_parses_all_flags() {
    let cli = TestCli::try_parse_from(["talos", "--name", "user", "--cwd", "./here", "--silent"])
        .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("user"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
}

#[test]
fn module_remove_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn module_remove_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

fn run_talos(cwd: &std::path::Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .env("NO_COLOR", "1")
        .current_dir(cwd)
        .output()
        .expect("talos should run")
}

fn text(output: &Output) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

#[test]
fn module_remove_deletes_the_module_and_its_registration_when_silent() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path();
    std::fs::create_dir_all(root.join("modules/billing/src")).expect("billing dir");
    std::fs::create_dir_all(root.join("modules/app/src")).expect("app dir");
    std::fs::create_dir_all(root.join("modules/shared/src")).expect("shared dir");
    std::fs::write(
        root.join("modules/billing/package.json"),
        "{ \"name\": \"@module/billing\" }\n",
    )
    .expect("package");
    std::fs::write(
        root.join("modules/billing/billing.yml"),
        "type: \"module\"\n",
    )
    .expect("yml");
    std::fs::write(
        root.join("modules/app/src/AppModule.ts"),
        "import { BillingModule } from \"@module/billing/BillingModule\";\n\nexport const AppModule = {\n  controllers: [\n    ...BillingModule.controllers,\n  ],\n  middlewares: [],\n  cronJobs: [],\n  events: [],\n};\n",
    )
    .expect("app module");
    std::fs::write(
        root.join("modules/shared/src/SharedModule.ts"),
        "import { BillingModule } from \"@module/billing/BillingModule\";\n\nexport const SharedModule = {\n  entities: [\n    ...BillingModule.entities,\n  ],\n};\n",
    )
    .expect("shared module");
    std::fs::write(
        root.join("tsconfig.json"),
        "{ \"compilerOptions\": { \"paths\": { \"@module/billing/*\": [\"modules/billing/src/*\"] } } }\n",
    )
    .expect("tsconfig");

    let output = run_talos(
        root,
        &[
            "module:remove",
            "--name",
            "billing",
            "--cwd",
            root.to_str().expect("utf8"),
            "--silent",
        ],
    );

    assert!(output.status.success(), "{}", text(&output));
    assert!(!root.join("modules/billing").exists());
    assert!(
        !std::fs::read_to_string(root.join("modules/app/src/AppModule.ts"))
            .expect("app module")
            .contains("BillingModule")
    );
    assert!(
        !std::fs::read_to_string(root.join("tsconfig.json"))
            .expect("tsconfig")
            .contains("@module/billing")
    );
}

#[test]
fn module_remove_refuses_reserved_modules() {
    let dir = tempfile::tempdir().expect("tempdir");

    let output = run_talos(
        dir.path(),
        &[
            "module:remove",
            "--name",
            "app",
            "--cwd",
            dir.path().to_str().expect("utf8"),
        ],
    );

    assert!(output.status.success());
    assert!(text(&output).contains("Cannot remove the \"app\" module"));
}
