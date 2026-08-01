use std::process::Command;

use clap::Args;
use serde_json::Value;

use crate::utils::{
    ask_confirm, ask_input, current_dir, read_template, run_spinner_step, skeleton_templates_dir,
    to_kebab_case, to_pascal_case,
};

#[derive(Args, Debug)]
pub struct SpaFeatureCreateArgs {
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

    #[arg(long, default_value_t = false)]
    pub r#override: bool,

    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn render(template: &str, pascal_name: &str, camel_name: &str, kebab_name: &str) -> String {
    template
        .replace("{{NAME}}", pascal_name)
        .replace("{{CAMEL}}", camel_name)
        .replace("{{KEBAB}}", kebab_name)
}

pub fn run(args: &SpaFeatureCreateArgs) {
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter feature name") {
            Some(name) => name,
            None => return,
        },
    };
    let module = match args.module.clone() {
        Some(module) => module,
        None => match ask_input("Enter spa module name") {
            Some(module) => module,
            None => return,
        },
    };
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);

    let mut pascal_name = to_pascal_case(&name);
    if let Some(stripped) = pascal_name.strip_suffix("Feature") {
        pascal_name = stripped.to_string();
    }
    if let Some(stripped) = pascal_name.strip_suffix("Layout") {
        pascal_name = stripped.to_string();
    }
    let kebab_name = to_kebab_case(&pascal_name);
    let camel_name = format!(
        "{}{}",
        pascal_name
            .chars()
            .next()
            .unwrap_or_default()
            .to_ascii_lowercase(),
        pascal_name.chars().skip(1).collect::<String>()
    );
    let module_name = to_kebab_case(
        to_pascal_case(&module)
            .strip_suffix("Module")
            .unwrap_or(&to_pascal_case(&module)),
    );

    let src_dir = cwd.join("modules").join(&module_name).join("src");
    let layouts_dir = src_dir.join("features").join(&kebab_name).join("layouts");
    let layout_path = layouts_dir.join(format!("{pascal_name}Layout.tsx"));

    if !args.r#override
        && layout_path.exists()
        && !ask_confirm(
            &format!("Feature \"{kebab_name}\" already exists. Override it?"),
            false,
        )
    {
        return;
    }

    let Some(templates_dir) = skeleton_templates_dir(false, !args.no_cache) else {
        return;
    };
    let Some(route_template) = read_template(&templates_dir, "spa/spa-feature.route.txt") else {
        return;
    };
    let Some(layout_template) = read_template(&templates_dir, "spa/spa-feature.layout.txt") else {
        return;
    };
    let Some(not_found_layout_template) =
        read_template(&templates_dir, "spa/spa-feature.not-found-layout.txt")
    else {
        return;
    };
    let Some(error_layout_template) =
        read_template(&templates_dir, "spa/spa-feature.error-layout.txt")
    else {
        return;
    };
    let Some(skeleton_layout_template) =
        read_template(&templates_dir, "spa/spa-feature.skeleton-layout.txt")
    else {
        return;
    };
    let Some(query_template) = read_template(&templates_dir, "spa/spa-feature.query.txt") else {
        return;
    };
    let Some(mutation_template) = read_template(&templates_dir, "spa/spa-feature.mutation.txt")
    else {
        return;
    };

    let feature_dir = src_dir.join("features").join(&kebab_name);
    let files = [
        (
            src_dir.join("routes").join(format!("{kebab_name}.tsx")),
            render(&route_template, &pascal_name, &camel_name, &kebab_name),
        ),
        (
            layout_path.clone(),
            render(&layout_template, &pascal_name, &camel_name, &kebab_name),
        ),
        (
            layouts_dir.join(format!("{pascal_name}NotFoundLayout.tsx")),
            render(
                &not_found_layout_template,
                &pascal_name,
                &camel_name,
                &kebab_name,
            ),
        ),
        (
            layouts_dir.join(format!("{pascal_name}ErrorLayout.tsx")),
            render(
                &error_layout_template,
                &pascal_name,
                &camel_name,
                &kebab_name,
            ),
        ),
        (
            layouts_dir.join(format!("{pascal_name}SkeletonLayout.tsx")),
            render(
                &skeleton_layout_template,
                &pascal_name,
                &camel_name,
                &kebab_name,
            ),
        ),
        (
            feature_dir
                .join("hooks")
                .join(format!("useGet{pascal_name}.ts")),
            render(&query_template, &pascal_name, &camel_name, &kebab_name),
        ),
        (
            feature_dir
                .join("hooks")
                .join(format!("useUpdate{pascal_name}.ts")),
            render(&mutation_template, &pascal_name, &camel_name, &kebab_name),
        ),
    ];

    for (path, content) in files {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&path, content);
        crate::utils::success(format!("{} created successfully", path.display()));
    }

    let package_json_path = cwd.join("package.json");
    let has_dependency = std::fs::read_to_string(&package_json_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .map(|package_json| {
            package_json
                .get("dependencies")
                .and_then(Value::as_object)
                .and_then(|deps| deps.get("@tanstack/react-query"))
                .is_some()
                || package_json
                    .get("devDependencies")
                    .and_then(Value::as_object)
                    .and_then(|deps| deps.get("@tanstack/react-query"))
                    .is_some()
        })
        .unwrap_or(false);

    if !has_dependency {
        let _ = run_spinner_step(
            false,
            "Installing @tanstack/react-query",
            Command::new("bun")
                .args(["add", "@tanstack/react-query"])
                .current_dir(&cwd),
        );
    }
}
