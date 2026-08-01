use clap::Parser;
use cli::commands::microservice_create::MicroserviceCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: MicroserviceCreateArgs,
}

#[test]
fn microservice_create_parses_all_flags() {
    let cli =
        TestCli::try_parse_from(["talos", "--name", "payments", "--cwd", "./here", "--silent"])
            .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("payments"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
}

#[test]
fn microservice_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
}

#[test]
fn microservice_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// CI detection, port allocation and config splicing
// ---------------------------------------------------------------------------

mod support;

use cli::commands::microservice_create::{
    add_gitlab_include, add_to_env_yml, collect_used_ports, detect_ci_provider, next_available_port,
};
use support::TempDir;

#[test]
fn detect_ci_provider_recognises_each_layout() {
    let github = TempDir::new("ci-github");
    github.dir(".github");
    assert_eq!(detect_ci_provider(github.path()), Some("github"));

    let gitlab = TempDir::new("ci-gitlab");
    gitlab.write(".gitlab-ci.yml", "");
    assert_eq!(detect_ci_provider(gitlab.path()), Some("gitlab"));

    let bitbucket = TempDir::new("ci-bitbucket");
    bitbucket.write("bitbucket-pipelines.yml", "");
    assert_eq!(detect_ci_provider(bitbucket.path()), Some("bitbucket"));

    let none = TempDir::new("ci-none");
    assert_eq!(detect_ci_provider(none.path()), None);
}

#[test]
fn detect_ci_provider_prefers_github_when_several_are_present() {
    let dir = TempDir::new("ci-multi");
    dir.dir(".github");
    dir.write(".gitlab-ci.yml", "");

    assert_eq!(detect_ci_provider(dir.path()), Some("github"));
}

#[test]
fn collect_used_ports_reads_every_nested_env_yml() {
    let dir = TempDir::new("ms-ports");
    dir.write("a/.env.yml", "app:\n  port: 8030\n");
    dir.write("b/nested/.env.yml", "app:\n  port: 8031\n");
    dir.write("c/.env.yml", "app:\n  port: not-a-number\n");

    let mut used = std::collections::BTreeSet::new();
    collect_used_ports(dir.path(), &mut used);

    assert_eq!(used.into_iter().collect::<Vec<_>>(), [8030, 8031]);
}

#[test]
fn collect_used_ports_does_not_descend_into_build_directories() {
    let dir = TempDir::new("ms-ports-excluded");
    dir.write("node_modules/pkg/.env.yml", "port: 8030\n");
    dir.write("target/debug/.env.yml", "port: 8031\n");
    dir.write("dist/.env.yml", "port: 8032\n");

    let mut used = std::collections::BTreeSet::new();
    collect_used_ports(dir.path(), &mut used);

    assert!(used.is_empty());
}

#[test]
fn next_available_port_returns_the_first_free_slot() {
    let dir = TempDir::new("ms-next-port");
    assert_eq!(next_available_port(dir.path()), 8030);

    dir.write("a/.env.yml", "port: 8030\n");
    dir.write("b/.env.yml", "port: 8031\n");
    assert_eq!(next_available_port(dir.path()), 8032);
}

#[test]
fn add_to_env_yml_appends_a_microservices_block_when_there_is_none() {
    let dir = TempDir::new("ms-env-new");
    dir.write(".env.yml", "app:\n  name: \"api\"\n");

    add_to_env_yml(&dir.path().join(".env.yml"), "billing", 8030);

    let out = dir.read(".env.yml");
    assert!(out.contains("microservices:\n  billing:\n    url: \"http://localhost:8030\""));
    assert!(out.contains("app:"));
}

#[test]
fn add_to_env_yml_inserts_into_an_existing_microservices_block() {
    let dir = TempDir::new("ms-env-existing");
    dir.write(
        ".env.yml",
        "microservices:\n  user:\n    url: \"http://localhost:8029\"\n",
    );

    add_to_env_yml(&dir.path().join(".env.yml"), "billing", 8030);

    let out = dir.read(".env.yml");
    assert!(out.contains("  billing:"));
    assert!(out.contains("  user:"));
}

#[test]
fn add_to_env_yml_is_idempotent_and_ignores_a_missing_file() {
    let dir = TempDir::new("ms-env-idempotent");
    dir.write(
        ".env.yml",
        "microservices:\n  billing:\n    url: \"http://localhost:8030\"\n",
    );
    let before = dir.read(".env.yml");

    add_to_env_yml(&dir.path().join(".env.yml"), "billing", 9999);

    assert_eq!(dir.read(".env.yml"), before);

    // A missing file is left missing rather than created.
    add_to_env_yml(&dir.path().join("nope.yml"), "billing", 8030);
    assert!(!dir.path().join("nope.yml").exists());
}

#[test]
fn add_gitlab_include_creates_the_file_when_it_is_absent() {
    let dir = TempDir::new("ms-gitlab-new");
    let path = dir.path().join(".gitlab-ci.yml");

    add_gitlab_include(&path, "billing");

    assert_eq!(
        std::fs::read_to_string(&path).expect("the file is written"),
        "include:\n  - local: .gitlab/ci/billing.yml\n"
    );
}

#[test]
fn add_gitlab_include_splices_into_an_existing_include_block() {
    let dir = TempDir::new("ms-gitlab-existing");
    let path = dir.write(
        "ci.yml",
        "include:\n  - local: .gitlab/ci/user.yml\nstages:\n  - test\n",
    );

    add_gitlab_include(&path, "billing");

    let out = dir.read("ci.yml");
    assert!(out.contains("  - local: .gitlab/ci/billing.yml"));
    assert!(out.contains("  - local: .gitlab/ci/user.yml"));
    assert!(out.contains("stages:"));
}

#[test]
fn add_gitlab_include_prepends_when_there_is_no_include_block() {
    let dir = TempDir::new("ms-gitlab-prepend");
    let path = dir.write("ci.yml", "stages:\n  - test\n");

    add_gitlab_include(&path, "billing");

    let out = dir.read("ci.yml");
    assert!(out.starts_with("include:\n  - local: .gitlab/ci/billing.yml\n"));
    assert!(out.contains("stages:"));
}

#[test]
fn add_gitlab_include_is_idempotent() {
    let dir = TempDir::new("ms-gitlab-idempotent");
    let path = dir.write("ci.yml", "include:\n  - local: .gitlab/ci/billing.yml\n");
    let before = dir.read("ci.yml");

    add_gitlab_include(&path, "billing");

    assert_eq!(dir.read("ci.yml"), before);
}
