use std::fs;
use std::path::Path;

use clap::Args;

use crate::commands::app_init::{self, AppInitOptions, AppType};
use crate::utils::{ask_confirm, ask_select, resolve_name_and_destination, to_snake_case};

const GITHUB_CI: &str = include_str!("../../../cli/src/templates/github/ci.yml.txt");
const GITHUB_PRODUCTION: &str =
    include_str!("../../../cli/src/templates/github/production.yml.txt");
const GITLAB_CI: &str = include_str!("../../../cli/src/templates/gitlab/ci.yml.txt");
const GITLAB_PRODUCTION: &str =
    include_str!("../../../cli/src/templates/gitlab/production.yml.txt");
const BITBUCKET_PIPELINES: &str =
    include_str!("../../../cli/src/templates/bitbucket/pipelines.yml.txt");
const RENOVATE_JSON: &str = include_str!("../../../cli/src/templates/renovate.json.txt");

pub const CI_PROVIDERS: [&str; 3] = ["github", "gitlab", "bitbucket"];

#[derive(Args, Debug)]
pub struct AppCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub destination: Option<String>,

    #[arg(long, default_value_t = false)]
    pub no_cache: bool,
}

pub fn run(args: &AppCreateArgs) {
    let Some((name, kebab_name, destination)) =
        resolve_name_and_destination(args.name.clone(), args.destination.clone())
    else {
        return;
    };

    let Some(destination) = app_init::execute(AppInitOptions {
        name: name.clone(),
        destination,
        silent: true,
        app_type: Some(AppType::Api),
        no_cache: args.no_cache,
    }) else {
        return;
    };
    let snake_name = to_snake_case(&name);

    crate::utils::success(format!(
        "{kebab_name} created successfully at {}",
        destination.display()
    ));
    println!("\nGet started:\n  cd {}", destination.display());
    println!("\nStart the app:\n  talos app:start");
    println!("Stop the app:\n  talos app:stop");

    let create_ci_cd = ask_confirm("Create CI/CD files?", true);
    if !create_ci_cd {
        return;
    }

    let Some(provider_index) = ask_select("Choose CI/CD provider", &CI_PROVIDERS) else {
        return;
    };
    let provider = CI_PROVIDERS[provider_index];

    let spinner = crate::utils::Spinner::start(format!("Writing {provider} CI/CD files..."));
    let written = write_ci_cd_files(&destination, provider, &snake_name);
    spinner.stop();
    if let Err(error) = written {
        crate::utils::error(&error);
        return;
    }

    crate::utils::success(format!("{provider} CI/CD files created"));
}

pub fn write_named(path: &Path, template: &str, snake_name: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, template.replace("{{NAME}}", snake_name)).map_err(|e| e.to_string())
}

pub fn write_ci_cd_files(
    destination: &Path,
    provider: &str,
    snake_name: &str,
) -> Result<(), String> {
    match provider {
        "github" => {
            write_named(
                &destination.join(".github").join("workflows").join("ci.yml"),
                GITHUB_CI,
                snake_name,
            )?;
            write_named(
                &destination
                    .join(".github")
                    .join("workflows")
                    .join("production.yml"),
                GITHUB_PRODUCTION,
                snake_name,
            )?;
        }
        "gitlab" => {
            write_named(
                &destination.join(".gitlab").join("ci").join("ci.yml"),
                GITLAB_CI,
                snake_name,
            )?;
            write_named(
                &destination
                    .join(".gitlab")
                    .join("ci")
                    .join("production.yml"),
                GITLAB_PRODUCTION,
                snake_name,
            )?;
            fs::write(
                destination.join(".gitlab-ci.yml"),
                "include:\n  - local: .gitlab/ci/ci.yml\n  - local: .gitlab/ci/production.yml\n",
            )
            .map_err(|e| e.to_string())?;
        }
        _ => {
            write_named(
                &destination.join("bitbucket-pipelines.yml"),
                BITBUCKET_PIPELINES,
                snake_name,
            )?;
        }
    }

    fs::write(destination.join("renovate.json"), RENOVATE_JSON).map_err(|e| e.to_string())?;

    Ok(())
}
