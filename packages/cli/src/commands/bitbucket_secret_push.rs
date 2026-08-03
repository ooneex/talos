use std::path::PathBuf;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use clap::Args;
use serde_json::json;

use crate::utils::{ask_input, ask_password, current_dir, git_origin_url, read_credentials};
const BITBUCKET_API_BASE_ENV: &str = "TALOS_BITBUCKET_API_BASE";

#[derive(Args, Debug)]
pub struct BitbucketSecretPushArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub value: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,

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

/// The `<workspace>/<slug>` pair a Bitbucket remote points at, whether the
/// remote is written as SSH or HTTPS.
pub fn parse_repository(input: &str) -> Option<(String, String)> {
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

pub fn basic_auth_header(username: &str, token: &str) -> String {
    format!("Basic {}", BASE64.encode(format!("{username}:{token}")))
}

fn curl_bitbucket(
    method: &str,
    url: &str,
    body: &str,
    username: &str,
    token: &str,
) -> Option<(u16, String)> {
    let request = match method {
        "POST" => ureq::post(url),
        "PUT" => ureq::put(url),
        _ => return None,
    }
    .config()
    .http_status_as_error(false)
    .build()
    .header("Authorization", &basic_auth_header(username, token))
    .header("Content-Type", "application/json");
    match request.send(body) {
        Ok(response) => {
            let status = response.status().as_u16();
            Some((
                status,
                response.into_body().read_to_string().unwrap_or_default(),
            ))
        }
        Err(_) => None,
    }
}

/// The uuid Bitbucket already holds for `name`, walking the paged listing.
pub fn find_variable_uuid(base: &str, name: &str, username: &str, token: &str) -> Option<String> {
    let mut url = format!("{base}?pagelen=100");
    loop {
        let value: serde_json::Value = ureq::get(&url)
            .header("Authorization", &basic_auth_header(username, token))
            .call()
            .ok()?
            .into_body()
            .read_json()
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

/// Create the pipeline variable, or replace the one Bitbucket already holds
/// under that name. `base` is the variables collection of one repository.
///
/// Returns the body Bitbucket answered with on failure, so the caller can print
/// it.
pub fn push_variable(
    base: &str,
    name: &str,
    value: &str,
    username: &str,
    token: &str,
) -> Result<(), String> {
    let body = json!({"key": name, "value": value, "secured": true}).to_string();
    let (status, response) =
        curl_bitbucket("POST", base, &body, username, token).unwrap_or((0, "curl failed".into()));

    if status == 200 || status == 201 {
        return Ok(());
    }

    // 409 means the variable is already there, so it is updated in place.
    if status == 409 {
        let Some(uuid) = find_variable_uuid(base, name, username, token) else {
            return Err(response);
        };
        let (status, _) = curl_bitbucket("PUT", &format!("{base}{uuid}"), &body, username, token)
            .unwrap_or((0, String::new()));
        return if status == 200 { Ok(()) } else { Err(response) };
    }

    Err(response)
}

fn bitbucket_api_base() -> String {
    std::env::var(BITBUCKET_API_BASE_ENV)
        .unwrap_or_else(|_| "https://api.bitbucket.org".to_string())
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
        "{}/2.0/repositories/{workspace}/{slug}/pipelines_config/variables/",
        bitbucket_api_base().trim_end_matches('/')
    );
    if let Err(response) = push_variable(&base, &name, &value, &username, &token) {
        if !args.silent {
            crate::utils::error(format!(
                "Failed to push variable \"{name}\" to {workspace}/{slug}"
            ));
            eprintln!("{}", response.trim());
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
