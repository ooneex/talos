use std::path::PathBuf;
use std::process::Command;

use clap::Args;
use serde_json::json;

use crate::utils::{ask_input, ask_password, current_dir, read_credentials};

/// Rust port of `packages/cli/src/commands/BitbucketSecretPushCommand.ts`.
#[derive(Args, Debug)]
pub struct BitbucketSecretPushArgs {
    /// Variable name.
    #[arg(long)]
    pub name: Option<String>,

    /// Variable value.
    #[arg(long)]
    pub value: Option<String>,

    /// Suppress success/error messages.
    #[arg(long, default_value_t = false)]
    pub silent: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

fn read_credentials_pair() -> Option<(String, String)> {
    let profile = read_credentials("bitbucket.yml")?;
    let mut username = None;
    let mut token = None;
    for (key, value) in profile {
        if key == "username" {
            username = Some(value.clone());
        }
        if key == "token" {
            token = Some(value);
        }
    }
    Some((username?, token?))
}

fn git_origin_url(cwd: &std::path::Path) -> Option<String> {
    let output = Command::new("git")
        .args(["config", "--get", "remote.origin.url"])
        .current_dir(cwd)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn parse_repository(input: &str) -> Option<(String, String)> {
    let remote = input.trim().trim_end_matches('/').trim_end_matches(".git");
    let path = regex::Regex::new(r"^(?:ssh://)?git@[^/:]+[:/](.+)$")
        .ok()?
        .captures(remote)
        .and_then(|caps| caps.get(1).map(|m| m.as_str().to_string()))
        .or_else(|| {
            regex::Regex::new(r"^https?://(?:[^@/]+@)?[^/]+/(.+)$")
                .ok()?
                .captures(remote)
                .and_then(|caps| caps.get(1).map(|m| m.as_str().to_string()))
        })?;
    let parts: Vec<&str> = path.split('/').collect();
    (parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty())
        .then(|| (parts[0].to_string(), parts[1].to_string()))
}

fn curl_bitbucket(
    method: &str,
    url: &str,
    body: &str,
    username: &str,
    token: &str,
) -> Option<(u16, String)> {
    let output = Command::new("curl")
        .args([
            "-sS",
            "-X",
            method,
            url,
            "-u",
            &format!("{username}:{token}"),
            "-H",
            "Content-Type: application/json",
            "-w",
            "\n%{http_code}",
            "-d",
            body,
        ])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let (body, code) = stdout.rsplit_once('\n')?;
    Some((code.trim().parse().ok()?, body.to_string()))
}

fn find_variable_uuid(base: &str, name: &str, username: &str, token: &str) -> Option<String> {
    let mut url = format!("{base}?pagelen=100");
    loop {
        let output = Command::new("curl")
            .args(["-sS", &url, "-u", &format!("{username}:{token}")])
            .output()
            .ok()?;
        let value: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
        if let Some(uuid) = value
            .get("values")
            .and_then(|v| v.as_array())
            .and_then(|values| {
                values
                    .iter()
                    .find(|variable| variable.get("key").and_then(|v| v.as_str()) == Some(name))
            })
            .and_then(|variable| variable.get("uuid").and_then(|v| v.as_str()))
        {
            return Some(uuid.to_string());
        }
        let next = value.get("next").and_then(|v| v.as_str())?;
        url = next.to_string();
    }
}

pub fn run(args: &BitbucketSecretPushArgs) {
    let (username, token) = match read_credentials_pair() {
        Some(value) => value,
        None => {
            if !args.silent {
                eprintln!(
                    "✖ No Bitbucket credentials found. Run `talos bitbucket:credentials:create` first."
                );
            }
            std::process::exit(1);
        }
    };
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let (workspace, slug) = match git_origin_url(&cwd).and_then(|url| parse_repository(&url)) {
        Some(repo) => repo,
        None => {
            if !args.silent {
                eprintln!(
                    "✖ Could not determine the Bitbucket repository from `.git/config` in the current directory."
                );
            }
            std::process::exit(1);
        }
    };
    let name = args
        .name
        .clone()
        .or_else(|| ask_input("Enter variable name"))
        .unwrap_or_default();
    let value = args
        .value
        .clone()
        .or_else(|| ask_password("Enter variable value"))
        .unwrap_or_default();
    let base = format!(
        "https://api.bitbucket.org/2.0/repositories/{workspace}/{slug}/pipelines_config/variables/"
    );
    let body = json!({"key": name, "value": value, "secured": true}).to_string();
    let result = curl_bitbucket("POST", &base, &body, &username, &token)
        .unwrap_or((0, "curl failed".to_string()));
    let ok = if result.0 == 200 || result.0 == 201 {
        true
    } else if result.0 == 409 {
        if let Some(uuid) = find_variable_uuid(&base, &name, &username, &token) {
            let update = curl_bitbucket("PUT", &format!("{base}{uuid}"), &body, &username, &token)
                .unwrap_or((0, String::new()));
            update.0 == 200
        } else {
            false
        }
    } else {
        false
    };
    if !ok {
        if !args.silent {
            eprintln!("✖ Failed to push variable \"{name}\" to {workspace}/{slug}");
            eprintln!("{}", result.1.trim());
        }
        std::process::exit(1);
    }
    if !args.silent {
        println!("✔ Variable \"{name}\" pushed to {workspace}/{slug}");
        println!(
            "→ View it at https://bitbucket.org/{workspace}/{slug}/admin/pipelines/repository-variables"
        );
    }
}
