use std::path::PathBuf;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use clap::Args;
use serde_json::json;

use crate::utils::{ask_input, ask_password, current_dir, git_origin_url, read_credentials};

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

fn basic_auth_header(username: &str, token: &str) -> String {
    format!("Basic {}", BASE64.encode(format!("{username}:{token}")))
}

fn curl_bitbucket(
    method: &str,
    url: &str,
    body: &str,
    username: &str,
    token: &str,
) -> Option<(u16, String)> {
    let request = ureq::request(method, url)
        .set("Authorization", &basic_auth_header(username, token))
        .set("Content-Type", "application/json");
    match request.send_string(body) {
        Ok(response) => Some((
            response.status(),
            response.into_string().unwrap_or_default(),
        )),
        Err(ureq::Error::Status(code, response)) => {
            Some((code, response.into_string().unwrap_or_default()))
        }
        Err(ureq::Error::Transport(_)) => None,
    }
}

fn find_variable_uuid(base: &str, name: &str, username: &str, token: &str) -> Option<String> {
    let mut url = format!("{base}?pagelen=100");
    loop {
        let value: serde_json::Value = ureq::get(&url)
            .set("Authorization", &basic_auth_header(username, token))
            .call()
            .ok()?
            .into_json()
            .ok()?;
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
                crate::utils::error(
                    "No Bitbucket credentials found. Run `talos bitbucket:credentials:create` first.",
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
                crate::utils::error(
                    "Could not determine the Bitbucket repository from `.git/config` in the current directory.",
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
            crate::utils::error(format!(
                "Failed to push variable \"{name}\" to {workspace}/{slug}"
            ));
            eprintln!("{}", result.1.trim());
        }
        std::process::exit(1);
    }
    if !args.silent {
        crate::utils::success(format!("Variable \"{name}\" pushed to {workspace}/{slug}"));
        crate::utils::info(format!(
            "View it at https://bitbucket.org/{workspace}/{slug}/admin/pipelines/repository-variables"
        ));
    }
}
