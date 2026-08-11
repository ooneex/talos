use std::fs;
use std::path::Path;
use std::process::Command;

use clap::Parser;
use cli::commands::app_init::{
    AppInitArgs, AppType, install_commitlint_hook, scaffold_destination,
};
use tempfile::tempdir;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: AppInitArgs,
}

#[test]
fn app_init_args_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--name",
        "MyApp",
        "--destination",
        "./my-app",
        "--silent",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyApp"));
    assert_eq!(cli.args.destination.as_deref(), Some("./my-app"));
    assert!(cli.args.silent);
}

#[test]
fn app_init_args_defaults_are_none_and_not_silent() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.destination.is_none());
    assert!(!cli.args.silent);
}

fn build_fake_skeleton(root: &Path) {
    fs::create_dir_all(root.join(".git")).unwrap();
    fs::write(root.join("bun.lock"), "{}").unwrap();
    fs::write(root.join("README.md"), "# skeleton\n\nSome description.\n").unwrap();
    fs::write(root.join(".dockerignore"), "node_modules\n").unwrap();
    fs::write(root.join("remotion.config.ts"), "export {};\n").unwrap();

    for module in ["app", "shared", "billing"] {
        fs::create_dir_all(root.join("modules").join(module)).unwrap();
        fs::write(root.join("modules").join(module).join("marker.txt"), module).unwrap();
    }

    fs::write(
        root.join("modules").join("app").join(".env.example.yml"),
        "KEY: value\n",
    )
    .unwrap();

    fs::write(
        root.join("modules").join("app").join("docker-compose.yml"),
        "services:\n  postgres:\n    container_name: skeleton_db\nvolumes:\n  skeleton_db_data:\n",
    )
    .unwrap();

    fs::write(
        root.join("modules").join("app").join("package.json"),
        "{\n  \"name\": \"@module/app\",\n  \"description\": \"\",\n  \"version\": \"0.0.1\"\n}\n",
    )
    .unwrap();

    fs::write(
        root.join("modules").join("app").join("Dockerfile"),
        "COPY modules/app/package.json modules/app/tsconfig.json ./modules/app/\nCOPY modules/app/src ./modules/app/src\nCMD [\"bun\", \"run\", \"modules/app/src/index.ts\"]\n",
    )
    .unwrap();

    fs::write(
        root.join("tsconfig.json"),
        "{\n  \"compilerOptions\": {\n    \"paths\": {\n      \"@module/app/*\": [\n        \"./modules/app/src/*\"\n      ],\n      \"@module/shared/*\": [\n        \"./modules/shared/src/*\"\n      ],\n      \"@module/design/*\": [\n        \"./modules/design/src/*\"\n      ],\n      \"@module/sdk/*\": [\n        \"./modules/sdk/src/*\"\n      ],\n      \"@module/microservice/*\": [\n        \"./modules/microservice/src/*\"\n      ]\n    },\n    \"types\": [\n      \"bun\"\n    ]\n  }\n}\n",
    )
    .unwrap();
}

#[test]
fn scaffold_destination_rewrites_env_and_readme() {
    let skeleton = tempdir().unwrap();
    build_fake_skeleton(skeleton.path());
    let destination = tempdir().unwrap();
    let destination_path = destination.path().join("app");

    scaffold_destination(skeleton.path(), &destination_path, "my-app", None).unwrap();

    assert!(!destination_path.join(".git").exists());
    assert!(!destination_path.join("bun.lock").exists());
    assert!(!destination_path.join("remotion.config.ts").exists());
    assert!(!destination_path.join("modules").join("app").exists());
    assert!(
        !destination_path
            .join("modules")
            .join("my-app")
            .join(".env.example.yml")
            .exists()
    );
    assert_eq!(
        fs::read_to_string(
            destination_path
                .join("modules")
                .join("my-app")
                .join(".env.yml")
        )
        .unwrap(),
        "KEY: value\n"
    );
    assert_eq!(
        fs::read_to_string(destination_path.join("README.md")).unwrap(),
        "# my-app\n\nSome description."
    );
    assert_eq!(
        fs::read_to_string(
            destination_path
                .join("modules")
                .join("my-app")
                .join("docker-compose.yml")
        )
        .unwrap(),
        "services:\n  postgres:\n    container_name: my_app_db\nvolumes:\n  my_app_db_data:\n"
    );
}

#[test]
fn scaffold_destination_renames_app_module_dir_and_rewrites_dockerfile() {
    let skeleton = tempdir().unwrap();
    build_fake_skeleton(skeleton.path());
    let destination = tempdir().unwrap();
    let destination_path = destination.path().join("app");

    scaffold_destination(skeleton.path(), &destination_path, "my-app", None).unwrap();

    assert!(!destination_path.join("modules").join("app").exists());
    assert!(destination_path.join("modules").join("my-app").is_dir());

    let dockerfile = fs::read_to_string(
        destination_path
            .join("modules")
            .join("my-app")
            .join("Dockerfile"),
    )
    .unwrap();
    assert!(dockerfile.contains("modules/my-app"));
    assert!(!dockerfile.contains("modules/app"));
}

#[test]
fn scaffold_destination_rewrites_tsconfig_module_paths() {
    let skeleton = tempdir().unwrap();
    build_fake_skeleton(skeleton.path());
    let destination = tempdir().unwrap();
    let destination_path = destination.path().join("app");

    scaffold_destination(skeleton.path(), &destination_path, "my-app", None).unwrap();

    let tsconfig = fs::read_to_string(destination_path.join("tsconfig.json")).unwrap();
    assert!(tsconfig.contains("\"@module/app/*\""));
    assert!(tsconfig.contains("\"./modules/my-app/src/*\""));
    assert!(!tsconfig.contains("\"./modules/app/src/*\""));
    assert!(tsconfig.contains("\"@module/shared/*\""));
    assert!(!tsconfig.contains("\"@module/design/*\""));
    assert!(!tsconfig.contains("\"@module/sdk/*\""));
    assert!(!tsconfig.contains("\"@module/microservice/*\""));

    let parsed: serde_json::Value = serde_json::from_str(&tsconfig).unwrap();
    assert!(parsed["compilerOptions"]["types"].is_array());
}

#[test]
fn scaffold_destination_renames_the_app_module_package() {
    let skeleton = tempdir().unwrap();
    build_fake_skeleton(skeleton.path());
    let destination = tempdir().unwrap();
    let destination_path = destination.path().join("app");

    scaffold_destination(skeleton.path(), &destination_path, "my-app", None).unwrap();

    let app_package_json = fs::read_to_string(
        destination_path
            .join("modules")
            .join("my-app")
            .join("package.json"),
    )
    .unwrap();
    assert_eq!(
        app_package_json,
        "{\n  \"name\": \"@module/my-app\",\n  \"description\": \"\",\n  \"version\": \"0.0.1\"\n}"
    );
}

#[test]
fn scaffold_destination_without_app_type_keeps_all_modules() {
    let skeleton = tempdir().unwrap();
    build_fake_skeleton(skeleton.path());
    let destination = tempdir().unwrap();
    let destination_path = destination.path().join("app");

    scaffold_destination(skeleton.path(), &destination_path, "my-app", None).unwrap();

    assert!(destination_path.join("modules").join("my-app").is_dir());
    for module in ["shared", "billing"] {
        assert!(destination_path.join("modules").join(module).is_dir());
    }
    assert!(!destination_path.join("modules").join("app").exists());
    assert!(destination_path.join(".dockerignore").exists());
}

#[test]
fn scaffold_destination_with_api_app_type_keeps_only_app_and_shared_modules() {
    let skeleton = tempdir().unwrap();
    build_fake_skeleton(skeleton.path());
    let destination = tempdir().unwrap();
    let destination_path = destination.path().join("app");

    scaffold_destination(
        skeleton.path(),
        &destination_path,
        "my-app",
        Some(AppType::Api),
    )
    .unwrap();

    assert!(!destination_path.join("modules").join("app").exists());
    assert!(destination_path.join("modules").join("my-app").is_dir());
    assert!(destination_path.join("modules").join("shared").is_dir());
    assert!(!destination_path.join("modules").join("billing").exists());
}

#[test]
fn scaffold_destination_with_cli_app_type_empties_modules_and_removes_dockerignore() {
    let skeleton = tempdir().unwrap();
    build_fake_skeleton(skeleton.path());
    let destination = tempdir().unwrap();
    let destination_path = destination.path().join("app");

    scaffold_destination(
        skeleton.path(),
        &destination_path,
        "my-app",
        Some(AppType::Cli),
    )
    .unwrap();

    let modules_dir = destination_path.join("modules");
    assert!(modules_dir.is_dir());
    assert_eq!(fs::read_dir(&modules_dir).unwrap().count(), 0);
    assert!(!destination_path.join(".dockerignore").exists());
}

#[test]
fn install_commitlint_hook_writes_an_executable_hook() {
    let repo = tempdir().unwrap();
    assert!(
        Command::new("git")
            .args(["init", "--quiet"])
            .current_dir(repo.path())
            .status()
            .unwrap()
            .success()
    );

    install_commitlint_hook(repo.path()).expect("hook install should succeed in a git repo");

    let hook_path = repo.path().join(".git").join("hooks").join("commit-msg");
    let content = fs::read_to_string(&hook_path).unwrap();
    assert!(content.contains("talos commitlint:check"));

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let mode = fs::metadata(&hook_path).unwrap().permissions().mode();
        assert_eq!(mode & 0o111, 0o111, "hook file should be executable");
    }
}

#[test]
fn install_commitlint_hook_fails_outside_a_git_repository() {
    let not_a_repo = tempdir().unwrap();
    assert!(install_commitlint_hook(not_a_repo.path()).is_err());
}
