//! `swagger:create` — scaffold the API explorer and write one route file per
//! controller it documents.
//!
//! The explorer itself is a browser module copied from the skeleton, the way
//! `storybook:create` copies the gallery. What is generated on top of it is the
//! documentation: every `@Route.<verb>` decorator in the target's controllers
//! becomes a `src/features/<module>/<Name>.route.ts` carrying the half of the
//! contract a decorator actually states — verb, path, version, roles, the
//! declared `params`/`queries`/`payload` fields. The half it does not state —
//! prose, examples, error statuses — is left as a stub for the
//! `swagger-create` skill to write, and is preserved on every re-run.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use clap::Args;
use fs_extra::dir::{CopyOptions, copy as copy_dir};

use crate::commands::design_create::{self, DesignCreateArgs};
use crate::utils::frontend_module::{
    collect_design_modules, collect_used_ports, find_free_port, read_dependency_names,
    rewrite_design_alias, rewrite_package_json, rewrite_playwright_port, rewrite_self_imports,
    with_design_field,
};
use crate::utils::{
    Spinner, add_path_alias, ask_input, ask_select, clone_skeleton, current_dir, run_spinner_step,
    to_kebab_case, to_pascal_case,
};

#[derive(Args, Debug)]
pub struct SwaggerCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long, help = "The module whose controllers are documented")]
    pub module: Option<String>,

    #[arg(long, help = "The design module the explorer is styled from")]
    pub design: Option<String>,

    #[arg(
        long,
        help = "Route prefix the backend mounts its controllers under [default: api]"
    )]
    pub prefix: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,

    #[arg(
        long,
        default_value_t = false,
        help = "Bypass the skeleton cache and re-download templates (the cache otherwise auto-refreshes after 24h)"
    )]
    pub no_cache: bool,
}

const DEFAULT_PORT: u16 = 3032;
const DEFAULT_PREFIX: &str = "api";
const CREATE_NEW_DESIGN: &str = "Create a new design";

/// One documented value read off a route type's `params`/`queries`/`payload`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RouteField {
    pub name: String,
    pub ty: String,
    pub required: bool,
}

/// One route, as much of it as a controller states out loud.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RouteDefinition {
    /// PascalCase file stem, e.g. `HealthCheck`.
    pub file_stem: String,
    /// Sentence-case label, e.g. `Health check`.
    pub title: String,
    pub key: String,
    pub version: i64,
    pub method: String,
    /// Served path, prefix and version included.
    pub path: String,
    pub description: String,
    pub roles: Vec<String>,
    pub params: Vec<RouteField>,
    pub queries: Vec<RouteField>,
    pub payload: Vec<RouteField>,
}

fn match_balanced(text: &str, open_index: usize) -> Option<(String, usize)> {
    let mut depth = 0;
    for (i, ch) in text.char_indices().skip(open_index) {
        if ch == '{' {
            depth += 1;
        }
        if ch == '}' {
            depth -= 1;
            if depth == 0 {
                return Some((text[open_index + 1..i].to_string(), i));
            }
        }
    }
    None
}

fn read_module_type(modules_dir: &Path, module_kebab: &str) -> String {
    let yml_file = modules_dir
        .join(module_kebab)
        .join(format!("{module_kebab}.yml"));
    fs::read_to_string(yml_file)
        .ok()
        .and_then(|content| {
            content.lines().find_map(|line| {
                let value = line.trim().strip_prefix("type:")?;
                let value = value.split('#').next().unwrap_or(value);
                Some(value.trim().trim_matches('"').to_string())
            })
        })
        .unwrap_or_else(|| "module".to_string())
}

fn collect_controller_files(dir: &Path, files: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_controller_files(&path, files);
        } else if path.is_file()
            && path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.ends_with("Controller.ts"))
        {
            files.push(path);
        }
    }
}

/// Split one object literal type into its top-level `name: type` members.
///
/// Nested objects, unions and generics all live inside the member's type, so
/// the split tracks bracket depth rather than looking for the next separator.
pub fn split_members(body: &str) -> Vec<(String, String, bool)> {
    let mut members = Vec::new();
    let mut depth = 0;
    let mut current = String::new();

    for ch in body.chars() {
        match ch {
            '{' | '[' | '(' | '<' => {
                depth += 1;
                current.push(ch);
            }
            '}' | ']' | ')' | '>' => {
                depth -= 1;
                current.push(ch);
            }
            ';' | ',' if depth == 0 => {
                members.push(std::mem::take(&mut current));
            }
            _ => current.push(ch),
        }
    }
    members.push(current);

    members
        .into_iter()
        .filter_map(|member| {
            let member = member.trim();
            let (name, ty) = member.split_once(':')?;
            let name = name.trim();
            if name.is_empty() {
                return None;
            }
            let optional = name.ends_with('?');
            let name = name.trim_end_matches('?').trim();
            if !name
                .chars()
                .all(|ch| ch.is_alphanumeric() || ch == '_' || ch == '$')
            {
                return None;
            }
            Some((
                name.to_string(),
                ty.trim().trim_end_matches(';').trim().to_string(),
                !optional,
            ))
        })
        .collect()
}

/// The members of one named block of a route type, e.g. its `queries`.
pub fn extract_block(type_body: &str, block: &str) -> Vec<RouteField> {
    let Ok(pattern) = regex::Regex::new(&format!(r"\b{block}\s*:\s*\{{")) else {
        return Vec::new();
    };
    let Some(matched) = pattern.find(type_body) else {
        return Vec::new();
    };
    let Some((body, _)) = match_balanced(type_body, matched.end().saturating_sub(1)) else {
        return Vec::new();
    };

    split_members(&body)
        .into_iter()
        .map(|(name, ty, required)| RouteField { name, ty, required })
        .collect()
}

/// The `:param` segments of a path, in the order they are served.
pub fn path_params(path: &str) -> Vec<String> {
    regex::Regex::new(r":(\w+)")
        .ok()
        .map(|pattern| {
            pattern
                .captures_iter(path)
                .filter_map(|caps| caps.get(1).map(|m| m.as_str().to_string()))
                .collect()
        })
        .unwrap_or_default()
}

/// `app.health.check` in module `app` → `HealthCheck`.
pub fn file_stem_of(key: &str, module_name: &str) -> String {
    let tail = key
        .strip_prefix(&format!("{module_name}."))
        .unwrap_or(key)
        .replace('.', "-");
    to_pascal_case(&tail)
}

/// `HealthCheck` → `Health check` — a label, not an identifier.
pub fn title_of(file_stem: &str) -> String {
    let spaced = regex::Regex::new(r"([a-z0-9])([A-Z])")
        .ok()
        .map(|pattern| pattern.replace_all(file_stem, "$1 $2").into_owned())
        .unwrap_or_else(|| file_stem.to_string());

    let mut chars = spaced.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase(),
        None => spaced,
    }
}

/// Read one controller into the route it serves.
pub fn parse_controller(content: &str, module_name: &str, prefix: &str) -> Option<RouteDefinition> {
    let decorator = regex::Regex::new(r#"@Route\.(\w+)\(\s*"([^"]+)"\s*,\s*\{"#)
        .ok()?
        .captures(content)?;
    let method = decorator.get(1)?.as_str().to_lowercase();
    let route_path = decorator.get(2)?.as_str().to_string();
    let (config, _) = match_balanced(content, decorator.get(0)?.end().saturating_sub(1))?;

    let key = regex::Regex::new(r#"name\s*:\s*"([^"]+)""#)
        .ok()?
        .captures(&config)?
        .get(1)?
        .as_str()
        .to_string();
    let version = regex::Regex::new(r"version\s*:\s*(\d+)")
        .ok()
        .and_then(|pattern| pattern.captures(&config))
        .and_then(|caps| caps.get(1))
        .and_then(|m| m.as_str().parse::<i64>().ok())
        .unwrap_or(1);
    let description = regex::Regex::new(r#"description\s*:\s*"([^"]*)""#)
        .ok()
        .and_then(|pattern| pattern.captures(&config))
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_default();
    let roles = regex::Regex::new(r"roles\s*:\s*\[([^\]]*)\]")
        .ok()
        .and_then(|pattern| pattern.captures(&config))
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_default()
        .split(',')
        .map(|role| role.trim().trim_matches(['"', '\'']))
        .filter(|role| !role.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();

    // The route type carries the shapes; a controller that declares none still
    // documents fine, it just has no fields to pre-fill.
    let type_body = regex::Regex::new(r"(?:export\s+)?type\s+\w+RouteType\s*=\s*\{")
        .ok()
        .and_then(|pattern| pattern.find(content))
        .and_then(|matched| match_balanced(content, matched.end().saturating_sub(1)))
        .map(|(body, _)| body)
        .unwrap_or_default();

    let mut params = extract_block(&type_body, "params");
    for name in path_params(&route_path) {
        if !params.iter().any(|field| field.name == name) {
            params.push(RouteField {
                name,
                ty: "string".to_string(),
                required: true,
            });
        }
    }

    let file_stem = file_stem_of(&key, module_name);
    Some(RouteDefinition {
        title: title_of(&file_stem),
        file_stem,
        key,
        version,
        method,
        path: format!("/{prefix}/v{version}{route_path}"),
        description,
        roles,
        params,
        queries: extract_block(&type_body, "queries"),
        payload: extract_block(&type_body, "payload"),
    })
}

fn quote(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn render_fields(indent: &str, label: &str, fields: &[RouteField]) -> String {
    if fields.is_empty() {
        return String::new();
    }
    let entries = fields
        .iter()
        .map(|field| {
            format!(
                "{indent}  {{ name: {}, type: {}, required: {}, description: \"\" }},",
                quote(&field.name),
                quote(&field.ty),
                field.required
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!("{indent}{label}: [\n{entries}\n{indent}],\n")
}

/// The `*.route.ts` a route generates.
pub fn render_route_file(definition: &RouteDefinition, group: &str) -> String {
    let roles = definition
        .roles
        .iter()
        .map(|role| quote(role))
        .collect::<Vec<_>>()
        .join(", ");

    let mut body = String::new();
    body.push_str(&format!("  title: {},\n", quote(&definition.title)));
    body.push_str(&format!("  group: {},\n", quote(group)));
    body.push_str(&format!("  key: {},\n", quote(&definition.key)));
    body.push_str(&format!("  version: {},\n", definition.version));
    body.push_str(&format!("  method: {},\n", quote(&definition.method)));
    body.push_str(&format!("  path: {},\n", quote(&definition.path)));
    body.push_str(&format!("  roles: [{roles}],\n"));
    body.push_str(&format!("  summary: {},\n", quote(&definition.description)));
    body.push_str("  description: \"\",\n");
    body.push_str(&render_fields("  ", "params", &definition.params));
    body.push_str(&render_fields("  ", "queries", &definition.queries));
    if !definition.payload.is_empty() {
        body.push_str("  payload: {\n");
        body.push_str(&render_fields("    ", "fields", &definition.payload));
        body.push_str("  },\n");
    }
    body.push_str("  responses: [{ status: 200, description: \"\" }],\n");

    format!(
        "import type {{ RouteMetaType }} from \"../../shared/route\";\n\nexport const meta = {{\n{body}}} satisfies RouteMetaType;\n"
    )
}

/// The OpenAPI document the generated routes add up to, published for consumers
/// that read a specification rather than the explorer.
///
/// The mount prefix goes in `servers` and the paths carry only `/v<version>`.
/// That is what OpenAPI means by a server — and it is also the shape
/// `project:check --only=openapi` compares against, since a controller's
/// decorator states the route without the prefix the app mounts it under.
pub fn render_openapi(definitions: &[(String, RouteDefinition)], prefix: &str) -> String {
    let mut paths: std::collections::BTreeMap<String, Vec<&RouteDefinition>> =
        std::collections::BTreeMap::new();
    let parameter = regex::Regex::new(r":(\w+)").ok();
    for (_, definition) in definitions {
        if definition.method == "socket" {
            continue;
        }
        let served = definition
            .path
            .strip_prefix(&format!("/{prefix}"))
            .unwrap_or(&definition.path);
        // OpenAPI spells a path parameter `{id}`, a route decorator spells it `:id`.
        let path = parameter
            .as_ref()
            .map(|pattern| pattern.replace_all(served, "{$1}").into_owned())
            .unwrap_or_else(|| served.to_string());
        paths.entry(path).or_default().push(definition);
    }

    let rendered = paths
        .iter()
        .map(|(path, definitions)| {
            let operations = definitions
                .iter()
                .map(|definition| {
                    // The route key is `<module>.<...>`, and the module is the tag.
                    let group = definition.key.split('.').next().unwrap_or("API");
                    let security = if definition.roles.is_empty() {
                        "[]".to_string()
                    } else {
                        "[{ \"bearerAuth\": [] }]".to_string()
                    };
                    format!(
                        "      \"{}\": {{\n        \"operationId\": {},\n        \"summary\": {},\n        \"tags\": [{}],\n        \"responses\": {{ \"200\": {{ \"description\": \"Successful response\" }} }},\n        \"security\": {security}\n      }}",
                        definition.method,
                        quote(&definition.key),
                        quote(&definition.description),
                        quote(&to_pascal_case(group)),
                    )
                })
                .collect::<Vec<_>>()
                .join(",\n");
            format!("    {}: {{\n{operations}\n    }}", quote(path))
        })
        .collect::<Vec<_>>()
        .join(",\n");

    format!(
        "{{\n  \"openapi\": \"3.1.0\",\n  \"info\": {{\n    \"title\": \"API\",\n    \"version\": \"1.0.0\",\n    \"description\": \"Generated by `talos swagger:create` from the target module's controllers. Re-run the generator whenever a route is added, renamed or removed.\"\n  }},\n  \"servers\": [{{ \"url\": \"/{prefix}\" }}],\n  \"components\": {{\n    \"securitySchemes\": {{\n      \"bearerAuth\": {{ \"type\": \"http\", \"scheme\": \"bearer\", \"bearerFormat\": \"JWT\" }}\n    }}\n  }},\n  \"paths\": {{\n{rendered}\n  }}\n}}\n"
    )
}

/// Every route of every module the swagger documents.
///
/// An `api` target aggregates the controllers of every backend module, the way
/// the app itself mounts them; any other target exposes only its own.
fn collect_routes(
    modules_dir: &Path,
    target_module: &str,
    swagger_name: &str,
    prefix: &str,
) -> Vec<(String, RouteDefinition)> {
    let is_api_target = read_module_type(modules_dir, target_module) == "api";
    let mut routes = Vec::new();

    let Ok(entries) = fs::read_dir(modules_dir) else {
        return routes;
    };
    let mut module_dirs: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    module_dirs.sort();

    for module_dir in module_dirs {
        let module_kebab = module_dir
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default();
        if module_kebab == swagger_name {
            continue;
        }
        if is_api_target {
            let kind = read_module_type(modules_dir, &module_kebab);
            if kind != "module" && kind != "api" {
                continue;
            }
        } else if module_kebab != target_module {
            continue;
        }

        let mut controller_files = Vec::new();
        collect_controller_files(
            &module_dir.join("src").join("controllers"),
            &mut controller_files,
        );
        controller_files.sort();
        for file in controller_files {
            if let Ok(content) = fs::read_to_string(file)
                && let Some(definition) = parse_controller(&content, &module_kebab, prefix)
            {
                routes.push((module_kebab.clone(), definition));
            }
        }
    }

    routes
}

fn install_root_dependencies(cwd: &Path, deps: &[String], dev_deps: &[String]) -> bool {
    if !deps.is_empty()
        && !run_spinner_step(
            false,
            "Installing swagger dependencies",
            Command::new("bun")
                .args(["add"])
                .args(deps)
                .current_dir(cwd),
        )
    {
        return false;
    }
    if !dev_deps.is_empty()
        && !run_spinner_step(
            false,
            "Installing swagger dev dependencies",
            Command::new("bun")
                .args(["add", "-D"])
                .args(dev_deps)
                .current_dir(cwd),
        )
    {
        return false;
    }
    true
}

/// Write the `target:` line into the copied manifest, replacing the template's.
fn with_target_field(yml_content: &str, target: &str) -> String {
    let pattern = regex::Regex::new(r#"(?m)^target:\s*".*"$"#).ok();
    match pattern {
        Some(pattern) if pattern.is_match(yml_content) => pattern
            .replace(yml_content, format!("target: \"{target}\""))
            .into_owned(),
        _ => format!("{}\ntarget: \"{target}\"\n", yml_content.trim_end()),
    }
}

pub fn run(args: &SwaggerCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let silent = args.silent;
    let name = match args.name.clone() {
        Some(name) => name,
        None if silent => "swagger".to_string(),
        None => match ask_input("Enter swagger name") {
            Some(name) => name,
            None => return,
        },
    };

    let pascal_name = to_pascal_case(&name)
        .strip_suffix("Module")
        .map(str::to_string)
        .unwrap_or_else(|| to_pascal_case(&name));
    let kebab_name = to_kebab_case(&pascal_name);
    let modules_dir = cwd.join("modules");
    let module_dir = modules_dir.join(&kebab_name);
    let src_dir = module_dir.join("src");
    let target_module = to_kebab_case(&args.module.clone().unwrap_or_else(|| "app".to_string()));
    let prefix = args
        .prefix
        .clone()
        .unwrap_or_else(|| DEFAULT_PREFIX.to_string());
    let prefix = prefix.trim_matches('/').to_string();

    let mut design = args.design.clone();
    if design.is_none() && !silent {
        let existing = collect_design_modules(&modules_dir);
        if existing.is_empty() {
            design = ask_input("Enter design name");
        } else {
            let mut choices: Vec<String> = existing.clone();
            choices.push(CREATE_NEW_DESIGN.to_string());
            let refs: Vec<&str> = choices.iter().map(String::as_str).collect();
            if let Some(index) = ask_select("Choose a design module", &refs) {
                let selected = refs[index];
                design = if selected == CREATE_NEW_DESIGN {
                    ask_input("Enter design name")
                } else {
                    Some(selected.to_string())
                };
            }
        }
    }
    let design_kebab = design.as_ref().map(|value| {
        to_kebab_case(
            to_pascal_case(value)
                .strip_suffix("Module")
                .unwrap_or(&to_pascal_case(value)),
        )
    });

    // The routes are read before the template lands, so re-running the
    // generator over an existing swagger cannot see its own output.
    let routes = collect_routes(&modules_dir, &target_module, &kebab_name, &prefix);

    let clone_spinner = Spinner::start("Downloading swagger template...");
    let cloned = clone_skeleton(true, !args.no_cache);
    clone_spinner.stop();
    let Some(repo_dir) = cloned else {
        return;
    };
    let template_dir = repo_dir.join("modules").join("swagger");

    // Route files are the generated documentation and are merged, never
    // clobbered: everything else in the module is the engine and is replaced.
    let existing_features = src_dir.join("features");
    let preserved: BTreeSet<PathBuf> = if existing_features.is_dir() {
        let mut files = Vec::new();
        crate::utils::frontend_module::visit_files_recursive(&existing_features, &mut |path| {
            files.push(path.to_path_buf());
        });
        files.into_iter().collect()
    } else {
        BTreeSet::new()
    };
    let preserved_contents: Vec<(PathBuf, String)> = preserved
        .iter()
        .filter_map(|path| {
            let relative = path.strip_prefix(&existing_features).ok()?.to_path_buf();
            Some((relative, fs::read_to_string(path).ok()?))
        })
        .collect();

    let _ = fs::remove_dir_all(&module_dir);
    let _ = fs::create_dir_all(&module_dir);
    let options = CopyOptions::new().content_only(true).overwrite(true);
    if let Err(error) = copy_dir(&template_dir, &module_dir, &options) {
        crate::utils::error(format!("Failed to copy swagger template: {error}"));
        return;
    }

    let template_yml = module_dir.join("swagger.yml");
    let yml_path = module_dir.join(format!("{kebab_name}.yml"));
    if let Ok(yml_content) = fs::read_to_string(&template_yml) {
        let updated = with_target_field(
            &with_design_field(&yml_content, design_kebab.as_deref()),
            &target_module,
        );
        let _ = fs::write(&yml_path, updated);
        if template_yml != yml_path {
            let _ = fs::remove_file(&template_yml);
        }
    }

    let port = find_free_port(&collect_used_ports(&modules_dir, &kebab_name), DEFAULT_PORT);
    let package_path = module_dir.join("package.json");
    let (deps, dev_deps) = read_dependency_names(&package_path);
    rewrite_package_json(&package_path, &kebab_name, port);
    rewrite_playwright_port(&module_dir.join("playwright.config.ts"), port);
    rewrite_self_imports(&src_dir, "swagger", &kebab_name);
    rewrite_design_alias(&module_dir.join("vite.config.ts"), design_kebab.as_deref());

    // The template ships one example route; the generated ones replace it.
    let features_dir = src_dir.join("features");
    let _ = fs::remove_dir_all(&features_dir);
    let _ = fs::create_dir_all(&features_dir);
    for (relative, content) in &preserved_contents {
        let destination = features_dir.join(relative);
        if let Some(parent) = destination.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(destination, content);
    }

    let mut written = 0;
    for (module_kebab, definition) in &routes {
        let group = to_pascal_case(module_kebab);
        let feature_dir = features_dir.join(module_kebab);
        let _ = fs::create_dir_all(&feature_dir);
        let file_path = feature_dir.join(format!("{}.route.ts", definition.file_stem));
        // A route documented by hand keeps its prose; only new routes are written.
        if file_path.exists() {
            continue;
        }
        let _ = fs::write(&file_path, render_route_file(definition, &group));
        written += 1;
    }

    let _ = fs::write(
        module_dir.join("public").join("openapi.json"),
        render_openapi(&routes, &prefix),
    );

    if !install_root_dependencies(&cwd, &deps, &dev_deps) {
        return;
    }

    if let Some(design_name) = design.as_ref()
        && let Some(design_kebab) = design_kebab.as_ref()
        && !modules_dir.join(design_kebab).exists()
    {
        design_create::run(&DesignCreateArgs {
            name: Some(design_name.clone()),
            cwd: Some(cwd.to_string_lossy().to_string()),
            silent,
            no_cache: args.no_cache,
        });
    }

    let app_tsconfig_path = cwd.join("tsconfig.json");
    if app_tsconfig_path.exists() {
        let _ = add_path_alias(&app_tsconfig_path, &kebab_name);
    }

    if !silent {
        crate::utils::success(format!(
            "modules/{kebab_name} created with {written} route file(s) from {} route(s)",
            routes.len()
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HEALTH_CONTROLLER: &str = r#"
import type { ContextType } from "@talosjs/controller";
import { Route } from "@talosjs/routing";

type HealthRouteType = {
  response: { status: string; timestamp: string };
};

@Route.get("/health", {
  name: "app.health.check",
  version: 1,
  description: "Report whether the app is up and reachable",
  roles: [],
})
export class HealthController {}
"#;

    const GRANT_CONTROLLER: &str = r#"
type GrantRouteType = {
  params: { userId: string };
  queries: { page?: number; search?: string };
  payload: { plan: "free" | "pro"; seats: number };
  response: { granted: boolean };
};

@Route.post("/entitlement/:userId/grants", {
  name: "entitlement.grant",
  version: 2,
  description: "Grant an entitlement to a user",
  roles: ["ROLE_ADMIN", "ROLE_OWNER"],
})
export class GrantEntitlementController {}
"#;

    #[test]
    fn reads_the_decorator_a_controller_declares() {
        let route = parse_controller(HEALTH_CONTROLLER, "app", "api").expect("a route");

        assert_eq!(route.key, "app.health.check");
        assert_eq!(route.method, "get");
        assert_eq!(route.path, "/api/v1/health");
        assert_eq!(route.roles, Vec::<String>::new());
        assert_eq!(route.file_stem, "HealthCheck");
        assert_eq!(route.title, "Health check");
    }

    #[test]
    fn bakes_the_prefix_and_the_version_into_the_path() {
        let route = parse_controller(GRANT_CONTROLLER, "entitlement", "gateway").expect("a route");

        assert_eq!(route.path, "/gateway/v2/entitlement/:userId/grants");
    }

    #[test]
    fn reads_every_documented_field_off_the_route_type() {
        let route = parse_controller(GRANT_CONTROLLER, "entitlement", "api").expect("a route");

        assert_eq!(
            route.params,
            vec![RouteField {
                name: "userId".to_string(),
                ty: "string".to_string(),
                required: true,
            }]
        );
        assert_eq!(
            route.queries,
            vec![
                RouteField {
                    name: "page".to_string(),
                    ty: "number".to_string(),
                    required: false,
                },
                RouteField {
                    name: "search".to_string(),
                    ty: "string".to_string(),
                    required: false,
                },
            ]
        );
        assert_eq!(route.payload.len(), 2);
        assert_eq!(route.payload[0].ty, "\"free\" | \"pro\"");
    }

    #[test]
    fn takes_a_path_parameter_the_route_type_forgot_to_declare() {
        let controller = GRANT_CONTROLLER.replace("params: { userId: string };\n", "");
        let route = parse_controller(&controller, "entitlement", "api").expect("a route");

        assert_eq!(route.params.len(), 1);
        assert_eq!(route.params[0].name, "userId");
    }

    #[test]
    fn keeps_the_roles_that_make_a_route_protected() {
        let route = parse_controller(GRANT_CONTROLLER, "entitlement", "api").expect("a route");

        assert_eq!(route.roles, vec!["ROLE_ADMIN", "ROLE_OWNER"]);
    }

    #[test]
    fn reads_no_route_out_of_a_file_with_no_decorator() {
        assert!(parse_controller("export class Nothing {}", "app", "api").is_none());
    }

    #[test]
    fn splits_members_without_being_fooled_by_a_nested_shape() {
        let members = split_members("a: { b: string; c: number }; d: string[]");

        assert_eq!(members.len(), 2);
        assert_eq!(members[0].0, "a");
        assert_eq!(members[1].1, "string[]");
    }

    #[test]
    fn renders_a_route_file_that_satisfies_the_meta_contract() {
        let route = parse_controller(GRANT_CONTROLLER, "entitlement", "api").expect("a route");
        let file = render_route_file(&route, "Entitlement");

        assert!(file.contains("import type { RouteMetaType } from \"../../shared/route\";"));
        assert!(file.contains("} satisfies RouteMetaType;"));
        assert!(file.contains("method: \"post\""));
        assert!(file.contains("roles: [\"ROLE_ADMIN\", \"ROLE_OWNER\"]"));
        assert!(file.contains("group: \"Entitlement\""));
        assert!(file.contains("payload: {"));
    }

    #[test]
    fn escapes_a_quote_so_the_generated_file_still_parses() {
        let mut route = parse_controller(HEALTH_CONTROLLER, "app", "api").expect("a route");
        route.description = "the \"live\" probe".to_string();

        assert!(render_route_file(&route, "App").contains(r#"summary: "the \"live\" probe""#));
    }

    #[test]
    fn publishes_a_specification_spelling_parameters_the_openapi_way() {
        let route = parse_controller(GRANT_CONTROLLER, "entitlement", "api").expect("a route");
        let spec = render_openapi(&[("entitlement".to_string(), route)], "api");

        // The mount prefix lives in `servers`, so the path is what the decorator
        // states — which is what the openapi check compares against.
        assert!(spec.contains("\"/v2/entitlement/{userId}/grants\""));
        assert!(spec.contains("\"servers\": [{ \"url\": \"/api\" }]"));
        assert!(spec.contains("\"bearerAuth\": []"));
    }

    #[test]
    fn leaves_a_socket_route_out_of_the_specification() {
        let mut route = parse_controller(HEALTH_CONTROLLER, "app", "api").expect("a route");
        route.method = "socket".to_string();

        assert!(!render_openapi(&[("app".to_string(), route)], "api").contains("/v1/health"));
    }

    #[test]
    fn sets_the_target_the_swagger_documents() {
        let yml = "type: \"swagger\"\ndesign: \"design\"\ntarget: \"app\"\n";

        assert!(with_target_field(yml, "gateway").contains("target: \"gateway\""));
    }
}
