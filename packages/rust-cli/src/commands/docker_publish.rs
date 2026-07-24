use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use clap::Args;
use serde_json::Value;

use crate::utils::{Action, current_dir, ensure_bin, read_credentials, run_actions_rendered};

const DEFAULT_REGISTRY: &str = "docker.io";

#[derive(Args, Debug)]
pub struct DockerPublishArgs {
    #[arg(long)]
    pub packages: Option<String>,

    #[arg(long)]
    pub modules: Option<String>,

    #[arg(long)]
    pub tag: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,

    #[arg(long)]
    pub cwd: Option<String>,
}

#[derive(Clone)]
struct Target {
    base: String,
    name: String,
}

fn split_csv(value: Option<&str>) -> Vec<String> {
    value
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
        .collect()
}

fn discover(cwd: &std::path::Path, dir_name: &str, kind: &'static str) -> Vec<Target> {
    fs::read_dir(cwd.join(dir_name))
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().is_dir())
        .map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let _ = kind;
            Target {
                base: format!("{dir_name}/{name}"),
                name,
            }
        })
        .collect()
}

fn resolve_targets(
    cwd: &std::path::Path,
    packages: Option<&str>,
    modules: Option<&str>,
) -> Vec<Target> {
    if packages.is_none() && modules.is_none() {
        let mut all = discover(cwd, "packages", "package");
        all.extend(discover(cwd, "modules", "module"));
        return all;
    }
    let mut targets = Vec::new();
    for name in split_csv(packages) {
        targets.push(Target {
            base: format!("packages/{name}"),
            name,
        });
    }
    for name in split_csv(modules) {
        targets.push(Target {
            base: format!("modules/{name}"),
            name,
        });
    }
    targets
}

fn read_docker_credentials() -> Option<(String, String, String)> {
    let profile = read_credentials("docker.yml")?;
    let mut registry = DEFAULT_REGISTRY.to_string();
    let mut username = None;
    let mut token = None;
    for (key, value) in profile {
        if key == "registry" {
            registry = value.clone();
        }
        if key == "username" {
            username = Some(value.clone());
        }
        if key == "token" {
            token = Some(value);
        }
    }
    Some((registry, username?, token?))
}

fn docker_login(registry: &str, username: &str, token: &str, cwd: &std::path::Path) -> bool {
    let Ok(mut child) = Command::new("docker")
        .args([
            "login",
            registry,
            "--username",
            username,
            "--password-stdin",
        ])
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    else {
        return false;
    };
    use std::io::Write;
    let Some(stdin) = child.stdin.as_mut() else {
        return false;
    };
    if stdin.write_all(token.as_bytes()).is_err() {
        return false;
    }
    child.wait().map(|status| status.success()).unwrap_or(false)
}

pub fn run(args: &DockerPublishArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    if !ensure_bin("docker") {
        return;
    }
    let targets = resolve_targets(&cwd, args.packages.as_deref(), args.modules.as_deref());
    if targets.is_empty() {
        crate::utils::error("No packages or modules found to publish");
        std::process::exit(1);
    }
    let (registry, username, token) = match read_docker_credentials() {
        Some(value) => value,
        None => {
            crate::utils::error(
                "No Docker credentials found. Run `talos docker:credentials:create` first.",
            );
            std::process::exit(1);
        }
    };
    if !docker_login(&registry, &username, &token, &cwd) {
        crate::utils::error("Docker login failed");
        std::process::exit(1);
    }
    let mut ignored = 0;
    let mut actions: Vec<Action> = Vec::new();
    for target in targets {
        let target_dir = cwd.join(&target.base);
        if !target_dir.join("Dockerfile").exists() {
            ignored += 1;
            continue;
        }
        let version = fs::read_to_string(target_dir.join("package.json"))
            .ok()
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .and_then(|pkg| {
                pkg.get("version")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            });
        let tag = args
            .tag
            .clone()
            .or(version)
            .unwrap_or_else(|| "latest".to_string());
        let repo = format!("{username}/{}", target.name);
        let image = if registry == DEFAULT_REGISTRY || registry.is_empty() {
            format!("{repo}:{tag}")
        } else {
            format!("{registry}/{repo}:{tag}")
        };

        actions.push(Action::new(format!("Publishing {image}"), move || {
            build_and_push(&target_dir, &image)
        }));
    }

    let total = actions.len();
    let failures = run_actions_rendered(actions, !args.silent);
    if !args.silent {
        for (label, message) in &failures {
            crate::utils::error(label.clone());
            if !message.trim().is_empty() {
                eprintln!("{}", message.trim_end());
            }
        }
    }
    let succeeded = total - failures.len();
    if !args.silent {
        println!("Summary: {succeeded} published, {ignored} ignored");
    }
}

fn build_and_push(target_dir: &std::path::Path, image: &str) -> Result<(), String> {
    let build = Command::new("docker")
        .args(["build", "-t", image, "."])
        .current_dir(target_dir)
        .output()
        .map_err(|e| e.to_string())?;
    if !build.status.success() {
        return Err(format!(
            "docker build failed\n{}{}",
            String::from_utf8_lossy(&build.stdout),
            String::from_utf8_lossy(&build.stderr)
        ));
    }

    let push = Command::new("docker")
        .args(["push", image])
        .current_dir(target_dir)
        .output()
        .map_err(|e| e.to_string())?;
    if push.status.success() {
        Ok(())
    } else {
        Err(format!(
            "docker push failed\n{}{}",
            String::from_utf8_lossy(&push.stdout),
            String::from_utf8_lossy(&push.stderr)
        ))
    }
}
