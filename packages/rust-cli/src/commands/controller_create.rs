use clap::Args;
use regex::Regex;

use crate::utils::{
    ask_confirm, ask_input, ask_route_method, ask_route_name, ask_route_path, current_dir,
    ensure_module, install_dependency, to_kebab_case, to_pascal_case,
};

const CONTROLLER_TEMPLATE: &str = include_str!("../templates/controller.txt");
const SOCKET_CONTROLLER_TEMPLATE: &str = include_str!("../templates/controller.socket.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/controller.test.txt");

/// Rust port of `packages/cli/src/commands/ControllerCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct ControllerCreateArgs {
    /// Controller class name.
    #[arg(long)]
    pub name: Option<String>,

    /// Destination module (defaults to "shared").
    #[arg(long)]
    pub module: Option<String>,

    /// Generate a socket controller instead of an HTTP controller.
    #[arg(long)]
    pub is_socket: Option<bool>,

    /// Overwrite the file if it already exists without prompting.
    #[arg(long, default_value_t = false)]
    pub r#override: bool,

    /// Route name (for example: api.users.list).
    #[arg(long = "route.name")]
    pub route_name: Option<String>,

    /// Route path (for example: /users).
    #[arg(long = "route.path")]
    pub route_path: Option<String>,

    /// Route method (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD).
    #[arg(long = "route.method")]
    pub route_method: Option<String>,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

fn normalize_route_path(route_path: &str) -> String {
    let trimmed = route_path.trim();
    if trimmed == "/" {
        return "/".to_string();
    }

    let normalized = trimmed
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            if let Some(param) = segment.strip_prefix(':') {
                format!(":{}", to_kebab_case(param))
            } else {
                to_kebab_case(segment)
            }
        })
        .collect::<Vec<_>>()
        .join("/");

    format!("/{normalized}")
}

fn add_class_to_module(module_path: &std::path::Path, class_name: &str) -> Result<(), String> {
    let mut content = std::fs::read_to_string(module_path).map_err(|error| error.to_string())?;
    let import_line = format!("import {{ {class_name} }} from \"./controllers/{class_name}\";\n");

    if !content.contains(&import_line) {
        let last_import_index = content.rfind("import ").unwrap_or(0);
        let line_end = content[last_import_index..]
            .find('\n')
            .map(|index| last_import_index + index)
            .unwrap_or(content.len().saturating_sub(1));
        content = format!(
            "{}{import_line}{}",
            &content[..=line_end.min(content.len().saturating_sub(1))],
            &content[(line_end + 1).min(content.len())..]
        );
    }

    let Ok(re) = Regex::new(r"(?s)(controllers:\s*\[)([^\]]*)") else {
        return std::fs::write(module_path, content).map_err(|error| error.to_string());
    };

    if let Some(caps) = re.captures(&content) {
        let existing = caps.get(2).map(|m| m.as_str().trim()).unwrap_or("");
        if !existing.contains(class_name) {
            let new_value = if existing.is_empty() {
                class_name.to_string()
            } else {
                format!("{existing}, {class_name}")
            };
            let whole = caps
                .get(0)
                .map(|m| m.as_str())
                .unwrap_or_default()
                .to_string();
            let prefix = caps
                .get(1)
                .map(|m| m.as_str())
                .unwrap_or_default()
                .to_string();
            content = content.replacen(&whole, &format!("{prefix}{new_value}"), 1);
        }
    }

    std::fs::write(module_path, content).map_err(|error| error.to_string())
}

pub fn run(args: &ControllerCreateArgs) {
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter controller name") {
            Some(name) => name,
            None => return,
        },
    };
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let module = args.module.clone().unwrap_or_else(|| "shared".to_string());

    let is_socket = args
        .is_socket
        .unwrap_or_else(|| ask_confirm("Is this a socket controller?", false));

    let mut name = to_pascal_case(&name);
    if let Some(stripped) = name.strip_suffix("Controller") {
        name = stripped.to_string();
    }

    let route_name = match args.route_name.clone() {
        Some(route_name) => route_name,
        None => match ask_route_name("Enter route name (e.g., api.user.create)") {
            Some(route_name) => route_name,
            None => return,
        },
    };
    let route_type_name = to_pascal_case(&route_name);

    let route_path = match args.route_path.clone() {
        Some(route_path) => route_path,
        None => match ask_route_path("Enter route path", "/") {
            Some(route_path) => route_path,
            None => return,
        },
    };
    let route_path = normalize_route_path(&route_path);

    let route_method = if is_socket {
        None
    } else {
        match args.route_method.clone() {
            Some(route_method) => Some(route_method.to_lowercase()),
            None => ask_route_method("Enter route method").map(|method| method.to_lowercase()),
        }
    };

    let selected_template = if is_socket {
        SOCKET_CONTROLLER_TEMPLATE
    } else {
        CONTROLLER_TEMPLATE
    };
    let mut content = selected_template.replace("{{NAME}}", &name);
    content = content
        .replace("{{ROUTE_NAME}}", &route_name)
        .replace("{{TYPE_NAME}}", &route_type_name)
        .replace("{{ROUTE_PATH}}", &route_path);
    if let Some(route_method) = route_method {
        content = content.replace("{{ROUTE_METHOD}}", &route_method);
    }

    ensure_module(&module, &cwd);

    let base = cwd.join("modules").join(&module);
    let controllers_dir = base.join("src").join("controllers");
    let file_path = controllers_dir.join(format!("{name}Controller.ts"));

    if !args.r#override
        && file_path.exists()
        && !ask_confirm(
            &format!("Controller \"{name}Controller\" already exists. Override it?"),
            false,
        )
    {
        return;
    }

    if let Err(error) = std::fs::create_dir_all(&controllers_dir) {
        crate::utils::error(format!(
            "Failed to create {}: {error}",
            controllers_dir.display()
        ));
        return;
    }
    if let Err(error) = std::fs::write(&file_path, content) {
        crate::utils::error(format!("Failed to write {}: {error}", file_path.display()));
        return;
    }

    let test_content = TEST_TEMPLATE
        .replace("{{NAME}}", &name)
        .replace("{{MODULE}}", &module);
    let tests_dir = base.join("tests").join("controllers");
    let test_file_path = tests_dir.join(format!("{name}Controller.spec.ts"));
    let _ = std::fs::create_dir_all(&tests_dir);
    if let Err(error) = std::fs::write(&test_file_path, test_content) {
        crate::utils::error(format!(
            "Failed to write {}: {error}",
            test_file_path.display()
        ));
        return;
    }

    let module_pascal_name = to_pascal_case(&module);
    let module_path = base
        .join("src")
        .join(format!("{module_pascal_name}Module.ts"));
    if module_path.exists() {
        let _ = add_class_to_module(&module_path, &format!("{name}Controller"));
    }

    crate::utils::success(format!("{} created successfully", file_path.display()));
    crate::utils::success(format!("{} created successfully", test_file_path.display()));

    install_dependency("@talosjs/controller", &cwd);
}
