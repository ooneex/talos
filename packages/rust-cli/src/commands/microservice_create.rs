use std::fs;
use std::path::Path;

use clap::Args;
use fs_extra::dir::{CopyOptions, copy as copy_dir};
use serde_json::Value;

use crate::utils::{
    add_path_alias, ask_input, clone_skeleton, current_dir, to_kebab_case, to_pascal_case,
    to_snake_case,
};

const MODULE_TEMPLATE: &str = include_str!("../templates/module/module.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/module/test.txt");
const YML_TEMPLATE: &str = include_str!("../templates/module/yml.txt");
const GITHUB_MICROSERVICE_CI: &str =
    include_str!("../../../cli/src/templates/github/microservice-ci.yml.txt");
const GITHUB_MICROSERVICE_PRODUCTION: &str =
    include_str!("../../../cli/src/templates/github/microservice-production.yml.txt");
const GITLAB_MICROSERVICE: &str =
    include_str!("../../../cli/src/templates/gitlab/microservice.yml.txt");
const BITBUCKET_MICROSERVICE: &str =
    include_str!("../../../cli/src/templates/bitbucket/microservice-pipelines.yml.txt");

/// Rust port of `packages/cli/src/commands/MicroserviceCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct MicroserviceCreateArgs {
    /// Microservice name.
    #[arg(long)]
    pub name: Option<String>,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,

    /// Suppress progress and success messages.
    #[arg(long, default_value_t = false)]
    pub silent: bool,
}

fn detect_ci_provider(cwd: &Path) -> Option<&'static str> {
    if cwd.join(".github").exists() {
        Some("github")
    } else if cwd.join(".gitlab-ci.yml").exists() || cwd.join(".gitlab").exists() {
        Some("gitlab")
    } else if cwd.join("bitbucket-pipelines.yml").exists() || cwd.join(".bitbucket").exists() {
        Some("bitbucket")
    } else {
        None
    }
}

fn collect_used_ports(dir: &Path, used: &mut std::collections::BTreeSet<u16>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let skip = matches!(
                path.file_name().and_then(|name| name.to_str()),
                Some("node_modules" | ".git" | "target" | "dist" | ".turbo" | ".next")
            );
            if !skip {
                collect_used_ports(&path, used);
            }
        } else if path.file_name().and_then(|name| name.to_str()) == Some(".env.yml")
            && let Ok(content) = fs::read_to_string(&path)
        {
            for line in content.lines() {
                let trimmed = line.trim();
                if let Some(value) = trimmed.strip_prefix("port:")
                    && let Ok(port) = value.trim().parse::<u16>()
                {
                    used.insert(port);
                }
            }
        }
    }
}

fn next_available_port(cwd: &Path) -> u16 {
    let mut used = std::collections::BTreeSet::new();
    collect_used_ports(cwd, &mut used);
    let mut port = 8030;
    while used.contains(&port) {
        port += 1;
    }
    port
}

fn add_to_env_yml(env_yml_path: &Path, kebab_name: &str, port: u16) {
    let Ok(mut content) = fs::read_to_string(env_yml_path) else {
        return;
    };
    let entry = format!("  {kebab_name}:\n    url: \"http://localhost:{port}\"\n");
    if content.contains("microservices:\n") {
        if content.contains(&format!("\n  {kebab_name}:")) {
            return;
        }
        content = content.replacen("microservices:\n", &format!("microservices:\n{entry}"), 1);
    } else {
        content = format!("{}\n\nmicroservices:\n{entry}", content.trim_end());
    }
    let _ = fs::write(env_yml_path, content);
}

fn add_gitlab_include(path: &Path, kebab_name: &str) {
    let include_line = format!("  - local: .gitlab/ci/{kebab_name}.yml");
    let mut content = fs::read_to_string(path).unwrap_or_default();
    if content.contains(&include_line) {
        return;
    }
    if content.is_empty() {
        content = format!("include:\n{include_line}\n");
    } else if content.contains("include:\n") {
        content = content.replacen("include:\n", &format!("include:\n{include_line}\n"), 1);
    } else {
        content = format!("include:\n{include_line}\n\n{}", content.trim_start());
    }
    let _ = fs::write(path, content);
}

fn create_ci_cd_files(cwd: &Path, kebab_name: &str, snake_name: &str) -> Option<&'static str> {
    let provider = detect_ci_provider(cwd)?;
    let substitute = |template: &str| {
        template
            .replace("{{NAME_UPPER}}", &snake_name.to_uppercase())
            .replace("{{NAME}}", snake_name)
            .replace("{{name}}", kebab_name)
    };
    match provider {
        "github" => {
            let _ = fs::create_dir_all(cwd.join(".github").join("workflows"));
            let _ = fs::write(
                cwd.join(".github")
                    .join("workflows")
                    .join(format!("{kebab_name}-ci.yml")),
                substitute(GITHUB_MICROSERVICE_CI),
            );
            let _ = fs::write(
                cwd.join(".github")
                    .join("workflows")
                    .join(format!("{kebab_name}-production.yml")),
                substitute(GITHUB_MICROSERVICE_PRODUCTION),
            );
        }
        "gitlab" => {
            let _ = fs::create_dir_all(cwd.join(".gitlab").join("ci"));
            let _ = fs::write(
                cwd.join(".gitlab")
                    .join("ci")
                    .join(format!("{kebab_name}.yml")),
                substitute(GITLAB_MICROSERVICE),
            );
            add_gitlab_include(&cwd.join(".gitlab-ci.yml"), kebab_name);
        }
        _ => {
            let _ = fs::create_dir_all(cwd.join(".bitbucket"));
            let _ = fs::write(
                cwd.join(".bitbucket")
                    .join(format!("{kebab_name}-pipelines.yml")),
                substitute(BITBUCKET_MICROSERVICE),
            );
        }
    }
    Some(provider)
}

pub fn run(args: &MicroserviceCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let silent = args.silent;
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter microservice name") {
            Some(name) => name,
            None => return,
        },
    };

    let pascal_name = to_pascal_case(&name)
        .strip_suffix("Module")
        .map(str::to_string)
        .unwrap_or_else(|| to_pascal_case(&name));
    let kebab_name = to_kebab_case(&pascal_name);
    let snake_name = to_snake_case(&pascal_name);

    let module_dir = cwd.join("modules").join(&kebab_name);
    let src_dir = module_dir.join("src");
    let tests_dir = module_dir.join("tests");

    let Some(repo_dir) = clone_skeleton(silent) else {
        return;
    };
    let template_dir = repo_dir.join("modules").join("microservice");
    let _ = fs::remove_dir_all(&module_dir);
    let _ = fs::create_dir_all(&module_dir);
    let options = CopyOptions::new().content_only(true).overwrite(true);
    if let Err(error) = copy_dir(&template_dir, &module_dir, &options) {
        crate::utils::error(format!("Failed to copy microservice template: {error}"));
        return;
    }

    let _ = fs::remove_file(module_dir.join("microservice.yml"));
    let _ = fs::remove_file(src_dir.join("MicroserviceModule.ts"));
    let _ = fs::remove_file(tests_dir.join("MicroserviceModule.spec.ts"));

    let module_content = MODULE_TEMPLATE.replace("{{NAME}}", &pascal_name);
    let test_content = TEST_TEMPLATE
        .replace("{{NAME}}", &pascal_name)
        .replace("{{name}}", &kebab_name);
    let yml_content = YML_TEMPLATE
        .replace("{{name}}", &kebab_name)
        .replace("type: \"module\"", "type: \"microservice\"");
    let _ = fs::write(
        src_dir.join(format!("{pascal_name}Module.ts")),
        module_content,
    );
    let _ = fs::write(module_dir.join(format!("{kebab_name}.yml")), yml_content);
    let _ = fs::write(
        tests_dir.join(format!("{pascal_name}Module.spec.ts")),
        test_content,
    );

    let index_path = src_dir.join("index.ts");
    if let Ok(index_content) = fs::read_to_string(&index_path) {
        let updated = index_content.replace("MicroserviceModule", &format!("{pascal_name}Module"));
        let _ = fs::write(&index_path, updated);
    }

    let package_path = module_dir.join("package.json");
    if let Ok(raw) = fs::read_to_string(&package_path)
        && let Ok(mut package_json) = serde_json::from_str::<Value>(&raw)
        && let Some(root) = package_json.as_object_mut()
    {
        root.insert(
            "name".to_string(),
            Value::String(format!("@module/{kebab_name}")),
        );
        if let Ok(json) = serde_json::to_string_pretty(&package_json) {
            let _ = fs::write(&package_path, format!("{json}\n"));
        }
    }

    let env_example = fs::read_to_string(repo_dir.join(".env.example.yml")).unwrap_or_default();
    let port = next_available_port(&cwd);
    let env_content = regex::Regex::new(r"(?m)^(\s*port:\s*)\d+")
        .ok()
        .map(|re| {
            re.replace(&env_example, format!("${{1}}{port}"))
                .into_owned()
        })
        .unwrap_or(env_example);
    let _ = fs::write(module_dir.join(".env.yml"), env_content);

    if kebab_name != "app" {
        let env_yml_path = cwd.join(".env.yml");
        if env_yml_path.exists() {
            add_to_env_yml(&env_yml_path, &kebab_name, port);
        }
    }

    let app_tsconfig_path = cwd.join("tsconfig.json");
    if app_tsconfig_path.exists() {
        let _ = add_path_alias(&app_tsconfig_path, &kebab_name);
    }

    let ci_provider = if silent {
        None
    } else {
        create_ci_cd_files(&cwd, &kebab_name, &snake_name)
    };

    if !silent {
        crate::utils::success(format!("modules/{kebab_name} created successfully"));
        if let Some(provider) = ci_provider {
            crate::utils::success(format!("{provider} CI/CD files created for {kebab_name}"));
            if provider == "bitbucket" {
                crate::utils::info(format!(
                    "Merge .bitbucket/{kebab_name}-pipelines.yml into bitbucket-pipelines.yml (Bitbucket supports a single pipelines file)"
                ));
            }
        }
    }
}
