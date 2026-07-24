use clap::Args;
use serde_json::{Map, Value};

use crate::utils::{ask_select, current_dir};

const DOCKER_SERVICES: &[&str] = &[
    "clickhouse",
    "elasticsearch",
    "grafana",
    "jaeger",
    "keycloak",
    "libretranslate",
    "maildev",
    "memcached",
    "minio",
    "mongodb",
    "mysql",
    "nats",
    "postgres",
    "prometheus",
    "rabbitmq",
    "redis",
    "temporal",
    "vault",
];

#[derive(Args, Debug)]
pub struct DockerCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,
}

fn template_for(name: &str) -> Option<&'static str> {
    match name {
        "clickhouse" => Some(include_str!("../templates/docker/clickhouse.txt")),
        "elasticsearch" => Some(include_str!("../templates/docker/elasticsearch.txt")),
        "grafana" => Some(include_str!("../templates/docker/grafana.txt")),
        "jaeger" => Some(include_str!("../templates/docker/jaeger.txt")),
        "keycloak" => Some(include_str!("../templates/docker/keycloak.txt")),
        "libretranslate" => Some(include_str!("../templates/docker/libretranslate.txt")),
        "maildev" => Some(include_str!("../templates/docker/maildev.txt")),
        "memcached" => Some(include_str!("../templates/docker/memcached.txt")),
        "minio" => Some(include_str!("../templates/docker/minio.txt")),
        "mongodb" => Some(include_str!("../templates/docker/mongodb.txt")),
        "mysql" => Some(include_str!("../templates/docker/mysql.txt")),
        "nats" => Some(include_str!("../templates/docker/nats.txt")),
        "postgres" => Some(include_str!("../templates/docker/postgres.txt")),
        "prometheus" => Some(include_str!("../templates/docker/prometheus.txt")),
        "rabbitmq" => Some(include_str!("../templates/docker/rabbitmq.txt")),
        "redis" => Some(include_str!("../templates/docker/redis.txt")),
        "temporal" => Some(include_str!("../templates/docker/temporal.txt")),
        "vault" => Some(include_str!("../templates/docker/vault.txt")),
        _ => None,
    }
}

fn extract_service_block(template: &str) -> String {
    let mut result = Vec::new();
    let mut in_services = false;

    for line in template.lines() {
        if line.starts_with("services:") {
            in_services = true;
            continue;
        }
        if in_services && (line.starts_with("volumes:") || line.starts_with("networks:")) {
            break;
        }
        if in_services {
            result.push(line);
        }
    }

    result.join("\n")
}

fn extract_volume_names(template: &str) -> Vec<String> {
    let mut volumes = Vec::new();
    let mut in_volumes = false;

    for line in template.lines() {
        if line.starts_with("volumes:") {
            in_volumes = true;
            continue;
        }
        if in_volumes && line.starts_with("networks:") {
            break;
        }
        if in_volumes
            && let Some(name) = line.strip_prefix("  ")
            && !name.trim().is_empty()
            && !name.starts_with(' ')
            && name.ends_with(':')
        {
            volumes.push(name.trim_end_matches(':').to_string());
        }
    }

    volumes
}

fn service_exists(content: &str, name: &str) -> bool {
    content
        .lines()
        .any(|line| line.trim_end() == format!("  {name}:"))
}

pub fn run(args: &DockerCreateArgs) {
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_select("Select docker service", DOCKER_SERVICES) {
            Some(index) => DOCKER_SERVICES[index].to_string(),
            None => return,
        },
    };
    let Some(template_content) = template_for(&name) else {
        crate::utils::error(format!("Unsupported docker service \"{name}\""));
        return;
    };
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);

    let base = cwd.join("modules").join("app");
    let compose_path = base.join("docker-compose.yml");

    if compose_path.exists() {
        let Ok(existing_content) = std::fs::read_to_string(&compose_path) else {
            crate::utils::error(format!("Failed to read {}", compose_path.display()));
            return;
        };

        if service_exists(&existing_content, &name) {
            crate::utils::warn(format!(
                "Service \"{name}\" already exists in docker-compose.yml"
            ));
            return;
        }

        let service_block = extract_service_block(template_content);
        let new_volume_names = extract_volume_names(template_content);

        let mut updated_content = existing_content;
        let volumes_index = updated_content.find("\nvolumes:");
        let networks_index = updated_content.find("\nnetworks:");
        let insert_index = match (volumes_index, networks_index) {
            (Some(left), Some(right)) => Some(left.min(right)),
            (Some(index), None) | (None, Some(index)) => Some(index),
            (None, None) => None,
        };

        if let Some(insert_index) = insert_index {
            updated_content = format!(
                "{}\n{}{}",
                &updated_content[..insert_index],
                service_block,
                &updated_content[insert_index..]
            );
        } else {
            updated_content = format!("{}\n{}", updated_content.trim_end(), service_block);
        }

        for volume_name in new_volume_names {
            let volume_key = format!("  {volume_name}:");
            if updated_content.contains(&volume_key) {
                continue;
            }

            if let Some(volumes_index) = updated_content.find("\nvolumes:") {
                let section_start = volumes_index + "\nvolumes:".len();
                let after_volumes = updated_content[section_start..].to_string();
                updated_content = format!(
                    "{}\n{}{}",
                    &updated_content[..section_start],
                    volume_key,
                    after_volumes
                );
            } else {
                updated_content = format!(
                    "{}\n\nvolumes:\n{}\n",
                    updated_content.trim_end(),
                    volume_key
                );
            }
        }

        if let Err(error) = std::fs::write(&compose_path, updated_content) {
            crate::utils::error(format!(
                "Failed to write {}: {error}",
                compose_path.display()
            ));
            return;
        }
    } else if let Err(error) = std::fs::write(&compose_path, template_content) {
        crate::utils::error(format!(
            "Failed to write {}: {error}",
            compose_path.display()
        ));
        return;
    }

    let package_json_path = base.join("package.json");
    if let Ok(raw) = std::fs::read_to_string(&package_json_path)
        && let Ok(mut package_json) = serde_json::from_str::<Value>(&raw)
    {
        if !package_json.is_object() {
            package_json = Value::Object(Map::new());
        }
        let Some(root) = package_json.as_object_mut() else {
            return;
        };
        let scripts = root
            .entry("scripts")
            .or_insert_with(|| Value::Object(Map::new()));
        if !scripts.is_object() {
            *scripts = Value::Object(Map::new());
        }
        if let Some(map) = scripts.as_object_mut() {
            map.entry("dev".to_string()).or_insert_with(|| {
                Value::String("docker compose up -d && bun --hot run ./src/index.ts".to_string())
            });
        }
        if let Ok(json) = serde_json::to_string_pretty(&package_json) {
            let _ = std::fs::write(&package_json_path, format!("{json}\n"));
        }
    }

    crate::utils::success(format!("Service \"{name}\" added to docker-compose.yml"));
    crate::utils::info("Run 'bun run dev' to start docker containers and the app");
}
