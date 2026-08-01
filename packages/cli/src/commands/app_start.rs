use std::fs;
use std::path::Path;
use std::process::Command;

use clap::Args;
use portable_pty::CommandBuilder;
use serde_json::Value;

use crate::utils::{
    ConcurrentCommand, ConcurrentlyOptions, KillCondition, PrefixColor, PrefixStyle,
    RunnableModule, RunnableModuleType, StartupNotice, SuccessCondition, collect_runnable_modules,
    current_dir, ensure_bin, run_concurrently, run_spinner_step, select_runnable_modules,
};

#[derive(Args, Debug)]
pub struct AppStartArgs {
    #[arg(long)]
    pub modules: Option<String>,

    #[arg(long)]
    pub packages: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn load_app_module_name(app_dir: &Path, fallback: &str) -> Option<String> {
    let package_json_path = app_dir.join("package.json");
    let raw = fs::read_to_string(package_json_path).ok()?;
    let package_json = serde_json::from_str::<Value>(&raw).ok()?;
    Some(
        package_json
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(fallback)
            .to_string(),
    )
}

pub fn command_line(module_dir: &Path, module_type: RunnableModuleType) -> String {
    match module_type {
        RunnableModuleType::Spa
        | RunnableModuleType::Storybook
        | RunnableModuleType::Swagger
        | RunnableModuleType::Admin => "bun run dev".to_string(),
        RunnableModuleType::Api | RunnableModuleType::Microservice => {
            let entry = module_dir.join("src").join("index.ts");
            format!("bun --hot run {}", entry.display())
        }
    }
}

fn build_command(cwd: &Path, module_dir: &Path, module_type: RunnableModuleType) -> CommandBuilder {
    let mut command = CommandBuilder::new("bun");
    match module_type {
        RunnableModuleType::Spa
        | RunnableModuleType::Storybook
        | RunnableModuleType::Swagger
        | RunnableModuleType::Admin => {
            command.arg("run");
            command.arg("dev");
            command.cwd(module_dir);
        }
        RunnableModuleType::Api | RunnableModuleType::Microservice => {
            command.arg("--hot");
            command.arg("run");
            command.arg(module_dir.join("src").join("index.ts"));
            command.cwd(cwd);
        }
    }
    for (key, value) in std::env::vars() {
        command.env(key, value);
    }
    if std::env::var_os("TERM").is_none() {
        command.env("TERM", "xterm-256color");
    }
    command
}

fn build_concurrent_command(cwd: &Path, module: &RunnableModule) -> ConcurrentCommand {
    let cwd = cwd.to_path_buf();
    let module_dir = module.dir.clone();
    let module_type = module.r#type;
    ConcurrentCommand::new(
        module.name.clone(),
        command_line(&module.dir, module.r#type),
        move || build_command(&cwd, &module_dir, module_type),
    )
    .with_color(PrefixColor::Auto)
}

pub fn run(args: &AppStartArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let app_dir = cwd.join("modules").join("app");
    let Some(name) = load_app_module_name(&app_dir, "app") else {
        crate::utils::error("Module app not found");
        return;
    };

    let modules = collect_runnable_modules(&cwd.join("modules"));
    if modules.is_empty() {
        crate::utils::error("No runnable modules found");
        return;
    }

    let selected =
        select_runnable_modules(&modules, args.modules.as_deref(), args.packages.as_deref());
    if selected.is_empty() {
        crate::utils::error("No matching modules found");
        return;
    }

    let needs_docker = selected.iter().any(|module| {
        matches!(
            module.r#type,
            RunnableModuleType::Api | RunnableModuleType::Microservice
        )
    });
    let compose_exists = needs_docker && app_dir.join("docker-compose.yml").exists();
    if compose_exists {
        if !ensure_bin("docker") {
            return;
        }
        if !run_spinner_step(
            false,
            &format!("Starting Docker services for {name}"),
            Command::new("docker")
                .args(["compose", "up", "-d"])
                .current_dir(&app_dir),
        ) {
            return;
        }
    }

    let module_names = selected
        .iter()
        .map(|module| module.name.clone())
        .collect::<Vec<_>>()
        .join(", ");

    let commands = selected
        .iter()
        .map(|module| build_concurrent_command(&cwd, module))
        .collect::<Vec<_>>();

    let options = ConcurrentlyOptions {
        prefix: if commands.len() > 1 {
            PrefixStyle::Name
        } else {
            PrefixStyle::None
        },
        kill_others_on: vec![KillCondition::Failure],
        success_condition: SuccessCondition::All,
        startup: Some(StartupNotice {
            starting_label: format!("Starting {module_names}"),
            started_message: format!("{module_names} started"),
        }),
        ..ConcurrentlyOptions::default()
    };

    let outcome = run_concurrently(commands, options);
    if !outcome.success {
        std::process::exit(outcome.exit_code);
    }
}
