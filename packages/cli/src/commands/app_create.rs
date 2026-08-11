use std::fs;
use std::path::Path;

use clap::Args;

use crate::commands::app_init::{self, AppInitOptions, AppType};
use crate::utils::{
    ask_confirm, ask_select, print_onboarding, read_template, resolve_name_and_destination,
    skeleton_templates_dir, to_snake_case,
};

pub const CI_PROVIDERS: [&str; 3] = ["github", "gitlab", "bitbucket"];

#[derive(Args, Debug)]
pub struct AppCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub destination: Option<String>,

    #[arg(
        long,
        default_value_t = false,
        help = "Bypass the skeleton template cache and re-download templates (auto-refreshes after 24h); does not update the installed talos CLI binary itself — rerun the install script for that"
    )]
    pub no_cache: bool,
}

pub fn run(args: &AppCreateArgs) {
    let Some((name, kebab_name, destination)) =
        resolve_name_and_destination(args.name.clone(), args.destination.clone())
    else {
        return;
    };

    let create_ci_cd = ask_confirm("Create CI/CD files?", true);
    let provider = if create_ci_cd {
        ask_select("Choose CI/CD provider", &CI_PROVIDERS)
            .map(|provider_index| CI_PROVIDERS[provider_index])
    } else {
        None
    };

    let Some(destination) = app_init::execute(AppInitOptions {
        name: name.clone(),
        destination,
        silent: false,
        app_type: Some(AppType::Api),
        no_cache: args.no_cache,
        announce: false,
    }) else {
        return;
    };
    let snake_name = to_snake_case(&name);

    if let Some(provider) = provider {
        create_ci_cd_files(provider, &destination, &snake_name, args.no_cache);
    }

    crate::utils::success(format!(
        "{kebab_name} created successfully at {}",
        destination.display()
    ));
    print_onboarding(&destination);
}

/// Writes the chosen provider's CI/CD files and reports the outcome. A failure
/// here is reported but never aborts the run: the app itself is already
/// scaffolded, so the closing summary still applies.
fn create_ci_cd_files(provider: &str, destination: &Path, snake_name: &str, no_cache: bool) {
    let Some(templates_dir) = skeleton_templates_dir(false, !no_cache) else {
        return;
    };

    let spinner = crate::utils::Spinner::start(format!("Writing {provider} CI/CD files..."));
    let written = write_ci_cd_files(&templates_dir, destination, provider, snake_name);
    spinner.stop();

    match written {
        Ok(()) => crate::utils::success(format!("{provider} CI/CD files created")),
        Err(error) => {
            if !error.is_empty() {
                crate::utils::error(&error);
            }
        }
    }
}

pub fn write_named(path: &Path, template: &str, snake_name: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, template.replace("{{NAME}}", snake_name)).map_err(|e| e.to_string())
}

pub fn write_ci_cd_files(
    templates_dir: &Path,
    destination: &Path,
    provider: &str,
    snake_name: &str,
) -> Result<(), String> {
    let read = |name: &str| read_template(templates_dir, name).ok_or_else(String::new);

    match provider {
        "github" => {
            write_named(
                &destination.join(".github").join("workflows").join("ci.yml"),
                &read("github/ci.yml.txt")?,
                snake_name,
            )?;
            write_named(
                &destination
                    .join(".github")
                    .join("workflows")
                    .join("production.yml"),
                &read("github/production.yml.txt")?,
                snake_name,
            )?;
        }
        "gitlab" => {
            write_named(
                &destination.join(".gitlab").join("ci").join("ci.yml"),
                &read("gitlab/ci.yml.txt")?,
                snake_name,
            )?;
            write_named(
                &destination
                    .join(".gitlab")
                    .join("ci")
                    .join("production.yml"),
                &read("gitlab/production.yml.txt")?,
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
                &read("bitbucket/pipelines.yml.txt")?,
                snake_name,
            )?;
        }
    }

    fs::write(
        destination.join("renovate.json"),
        read("renovate.json.txt")?,
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
