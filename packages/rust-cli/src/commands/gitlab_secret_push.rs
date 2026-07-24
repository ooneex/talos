use std::path::PathBuf;

use clap::Args;
use serde_json::json;

use crate::utils::{ask_input, ask_password, current_dir, git_origin_url, read_credentials};

#[derive(Args, Debug)]
pub struct GitlabSecretPushArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub value: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,

    #[arg(long)]
    pub cwd: Option<String>,
}

fn read_token() -> Option<String> {
    let profile = read_credentials("gitlab.yml")?;
    profile
        .into_iter()
        .find_map(|(key, value)| (key == "token").then_some(value))
}

fn parse_project(input: &str) -> Option<(String, String)> {
    let remote = input.trim().trim_end_matches('/').trim_end_matches(".git");
    let ssh = regex::Regex::new(r"^(?:ssh://)?git@([^/:]+)[:/](.+)$")
        .ok()?
        .captures(remote);
    let https = regex::Regex::new(r"^https?://(?:[^@/]+@)?([^/]+)/(.+)$")
        .ok()?
        .captures(remote);
    let host = ssh
        .as_ref()
        .and_then(|caps| caps.get(1))
        .or_else(|| https.as_ref().and_then(|caps| caps.get(1)))?
        .as_str()
        .to_string();
    let path = ssh
        .as_ref()
        .and_then(|caps| caps.get(2))
        .or_else(|| https.as_ref().and_then(|caps| caps.get(2)))?
        .as_str()
        .to_string();
    regex::Regex::new(r"^[^/\s]+/[^\s]+$")
        .ok()?
        .is_match(&path)
        .then_some((host, path))
}

fn percent_encode(input: &str) -> String {
    input
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{:02X}", byte),
        })
        .collect()
}

fn curl_json(method: &str, url: &str, body: &str, token: &str) -> Option<(u16, String)> {
    let request = ureq::request(method, url)
        .set("PRIVATE-TOKEN", token)
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

pub fn run(args: &GitlabSecretPushArgs) {
    let token = match read_token() {
        Some(token) => token,
        None => {
            if !args.silent {
                crate::utils::error(
                    "No GitLab credentials found. Run `talos gitlab:credentials:create` first.",
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
    let (host, path) = match git_origin_url(&cwd).and_then(|url| parse_project(&url)) {
        Some(project) => project,
        None => {
            if !args.silent {
                crate::utils::error(
                    "Could not determine the GitLab project from `.git/config` in the current directory.",
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
        "https://{host}/api/v4/projects/{}/variables",
        percent_encode(&path)
    );
    let body = json!({"key": name, "value": value, "masked": true, "protected": false}).to_string();
    let result = curl_json("POST", &base, &body, &token)
        .or_else(|| Some((0, "curl failed".to_string())))
        .unwrap();
    let ok = if result.0 == 200 || result.0 == 201 {
        true
    } else if result.0 == 400 && result.1.to_lowercase().contains("already been taken") {
        let update_body = json!({"value": value, "masked": true, "protected": false}).to_string();
        curl_json(
            "PUT",
            &format!("{base}/{}", percent_encode(&name)),
            &update_body,
            &token,
        )
        .map(|(code, _)| code == 200)
        .unwrap_or(false)
    } else {
        false
    };
    if !ok {
        if !args.silent {
            crate::utils::error(format!("Failed to push variable \"{name}\" to {path}"));
            eprintln!("{}", result.1.trim());
        }
        std::process::exit(1);
    }
    if !args.silent {
        crate::utils::success(format!("Variable \"{name}\" pushed to {path}"));
        crate::utils::info(format!("View it at https://{host}/{path}/-/settings/ci_cd"));
    }
}
