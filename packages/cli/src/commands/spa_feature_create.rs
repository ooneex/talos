use std::process::Command;

use clap::Args;
use serde_json::Value;

use crate::utils::{
    ask_confirm, current_dir, normalize_module_name, prompt_if_missing, read_template,
    run_spinner_step, skeleton_templates_dir, to_kebab_case, to_pascal_case,
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

fn normalize_feature(name: &str) -> (String, String, String) {
    let mut pascal_name = to_pascal_case(name);
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

    (pascal_name, kebab_name, camel_name)
}

#[allow(clippy::too_many_arguments)]
fn feature_files(
    src_dir: &std::path::Path,
    kebab_name: &str,
    pascal_name: &str,
    route_template: &str,
    layout_template: &str,
    not_found_layout_template: &str,
    error_layout_template: &str,
    skeleton_layout_template: &str,
    query_template: &str,
    mutation_template: &str,
    camel_name: &str,
) -> [(std::path::PathBuf, String); 7] {
    let feature_dir = src_dir.join("features").join(kebab_name);
    let layouts_dir = feature_dir.join("layouts");

    [
        (
            src_dir.join("routes").join(format!("{kebab_name}.tsx")),
            render(route_template, pascal_name, camel_name, kebab_name),
        ),
        (
            layouts_dir.join(format!("{pascal_name}Layout.tsx")),
            render(layout_template, pascal_name, camel_name, kebab_name),
        ),
        (
            layouts_dir.join(format!("{pascal_name}NotFoundLayout.tsx")),
            render(
                not_found_layout_template,
                pascal_name,
                camel_name,
                kebab_name,
            ),
        ),
        (
            layouts_dir.join(format!("{pascal_name}ErrorLayout.tsx")),
            render(error_layout_template, pascal_name, camel_name, kebab_name),
        ),
        (
            layouts_dir.join(format!("{pascal_name}SkeletonLayout.tsx")),
            render(
                skeleton_layout_template,
                pascal_name,
                camel_name,
                kebab_name,
            ),
        ),
        (
            feature_dir
                .join("hooks")
                .join(format!("useGet{pascal_name}.ts")),
            render(query_template, pascal_name, camel_name, kebab_name),
        ),
        (
            feature_dir
                .join("hooks")
                .join(format!("useUpdate{pascal_name}.ts")),
            render(mutation_template, pascal_name, camel_name, kebab_name),
        ),
    ]
}

fn has_query_dependency(cwd: &std::path::Path) -> bool {
    std::fs::read_to_string(cwd.join("package.json"))
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
        .unwrap_or(false)
}

struct SpaFeatureTemplates {
    route: String,
    layout: String,
    not_found_layout: String,
    error_layout: String,
    skeleton_layout: String,
    query: String,
    mutation: String,
}

fn load_spa_feature_templates(templates_dir: &std::path::Path) -> Option<SpaFeatureTemplates> {
    Some(SpaFeatureTemplates {
        route: read_template(templates_dir, "spa/spa-feature.route.txt")?,
        layout: read_template(templates_dir, "spa/spa-feature.layout.txt")?,
        not_found_layout: read_template(templates_dir, "spa/spa-feature.not-found-layout.txt")?,
        error_layout: read_template(templates_dir, "spa/spa-feature.error-layout.txt")?,
        skeleton_layout: read_template(templates_dir, "spa/spa-feature.skeleton-layout.txt")?,
        query: read_template(templates_dir, "spa/spa-feature.query.txt")?,
        mutation: read_template(templates_dir, "spa/spa-feature.mutation.txt")?,
    })
}

pub fn run(args: &SpaFeatureCreateArgs) {
    let Some(name) = prompt_if_missing(args.name.clone(), "Enter feature name") else {
        return;
    };
    let Some(module) = prompt_if_missing(args.module.clone(), "Enter spa module name") else {
        return;
    };
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);

    let (pascal_name, kebab_name, camel_name) = normalize_feature(&name);
    let module_name = normalize_module_name(&module);

    let src_dir = cwd.join("modules").join(&module_name).join("src");
    let layout_path = src_dir
        .join("features")
        .join(&kebab_name)
        .join("layouts")
        .join(format!("{pascal_name}Layout.tsx"));

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
    let Some(templates) = load_spa_feature_templates(&templates_dir) else {
        return;
    };
    let files = feature_files(
        &src_dir,
        &kebab_name,
        &pascal_name,
        &templates.route,
        &templates.layout,
        &templates.not_found_layout,
        &templates.error_layout,
        &templates.skeleton_layout,
        &templates.query,
        &templates.mutation,
        &camel_name,
    );

    for (path, content) in files {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&path, content);
        crate::utils::success(format!("{} created successfully", path.display()));
    }

    if !has_query_dependency(&cwd) {
        let _ = run_spinner_step(
            false,
            "Installing @tanstack/react-query",
            Command::new("bun")
                .args(["add", "@tanstack/react-query"])
                .current_dir(&cwd),
        );
    }
}
