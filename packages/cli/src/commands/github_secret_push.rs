use std::path::PathBuf;
use std::process::{Command, Stdio};

use clap::Args;

use crate::utils::{
    ask_input, ask_password, current_dir, ensure_bin, git_origin_url, read_credentials,
};

#[derive(Args, Debug)]
pub struct GithubSecretPushArgs {
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
    let profile = read_credentials("github.yml")?;
    profile
        .into_iter()
        .find_map(|(key, value)| (key == "token").then_some(value))
}

fn normalize_repository(input: &str) -> Option<String> {
    let slug = input
        .trim()
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .replace("git@github.com:", "")
        .replace("https://github.com/", "")
        .replace("http://github.com/", "")
        .replace("ssh://git@github.com/", "");
    regex::Regex::new(r"^[^/\s]+/[^/\s]+$")
        .ok()?
        .is_match(&slug)
        .then_some(slug)
}

pub fn run(args: &GithubSecretPushArgs) {
    if !ensure_bin("gh") {
        return;
    }
    let token = match read_token() {
        Some(token) => token,
        None => {
            if !args.silent {
                crate::utils::error(
                    "No GitHub credentials found. Run `talos github:credentials:create` first.",
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
    let slug = match git_origin_url(&cwd).and_then(|url| normalize_repository(&url)) {
        Some(slug) => slug,
        None => {
            if !args.silent {
                crate::utils::error(
                    "Could not determine the GitHub repository from `.git/config` in the current directory.",
                );
            }
            std::process::exit(1);
        }
    };
    let name = args
        .name
        .clone()
        .or_else(|| ask_input("Enter secret name"))
        .unwrap_or_default();
    let value = args
        .value
        .clone()
        .or_else(|| ask_password("Enter secret value"))
        .unwrap_or_default();

    let mut child = Command::new("gh")
        .args(["secret", "set", &name, "--repo", &slug])
        .current_dir(&cwd)
        .env("GH_TOKEN", token)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap_or_else(|error| {
            crate::utils::error(format!("Failed to run gh: {error}"));
            std::process::exit(1);
        });
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let _ = stdin.write_all(value.as_bytes());
    }
    let output = child.wait_with_output().unwrap_or_else(|error| {
        crate::utils::error(format!("Failed to push secret: {error}"));
        std::process::exit(1);
    });
    if !output.status.success() {
        if !args.silent {
            let raw = format!(
                "{}\n{}",
                String::from_utf8_lossy(&output.stdout).trim(),
                String::from_utf8_lossy(&output.stderr).trim()
            );
            crate::utils::error(format!("Failed to push secret \"{name}\" to {slug}"));
            if !raw.trim().is_empty() {
                eprintln!("{}", raw.trim());
            }
        }
        std::process::exit(1);
    }
    if !args.silent {
        crate::utils::success(format!("Secret \"{name}\" pushed to {slug}"));
        crate::utils::info(format!(
            "View it at https://github.com/{slug}/settings/secrets/actions"
        ));
    }
}
