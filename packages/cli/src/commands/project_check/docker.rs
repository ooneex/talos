// Docker check — the compose file the whole local stack depends on.
//
// `:latest` tags make an environment unreproducible and duplicate host ports
// make `app:start` fail in a way that reads like an application bug.

use std::fs;
use std::path::{Path, PathBuf};

use serde_yaml::Value;

use super::modules::{discover_modules, filter_modules, relative, wanted_names};

use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Compose file names, in the order they are looked for.
const COMPOSE_FILES: [&str; 4] = [
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
];

/// A problem found in a compose file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DockerFinding {
    pub message: String,
    pub blocking: bool,
}

/// Every compose file in the workspace: the root one, plus any a module owns.
pub fn find_compose_files(root: &Path, module_dirs: &[PathBuf]) -> Vec<PathBuf> {
    std::iter::once(root.to_path_buf())
        .chain(module_dirs.iter().cloned())
        .filter_map(|dir| find_compose(&dir))
        .collect()
}

/// The compose file in a single directory, when there is one.
pub fn find_compose(root: &Path) -> Option<PathBuf> {
    COMPOSE_FILES
        .iter()
        .map(|name| root.join(name))
        .find(|path| path.is_file())
}

/// The host side of a `"8080:80"` style port mapping.
pub fn host_port(mapping: &str) -> Option<String> {
    let mapping = mapping.trim().trim_matches(['"', '\'']);
    let parts: Vec<&str> = mapping.split(':').collect();
    let host = match parts.len() {
        // "80" publishes an ephemeral host port, so nothing can clash.
        0 | 1 => return None,
        2 => parts[0],
        // "127.0.0.1:8080:80"
        _ => parts[1],
    };
    let host = host.split('/').next().unwrap_or(host);
    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
}

/// The host port a single `ports` entry publishes, in whatever form YAML
/// parsed it as (a string, a bare number, or a long-form mapping).
fn port_mapping_text(entry: &Value) -> Option<String> {
    match entry {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        Value::Mapping(value) => value
            .get(Value::from("published"))
            .map(|published| match published {
                Value::String(value) => value.clone(),
                other => format!("{other:?}"),
            })
            .map(|published| format!("{published}:0")),
        _ => None,
    }
}

/// Checks one service's `ports` for a host port already claimed by another
/// service, recording every mapping it publishes along the way.
fn check_service_ports(
    name: &str,
    service: &Value,
    used_ports: &mut Vec<(String, String)>,
    findings: &mut Vec<DockerFinding>,
) {
    let Some(ports) = service.get("ports").and_then(Value::as_sequence) else {
        return;
    };
    for entry in ports {
        let Some(mapping) = port_mapping_text(entry) else {
            continue;
        };
        let Some(port) = host_port(&mapping) else {
            continue;
        };
        if let Some((owner, _)) = used_ports.iter().find(|(_, taken)| *taken == port) {
            findings.push(DockerFinding {
                message: format!("host port {port} is published by both `{owner}` and `{name}`"),
                blocking: true,
            });
        } else {
            used_ports.push((name.to_string(), port));
        }
    }
}

/// Inspect a parsed compose document.
pub fn inspect(document: &Value) -> Vec<DockerFinding> {
    let mut findings = Vec::new();
    let Some(services) = document.get("services").and_then(Value::as_mapping) else {
        return vec![DockerFinding {
            message: "compose file declares no services".to_string(),
            blocking: true,
        }];
    };

    let mut used_ports: Vec<(String, String)> = Vec::new();

    for (key, service) in services {
        let name = key.as_str().unwrap_or("service").to_string();
        let image = service.get("image").and_then(Value::as_str);
        let has_build = service.get("build").is_some();

        match image {
            Some(image) if image.ends_with(":latest") || !image.contains(':') => {
                findings.push(DockerFinding {
                    message: format!("{name}: image `{image}` is unpinned — pin an explicit tag"),
                    blocking: false,
                });
            }
            None if !has_build => {
                findings.push(DockerFinding {
                    message: format!("{name}: declares neither `image` nor `build`"),
                    blocking: true,
                });
            }
            _ => {}
        }

        if service.get("restart").is_none() && !has_build {
            findings.push(DockerFinding {
                message: format!("{name}: no `restart` policy"),
                blocking: false,
            });
        }

        check_service_ports(&name, service, &mut used_ports, &mut findings);
    }

    findings
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let module_dirs: Vec<PathBuf> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .map(|module| module.dir)
    .collect();

    let files = find_compose_files(root, &module_dirs);
    if files.is_empty() {
        return CheckOutcome::new(
            CheckId::Docker,
            CheckStatus::Skipped,
            "no compose file in the workspace",
        );
    }

    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    for path in &files {
        let label = relative(root, path);
        let Ok(content) = fs::read_to_string(path) else {
            errors.push(format!("{label} could not be read"));
            continue;
        };
        let document: Value = match serde_yaml::from_str(&content) {
            Ok(document) => document,
            Err(error) => {
                errors.push(format!("{label} is not valid YAML: {error}"));
                continue;
            }
        };
        for finding in inspect(&document) {
            let line = format!("{label}: {}", finding.message);
            if finding.blocking {
                errors.push(line);
            } else {
                warnings.push(line);
            }
        }
    }

    let scope = format!(
        "{} compose file{}",
        files.len(),
        if files.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Docker,
        &scope,
        "services are pinned and ports do not clash",
        errors,
        warnings,
    )
    .with_hint("`talos docker:create --name <service>` adds a service with the right defaults")
}
