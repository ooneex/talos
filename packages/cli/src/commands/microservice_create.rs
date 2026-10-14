use std::fs;
use std::path::Path;

use clap::Args;
use fs_extra::dir::{CopyOptions, copy as copy_dir};
use serde_json::Value;

use crate::utils::{
    add_path_alias, ask_input, clone_skeleton, collect_runnable_modules, current_dir,
    find_app_module, read_template, to_kebab_case, to_pascal_case, to_snake_case,
};

#[derive(Args, Debug)]
pub struct MicroserviceCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,

    #[arg(
        long,
        default_value_t = false,
        help = "Bypass the skeleton template cache and re-download templates (auto-refreshes after 24h); does not update the installed talos CLI binary itself — rerun the install script for that"
    )]
    pub no_cache: bool,
}

pub fn detect_ci_provider(cwd: &Path) -> Option<&'static str> {
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

pub fn collect_used_ports(dir: &Path, used: &mut std::collections::BTreeSet<u16>) {
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

pub fn next_available_port(cwd: &Path) -> u16 {
    let mut used = std::collections::BTreeSet::new();
    collect_used_ports(cwd, &mut used);
    let mut port = 8030;
    while used.contains(&port) {
        port += 1;
    }
    port
}

pub fn add_to_env_yml(env_yml_path: &Path, kebab_name: &str, port: u16) {
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

pub fn add_gitlab_include(path: &Path, kebab_name: &str) {
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

fn create_ci_cd_files(
    cwd: &Path,
    templates_dir: &Path,
    kebab_name: &str,
    snake_name: &str,
) -> Option<&'static str> {
    let provider = detect_ci_provider(cwd)?;
    let substitute = |template: &str| {
        template
            .replace("{{NAME_UPPER}}", &snake_name.to_uppercase())
            .replace("{{NAME}}", snake_name)
            .replace("{{name}}", kebab_name)
    };
    match provider {
        "github" => {
            let ci = read_template(templates_dir, "github/microservice-ci.yml.txt")?;
            let production =
                read_template(templates_dir, "github/microservice-production.yml.txt")?;
            let _ = fs::create_dir_all(cwd.join(".github").join("workflows"));
            let _ = fs::write(
                cwd.join(".github")
                    .join("workflows")
                    .join(format!("{kebab_name}-ci.yml")),
                substitute(&ci),
            );
            let _ = fs::write(
                cwd.join(".github")
                    .join("workflows")
                    .join(format!("{kebab_name}-production.yml")),
                substitute(&production),
            );
        }
        "gitlab" => {
            let template = read_template(templates_dir, "gitlab/microservice.yml.txt")?;
            let _ = fs::create_dir_all(cwd.join(".gitlab").join("ci"));
            let _ = fs::write(
                cwd.join(".gitlab")
                    .join("ci")
                    .join(format!("{kebab_name}.yml")),
                substitute(&template),
            );
            add_gitlab_include(&cwd.join(".gitlab-ci.yml"), kebab_name);
        }
        _ => {
            let template =
                read_template(templates_dir, "bitbucket/microservice-pipelines.yml.txt")?;
            let _ = fs::create_dir_all(cwd.join(".bitbucket"));
            let _ = fs::write(
                cwd.join(".bitbucket")
                    .join(format!("{kebab_name}-pipelines.yml")),
                substitute(&template),
            );
        }
    }
    Some(provider)
}

/// Names derived from the requested microservice name, in the various
/// casings the scaffolding step needs.
struct MicroserviceNames {
    pascal: String,
    kebab: String,
    snake: String,
}

fn resolve_microservice_names(args: &MicroserviceCreateArgs) -> Option<MicroserviceNames> {
    let name = match args.name.clone() {
        Some(name) => name,
        None => ask_input("Enter microservice name")?,
    };

    let pascal = to_pascal_case(&name)
        .strip_suffix("Module")
        .map(str::to_string)
        .unwrap_or_else(|| to_pascal_case(&name));
    let kebab = to_kebab_case(&pascal);
    let snake = to_snake_case(&pascal);

    Some(MicroserviceNames {
        pascal,
        kebab,
        snake,
    })
}

/// Rewrites the template's identifiers for the new microservice: the module
/// class, the `@module/microservice` alias the specs import through, and the
/// health route name.
pub fn rename_microservice_identifiers(
    content: &str,
    pascal_name: &str,
    kebab_name: &str,
) -> String {
    content
        .replace("MicroserviceModule", &format!("{pascal_name}Module"))
        .replace("@module/microservice/", &format!("@module/{kebab_name}/"))
        .replace(
            "\"microservice.health.check\"",
            &format!("\"{kebab_name}.health.check\""),
        )
}

fn rename_microservice_identifiers_in(dir: &Path, pascal_name: &str, kebab_name: &str) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            rename_microservice_identifiers_in(&path, pascal_name, kebab_name);
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) != Some("ts") {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&path) {
            let updated = rename_microservice_identifiers(&content, pascal_name, kebab_name);
            if updated != content {
                let _ = fs::write(&path, updated);
            }
        }
    }
}

/// Copies the microservice template into `module_dir` and writes the
/// module/test/yml/package.json files, renamed for `names`. Returns `false`
/// when scaffolding failed and `run` should bail out.
fn scaffold_microservice_files(
    repo_dir: &Path,
    templates_dir: &Path,
    module_dir: &Path,
    names: &MicroserviceNames,
) -> bool {
    let src_dir = module_dir.join("src");
    let tests_dir = module_dir.join("tests");
    let pascal_name = &names.pascal;
    let kebab_name = &names.kebab;

    let template_dir = repo_dir.join("modules").join("microservice");
    let _ = fs::remove_dir_all(module_dir);
    let _ = fs::create_dir_all(module_dir);
    let options = CopyOptions::new().content_only(true).overwrite(true);
    if let Err(error) = copy_dir(&template_dir, module_dir, &options) {
        crate::utils::error(format!("Failed to copy microservice template: {error}"));
        return false;
    }

    let _ = fs::remove_file(module_dir.join("microservice.yml"));

    let Some(yml_template) = read_template(templates_dir, "module/yml.txt") else {
        return false;
    };
    let yml_content = yml_template
        .replace("{{name}}", kebab_name)
        .replace("type: \"module\"", "type: \"microservice\"");
    let _ = fs::write(module_dir.join(format!("{kebab_name}.yml")), yml_content);

    // The template ships a complete, tested microservice (module file listing the
    // health controller, bootstrap, specs). It is renamed in place rather than
    // regenerated from the plain module template, which would drop the health
    // controller and leave the specs pointing at `@module/microservice`.
    let _ = fs::rename(
        src_dir.join("MicroserviceModule.ts"),
        src_dir.join(format!("{pascal_name}Module.ts")),
    );
    let _ = fs::rename(
        tests_dir.join("MicroserviceModule.spec.ts"),
        tests_dir.join(format!("{pascal_name}Module.spec.ts")),
    );
    for dir in [&src_dir, &tests_dir] {
        rename_microservice_identifiers_in(dir, pascal_name, kebab_name);
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

    true
}

/// Writes the module's `.env.yml` with a free port, registers it in the
/// app's `.env.yml` and `tsconfig.json`, and scaffolds CI/CD files unless
/// running silently. Returns the detected CI provider, if any.
fn finalize_microservice_module(
    cwd: &Path,
    repo_dir: &Path,
    templates_dir: &Path,
    module_dir: &Path,
    kebab_name: &str,
    snake_name: &str,
    silent: bool,
) -> Option<&'static str> {
    let env_example = fs::read_to_string(
        repo_dir
            .join("modules")
            .join("app")
            .join(".env.example.yml"),
    )
    .unwrap_or_default();
    let port = next_available_port(cwd);
    let env_content = regex::Regex::new(r"(?m)^(\s*port:\s*)\d+")
        .ok()
        .map(|re| {
            re.replace(&env_example, format!("${{1}}{port}"))
                .into_owned()
        })
        .unwrap_or(env_example);
    let _ = fs::write(module_dir.join(".env.yml"), env_content);

    let runnable_modules = collect_runnable_modules(&cwd.join("modules"));
    let app_module = find_app_module(&runnable_modules);
    if kebab_name != "app"
        && let Some(app_module) = app_module
    {
        let env_yml_path = app_module.dir.join(".env.yml");
        if env_yml_path.exists() {
            add_to_env_yml(&env_yml_path, kebab_name, port);
        }
    }

    let app_tsconfig_path = cwd.join("tsconfig.json");
    if app_tsconfig_path.exists() {
        let _ = add_path_alias(&app_tsconfig_path, kebab_name);
    }

    if silent {
        None
    } else {
        create_ci_cd_files(cwd, templates_dir, kebab_name, snake_name)
    }
}

pub fn run(args: &MicroserviceCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let silent = args.silent;

    let Some(names) = resolve_microservice_names(args) else {
        return;
    };
    let module_dir = cwd.join("modules").join(&names.kebab);

    let Some(repo_dir) = clone_skeleton(silent, !args.no_cache) else {
        return;
    };
    let templates_dir = std::env::var_os(crate::utils::TEMPLATES_DIR_ENV)
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| repo_dir.join("modules").join("templates"));

    if !scaffold_microservice_files(&repo_dir, &templates_dir, &module_dir, &names) {
        return;
    }

    let ci_provider = finalize_microservice_module(
        &cwd,
        &repo_dir,
        &templates_dir,
        &module_dir,
        &names.kebab,
        &names.snake,
        silent,
    );

    if !silent {
        let kebab_name = &names.kebab;
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
