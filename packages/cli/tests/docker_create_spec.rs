use clap::Parser;
use cli::commands::docker_create::{DockerCreateArgs, run, template_for};
use std::sync::Mutex;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: DockerCreateArgs,
}

static ENV_GUARD: Mutex<()> = Mutex::new(());

#[test]
fn docker_create_parses_all_flags() {
    let cli =
        TestCli::try_parse_from(["talos", "--name", "redis", "--cwd", "./here", "--no-cache"])
            .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("redis"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.no_cache);
}

#[test]
fn docker_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.no_cache);
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

#[test]
fn template_for_reads_only_supported_services() {
    let dir = tempfile::tempdir().expect("tempdir");
    std::fs::create_dir_all(dir.path().join("docker")).expect("docker dir");
    std::fs::write(dir.path().join("docker/redis.txt"), "services:\n  redis:\n").expect("template");

    assert_eq!(
        template_for(dir.path(), "redis").as_deref(),
        Some("services:\n  redis:\n")
    );
    assert!(template_for(dir.path(), "unknown").is_none());
}

#[test]
fn docker_create_writes_a_new_compose_file_from_a_template() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let cwd = tempfile::tempdir().expect("cwd");
    let templates = tempfile::tempdir().expect("templates");
    std::fs::create_dir_all(cwd.path().join("modules/app")).expect("app");
    std::fs::create_dir_all(templates.path().join("docker")).expect("docker");
    std::fs::write(
        templates.path().join("docker/redis.txt"),
        "services:\n  redis:\n    image: redis:7\n",
    )
    .expect("template");
    std::fs::write(
        cwd.path().join("modules/app/package.json"),
        "{\n  \"name\": \"@module/app\",\n  \"scripts\": {}\n}\n",
    )
    .expect("package");
    std::fs::write(cwd.path().join("modules/app/app.yml"), "type: \"api\"\n").expect("app yml");

    let previous = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
    }
    run(&DockerCreateArgs {
        no_cache: false,
        name: Some("redis".to_string()),
        cwd: Some(cwd.path().display().to_string()),
    });
    match previous {
        Some(value) => unsafe { std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, value) },
        None => unsafe { std::env::remove_var(cli::utils::TEMPLATES_DIR_ENV) },
    }

    let compose = std::fs::read_to_string(cwd.path().join("modules/app/docker-compose.yml"))
        .expect("compose");
    assert!(compose.contains("redis:7"), "{compose}");
    let package =
        std::fs::read_to_string(cwd.path().join("modules/app/package.json")).expect("package");
    assert!(package.contains("docker compose up -d"), "{package}");
}

#[test]
fn docker_create_leaves_an_existing_service_alone() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let cwd = tempfile::tempdir().expect("cwd");
    let templates = tempfile::tempdir().expect("templates");
    std::fs::create_dir_all(cwd.path().join("modules/app")).expect("app");
    std::fs::create_dir_all(templates.path().join("docker")).expect("docker");
    std::fs::write(
        templates.path().join("docker/redis.txt"),
        "services:\n  redis:\n    image: redis:7\n",
    )
    .expect("template");
    let compose_path = cwd.path().join("modules/app/docker-compose.yml");
    std::fs::write(&compose_path, "services:\n  redis:\n    image: redis:6\n").expect("compose");
    std::fs::write(cwd.path().join("modules/app/package.json"), "{}\n").expect("package");
    std::fs::write(cwd.path().join("modules/app/app.yml"), "type: \"api\"\n").expect("app yml");
    let previous = std::env::var_os(cli::utils::TEMPLATES_DIR_ENV);
    unsafe {
        std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, templates.path());
    }

    run(&DockerCreateArgs {
        no_cache: false,
        name: Some("redis".to_string()),
        cwd: Some(cwd.path().display().to_string()),
    });

    match previous {
        Some(value) => unsafe { std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, value) },
        None => unsafe { std::env::remove_var(cli::utils::TEMPLATES_DIR_ENV) },
    }

    assert_eq!(
        std::fs::read_to_string(&compose_path).expect("compose"),
        "services:\n  redis:\n    image: redis:6\n"
    );
}
