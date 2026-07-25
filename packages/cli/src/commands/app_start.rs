use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use clap::Args;
use console::style;
use serde_json::Value;

use crate::utils::{
    RunnableModuleType, Spinner, collect_runnable_modules, current_dir, ensure_bin,
    run_spinner_step, select_runnable_modules,
};

enum LogEvent {
    Line { module: String, text: String },
}

fn styled_prefix(module: &str, index: usize) -> String {
    let prefix = style(format!("[{module}]")).bold();
    let prefix = match index % 6 {
        0 => prefix.cyan(),
        1 => prefix.magenta(),
        2 => prefix.green(),
        3 => prefix.yellow(),
        4 => prefix.blue(),
        _ => prefix.red(),
    };
    prefix.to_string()
}

fn print_log_line(module: &str, text: &str, order: &[String], multiple: bool) {
    if multiple {
        let index = order.iter().position(|name| name == module).unwrap_or(0);
        println!("{} {text}", styled_prefix(module, index));
    } else {
        println!("{text}");
    }
}

#[derive(Args, Debug)]
pub struct AppStartArgs {
    #[arg(long)]
    pub modules: Option<String>,

    #[arg(long)]
    pub packages: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,
}

fn load_app_module_name(app_dir: &Path, fallback: &str) -> Option<String> {
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

fn spawn_module(
    cwd: &Path,
    module_dir: &Path,
    module_type: RunnableModuleType,
) -> std::io::Result<Child> {
    let mut command = Command::new("bun");
    match module_type {
        RunnableModuleType::Spa | RunnableModuleType::Storybook | RunnableModuleType::Swagger => {
            command.arg("run").arg("dev").current_dir(module_dir);
        }
        RunnableModuleType::Api | RunnableModuleType::Microservice => {
            command
                .args(["--hot", "run"])
                .arg(module_dir.join("src").join("index.ts"))
                .current_dir(cwd);
        }
    }
    command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
}

fn forward_stream<R: std::io::Read + Send + 'static>(
    module: String,
    reader: R,
    sender: mpsc::Sender<LogEvent>,
) {
    thread::spawn(move || {
        let buffered = BufReader::new(reader);
        for line in buffered.lines().map_while(Result::ok) {
            if sender
                .send(LogEvent::Line {
                    module: module.clone(),
                    text: line,
                })
                .is_err()
            {
                break;
            }
        }
    });
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
        .collect::<Vec<_>>();
    let label = format!("Starting {}", module_names.join(", "));

    let mut children = Vec::new();
    for module in &selected {
        match spawn_module(&cwd, &module.dir, module.r#type) {
            Ok(child) => children.push((module.name.clone(), child)),
            Err(error) => {
                crate::utils::error(format!("Failed to start {}: {error}", module.name));
                for (_, mut child) in children {
                    let _ = child.kill();
                }
                return;
            }
        }
    }

    let (sender, receiver) = mpsc::channel::<LogEvent>();
    for (name, child) in &mut children {
        if let Some(stdout) = child.stdout.take() {
            forward_stream(name.clone(), stdout, sender.clone());
        }
        if let Some(stderr) = child.stderr.take() {
            forward_stream(name.clone(), stderr, sender.clone());
        }
    }
    drop(sender);

    let multiple = children.len() > 1;
    let mut spinner = Some(Spinner::start(format!("{label}...")));
    let mut exit_code = 0;

    loop {
        while let Ok(LogEvent::Line { module, text }) = receiver.try_recv() {
            if let Some(active) = spinner.take() {
                active.stop();
                crate::utils::success(format!("{} started", module_names.join(", ")));
            }
            print_log_line(&module, &text, &module_names, multiple);
        }

        let mut index = 0;
        let mut failure: Option<(String, i32)> = None;
        while index < children.len() {
            match children[index].1.try_wait() {
                Ok(Some(status)) if status.success() => {
                    children.remove(index);
                }
                Ok(Some(status)) => {
                    let (name, _) = children.remove(index);
                    failure = Some((name, status.code().unwrap_or(1)));
                    break;
                }
                Ok(None) => index += 1,
                Err(error) => {
                    let (name, _) = children.remove(index);
                    crate::utils::error(format!("Failed while waiting for {name}: {error}"));
                    failure = Some((name, 1));
                    break;
                }
            }
        }

        if let Some((name, code)) = failure {
            if let Some(active) = spinner.take() {
                active.stop();
            }
            crate::utils::error(format!("{name} exited with code {code}"));
            exit_code = code;
            for (_, mut child) in children.drain(..) {
                let _ = child.kill();
            }
            break;
        }

        if children.is_empty() {
            break;
        }

        thread::sleep(Duration::from_millis(60));
    }

    while let Ok(LogEvent::Line { module, text }) = receiver.try_recv() {
        print_log_line(&module, &text, &module_names, multiple);
    }

    if spinner.take().is_some() && exit_code == 0 {
        crate::utils::success(format!("{} started", module_names.join(", ")));
    }

    if exit_code != 0 {
        std::process::exit(exit_code);
    }
}
