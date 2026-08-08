use std::path::Path;

use clap::Args;

use crate::utils::{
    add_class_to_module, ask_confirm, ask_input, ask_route_method, ask_route_name, ask_route_path,
    current_dir, ensure_module, install_dependency, read_template, skeleton_templates_dir,
    to_kebab_case, to_pascal_case,
};

#[derive(Args, Debug)]
pub struct ControllerCreateArgs {
    #[arg(
        long,
        default_value_t = false,
        help = "Bypass the skeleton cache and re-download templates (the cache otherwise auto-refreshes after 24h)"
    )]
    pub no_cache: bool,

    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long)]
    pub is_socket: Option<bool>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,

    #[arg(long = "route.name")]
    pub route_name: Option<String>,

    #[arg(long = "route.path")]
    pub route_path: Option<String>,

    #[arg(long = "route.method")]
    pub route_method: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn normalize_route_path(route_path: &str) -> String {
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

/// The values resolved from flags or prompts before any file is touched.
struct ResolvedControllerArgs {
    name: String,
    cwd: std::path::PathBuf,
    module: String,
    is_socket: bool,
    route_name: String,
    route_type_name: String,
    route_path: String,
    route_method: Option<String>,
}

/// Resolves every flag/prompt this command needs, returning `None` when the
/// user cancels an interactive prompt.
fn resolve_controller_args(args: &ControllerCreateArgs) -> Option<ResolvedControllerArgs> {
    let name = match args.name.clone() {
        Some(name) => name,
        None => ask_input("Enter controller name")?,
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
        None => ask_route_name("Enter route name (e.g., api.user.create)")?,
    };
    let route_type_name = to_pascal_case(&route_name);

    let route_path = match args.route_path.clone() {
        Some(route_path) => route_path,
        None => ask_route_path("Enter route path", "/")?,
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

    Some(ResolvedControllerArgs {
        name,
        cwd,
        module,
        is_socket,
        route_name,
        route_type_name,
        route_path,
        route_method,
    })
}

/// Renders the controller's source content from its template, substituting
/// the resolved name, route metadata, and (when not a socket controller) the
/// route method.
fn build_controller_content(
    templates_dir: &Path,
    resolved: &ResolvedControllerArgs,
) -> Option<String> {
    let template_file = if resolved.is_socket {
        "controller.socket.txt"
    } else {
        "controller.txt"
    };
    let selected_template = read_template(templates_dir, template_file)?;
    let mut content = selected_template.replace("{{NAME}}", &resolved.name);
    content = content
        .replace("{{ROUTE_NAME}}", &resolved.route_name)
        .replace("{{TYPE_NAME}}", &resolved.route_type_name)
        .replace("{{ROUTE_PATH}}", &resolved.route_path);
    if let Some(route_method) = &resolved.route_method {
        content = content.replace("{{ROUTE_METHOD}}", route_method);
    }
    Some(content)
}

pub fn run(args: &ControllerCreateArgs) {
    let Some(resolved) = resolve_controller_args(args) else {
        return;
    };
    let ResolvedControllerArgs {
        name, cwd, module, ..
    } = &resolved;

    let Some(templates_dir) = skeleton_templates_dir(false, !args.no_cache) else {
        return;
    };
    let Some(content) = build_controller_content(&templates_dir, &resolved) else {
        return;
    };
    let Some(test_template) = read_template(&templates_dir, "controller.test.txt") else {
        return;
    };

    ensure_module(module, cwd);

    let base = cwd.join("modules").join(module);
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

    let test_content = test_template
        .replace("{{NAME}}", name)
        .replace("{{MODULE}}", module);
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

    let module_pascal_name = to_pascal_case(module);
    let module_path = base
        .join("src")
        .join(format!("{module_pascal_name}Module.ts"));
    if module_path.exists() {
        let _ = add_class_to_module(
            &module_path,
            &format!("{name}Controller"),
            "controllers",
            "controllers",
        );
    }

    crate::utils::success(format!("{} created successfully", file_path.display()));
    crate::utils::success(format!("{} created successfully", test_file_path.display()));

    install_dependency("@talosjs/controller", cwd);
}
