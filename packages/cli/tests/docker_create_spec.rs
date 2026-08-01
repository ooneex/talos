use clap::Parser;
use cli::commands::docker_create::DockerCreateArgs;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: DockerCreateArgs,
}

#[test]
fn docker_create_parses_all_flags() {
    let cli = TestCli::try_parse_from(["talos", "--name", "redis", "--cwd", "./here"])
        .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("redis"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn docker_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn docker_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// compose template splicing
// ---------------------------------------------------------------------------

use cli::commands::docker_create::{extract_service_block, extract_volume_names, service_exists};

const TEMPLATE: &str = "\
services:
  postgres:
    image: postgres:16
    volumes:
      - pg-data:/var/lib/postgresql/data
  redis:
    image: redis:7
volumes:
  pg-data:
  redis-data:
networks:
  default:
";

#[test]
fn extract_service_block_takes_only_the_services_section() {
    let block = extract_service_block(TEMPLATE);

    assert!(block.contains("  postgres:"));
    assert!(block.contains("  redis:"));
    // The trailing sections are not part of the service block.
    assert!(!block.contains("networks:"));
    assert!(!block.contains("\nvolumes:\n"));
    // A nested `volumes:` key belonging to a service is kept.
    assert!(block.contains("    volumes:"));
}

#[test]
fn extract_service_block_is_empty_without_a_services_section() {
    assert_eq!(extract_service_block("volumes:\n  pg-data:\n"), "");
}

#[test]
fn extract_volume_names_lists_top_level_volumes_only() {
    assert_eq!(extract_volume_names(TEMPLATE), ["pg-data", "redis-data"]);
}

#[test]
fn extract_volume_names_is_empty_without_a_volumes_section() {
    assert!(extract_volume_names("services:\n  redis:\n    image: redis:7\n").is_empty());
}

#[test]
fn service_exists_matches_a_top_level_service_key() {
    let compose = "services:\n  postgres:\n    image: postgres:16\n";

    assert!(service_exists(compose, "postgres"));
    assert!(!service_exists(compose, "redis"));
    // `image:` is nested deeper, so it is not a service.
    assert!(!service_exists(compose, "image"));
}
