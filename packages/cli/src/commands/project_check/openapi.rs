//! OpenAPI check — the published contract against the controllers behind it.
//!
//! A swagger module is a snapshot in exactly the way an SDK module is: the
//! specification is written once and the controllers keep moving. The
//! difference is who pays for the drift. An SDK breaks the build of whoever
//! imports it; a stale specification is read by a third party who has no way to
//! know it is wrong until their integration 404s in production.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use regex::Regex;
use serde_json::Value;

use super::modules::{WorkspaceModule, discover_modules, filter_modules, relative, wanted_names};
use super::routes::{self, Route};
use super::sdk::target_of;
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, EXCLUDED_DIRS, ProjectCheckArgs, static_outcome,
};

/// The file names a specification is published under.
const SPEC_NAMES: [&str; 6] = [
    "openapi.json",
    "openapi.yml",
    "openapi.yaml",
    "swagger.json",
    "swagger.yml",
    "swagger.yaml",
];

/// The methods a path item can declare.
const METHODS: [&str; 7] = ["get", "put", "post", "delete", "options", "head", "patch"];

fn yaml_path_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r#"(?m)^\s{2}["']?(/[^"':\s]*)["']?\s*:"#).expect("the yaml path is valid")
    })
}

fn yaml_method_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r#"(?m)^\s{4}(get|put|post|delete|options|head|patch)\s*:"#)
            .expect("the yaml method is valid")
    })
}

/// One operation, the way both sides of the comparison spell it.
///
/// The version prefix and the parameter syntax differ between a route decorator
/// and a specification, so both are normalised away before anything is compared:
/// `GET /users/{id}` and `get /v1/users/:id` are the same operation.
pub fn operation(method: &str, path: &str) -> String {
    let path = path.trim();
    let without_version = Regex::new(r"^/v\d+")
        .ok()
        .map(|pattern| pattern.replace(path, "").to_string())
        .unwrap_or_else(|| path.to_string());

    let normalized: Vec<String> = without_version
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            if segment.starts_with(':') || (segment.starts_with('{') && segment.ends_with('}')) {
                "{param}".to_string()
            } else {
                segment.to_string()
            }
        })
        .collect();

    format!("{} /{}", method.to_uppercase(), normalized.join("/"))
}

/// The operations a specification publishes.
pub fn spec_operations(content: &str, is_json: bool) -> BTreeSet<String> {
    if is_json {
        return json_operations(content);
    }
    yaml_operations(content)
}

fn json_operations(content: &str) -> BTreeSet<String> {
    let Ok(document) = serde_json::from_str::<Value>(content) else {
        return BTreeSet::new();
    };
    let Some(paths) = document.get("paths").and_then(Value::as_object) else {
        return BTreeSet::new();
    };

    paths
        .iter()
        .flat_map(|(path, item)| {
            let methods: Vec<&str> = item
                .as_object()
                .map(|item| {
                    item.keys()
                        .filter(|key| METHODS.contains(&key.to_ascii_lowercase().as_str()))
                        .map(String::as_str)
                        .collect()
                })
                .unwrap_or_default();
            methods
                .into_iter()
                .map(|method| operation(method, path))
                .collect::<Vec<_>>()
        })
        .collect()
}

/// A hand-written YAML specification, read by indentation.
///
/// Full YAML parsing would buy nothing here: the only thing being compared is
/// the two levels of keys under `paths:`, which the indentation already fixes.
fn yaml_operations(content: &str) -> BTreeSet<String> {
    let Some(start) = content.find("\npaths:").map(|offset| offset + 1) else {
        return BTreeSet::new();
    };
    let body = &content[start..];

    let mut operations = BTreeSet::new();
    let paths: Vec<(usize, String)> = yaml_path_pattern()
        .captures_iter(body)
        .filter_map(|captured| {
            Some((
                captured.get(0)?.start(),
                captured.get(1)?.as_str().to_string(),
            ))
        })
        .collect();

    for (index, (offset, path)) in paths.iter().enumerate() {
        let end = paths
            .get(index + 1)
            .map(|(next, _)| *next)
            .unwrap_or(body.len());
        for method in yaml_method_pattern().captures_iter(&body[*offset..end]) {
            let Some(method) = method.get(1) else {
                continue;
            };
            operations.insert(operation(method.as_str(), path));
        }
    }

    operations
}

/// The specification a swagger module publishes.
///
/// A specification is searched by name with no size cap — one documenting a
/// real API passes the cap of the source scans — and the module's own manifest
/// is never taken for one, although `modules/swagger/swagger.yml` bears a
/// specification name.
pub fn find_spec(module: &WorkspaceModule) -> Option<PathBuf> {
    let manifest = module.manifest_path();
    let mut found = Vec::new();
    spec_files(&module.dir, 0, &mut found);
    found.sort();
    found.into_iter().find(|path| *path != manifest)
}

fn spec_files(dir: &Path, depth: usize, found: &mut Vec<PathBuf>) {
    if depth > 6 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if path.is_dir() {
            if !name.starts_with('.') && !EXCLUDED_DIRS.contains(&name) {
                spec_files(&path, depth + 1, found);
            }
        } else if SPEC_NAMES.contains(&name) {
            found.push(path);
        }
    }
}

/// Compare a specification against the routes it claims to describe.
pub fn inspect(
    published: &BTreeSet<String>,
    routes: &[Route],
    spec: &str,
    errors: &mut Vec<String>,
) {
    let declared: BTreeSet<String> = routes
        .iter()
        // A socket route is not an HTTP operation and has nothing to publish.
        .filter(|route| route.method != "socket")
        .map(|route| operation(&route.method, &route.path))
        .collect();

    for missing in declared.difference(published) {
        let file = routes
            .iter()
            .find(|route| operation(&route.method, &route.path) == *missing)
            .map(|route| route.file.as_str())
            .unwrap_or_default();
        errors.push(format!(
            "{spec}: `{missing}` is served by {file} and published nowhere"
        ));
    }
    for stale in published.difference(&declared) {
        errors.push(format!(
            "{spec}: `{stale}` is published but no controller serves it"
        ));
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );

    let swagger: Vec<&WorkspaceModule> = modules
        .iter()
        .filter(|module| module.kind.as_deref() == Some("swagger"))
        .collect();

    if swagger.is_empty() {
        return CheckOutcome::new(
            CheckId::Openapi,
            CheckStatus::Skipped,
            "no swagger module found",
        );
    }

    let mut errors = Vec::new();
    let mut counted = 0;
    let mut described = 0;

    for module in swagger {
        let Some(path) = find_spec(module) else {
            errors.push(format!(
                "{}: no {} to publish",
                module.label(),
                SPEC_NAMES.join(" / ")
            ));
            continue;
        };
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let spec = relative(root, &path);
        let published = spec_operations(
            &content,
            path.extension().and_then(|ext| ext.to_str()) == Some("json"),
        );

        // A swagger module documents the module its manifest targets, and every
        // backend module when it names none.
        let targets: Vec<WorkspaceModule> = match target_of(module) {
            Some(target) => modules
                .iter()
                .filter(|candidate| candidate.name == target)
                .cloned()
                .collect(),
            None => modules
                .iter()
                .filter(|candidate| super::artifacts::is_backend(candidate))
                .cloned()
                .collect(),
        };

        let routes = routes::collect(root, &targets);
        counted += routes.len();
        described += published.len();
        inspect(&published, &routes, &spec, &mut errors);
    }

    let scope = format!("{described} published · {counted} served",);

    static_outcome(
        CheckId::Openapi,
        &scope,
        "the specification matches the controllers",
        errors,
        Vec::new(),
    )
    .with_hint("Republish the specification whenever a route is added, renamed or removed")
}
