//! Routes check — the HTTP surface the controllers add up to.
//!
//! Every controller declares its route in isolation, so nothing stops two of
//! them claiming the same method and path: the router keeps one, and which one
//! depends on registration order. The same blindness lets a route ship with no
//! `roles`, which makes it public — the most expensive kind of typo in the
//! codebase.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::modules::{
    WorkspaceModule, collect_files, discover_modules, filter_modules, relative, wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// One declared route.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Route {
    /// `get`, `post`, `socket`, …
    pub method: String,
    pub path: String,
    /// The `name:` the SDK and the client address the route by.
    pub name: Option<String>,
    pub version: Option<u32>,
    pub roles: Vec<String>,
    /// Whether the config declares a `roles` key at all — an empty list is a
    /// deliberate public route, a missing key is an oversight.
    pub declares_roles: bool,
    pub file: String,
}

impl Route {
    /// How the route is addressed once the router has mounted it.
    pub fn endpoint(&self) -> String {
        format!(
            "{} /v{}{}",
            self.method.to_uppercase(),
            self.version.unwrap_or(1),
            self.path
        )
    }

    pub fn is_public(&self) -> bool {
        self.roles.is_empty()
    }
}

fn route_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r#"@Route\.(\w+)\(\s*"([^"]*)"\s*,\s*\{"#).expect("the route pattern is valid")
    })
}

fn field_pattern(field: &str) -> Option<Regex> {
    Regex::new(&format!(r#"{field}\s*:\s*"([^"]*)""#)).ok()
}

/// The body of the config object a route decorator opens, read by balancing
/// braces so a nested `payload: Assert({ … })` does not end it early.
pub fn config_body(content: &str, open: usize) -> Option<&str> {
    let mut depth = 0;
    for (offset, character) in content[open..].char_indices() {
        match character {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&content[open + 1..open + offset]);
                }
            }
            _ => {}
        }
    }
    None
}

/// The route a controller file declares.
pub fn parse(content: &str, file: &str) -> Option<Route> {
    let captured = route_pattern().captures(content)?;
    let open = captured.get(0)?.end() - 1;
    let body = config_body(content, open)?;

    let roles_raw = Regex::new(r"roles\s*:\s*\[([^\]]*)\]")
        .ok()
        .and_then(|pattern| pattern.captures(body))
        .and_then(|captured| captured.get(1))
        .map(|group| group.as_str().to_string());

    Some(Route {
        method: captured.get(1)?.as_str().to_lowercase(),
        path: captured.get(2)?.as_str().to_string(),
        name: field_pattern("name")
            .and_then(|pattern| pattern.captures(body))
            .and_then(|captured| captured.get(1))
            .map(|group| group.as_str().to_string()),
        version: Regex::new(r"version\s*:\s*(\d+)")
            .ok()
            .and_then(|pattern| pattern.captures(body))
            .and_then(|captured| captured.get(1))
            .and_then(|group| group.as_str().parse().ok()),
        roles: roles_raw
            .iter()
            .flat_map(|raw| raw.split(','))
            .map(|role| role.trim().trim_matches(['"', '\'']).to_string())
            .filter(|role| !role.is_empty())
            .collect(),
        declares_roles: roles_raw.is_some(),
        file: file.to_string(),
    })
}

/// Every route declared by a set of modules.
pub fn collect(root: &Path, modules: &[WorkspaceModule]) -> Vec<Route> {
    modules
        .iter()
        .flat_map(|module| collect_files(&module.dir.join("src").join("controllers"), &["ts"], 4))
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.ends_with("Controller.ts"))
        })
        .filter_map(|path| {
            let content = fs::read_to_string(&path).ok()?;
            parse(&content, &relative(root, &path))
        })
        .collect()
}

/// Routes fighting over the same endpoint, and names claimed twice.
pub fn collisions(routes: &[Route]) -> Vec<String> {
    let mut findings = Vec::new();
    let mut endpoints: BTreeMap<String, &str> = BTreeMap::new();
    let mut names: BTreeMap<&str, &str> = BTreeMap::new();

    for route in routes {
        let endpoint = route.endpoint();
        match endpoints.get(&endpoint) {
            Some(owner) => findings.push(format!(
                "{}: `{endpoint}` is already declared by {owner}",
                route.file
            )),
            None => {
                endpoints.insert(endpoint, &route.file);
            }
        }

        let Some(name) = route.name.as_deref() else {
            continue;
        };
        match names.get(name) {
            Some(owner) => findings.push(format!(
                "{}: the route name \"{name}\" is already used by {owner}",
                route.file
            )),
            None => {
                names.insert(name, &route.file);
            }
        }
    }

    findings
}

/// Everything about a single route that reads like an oversight.
pub fn inspect(route: &Route, errors: &mut Vec<String>, warnings: &mut Vec<String>) {
    let file = &route.file;

    match &route.name {
        None => errors.push(format!(
            "{file}: the route declares no `name` — the SDK addresses routes by name"
        )),
        // The generator names a route `<module>.<resource>.<action>`, which is
        // what keeps the generated SDK method names readable.
        Some(name) if !name.contains('.') => warnings.push(format!(
            "{file}: the route name \"{name}\" is not namespaced, e.g. `user.profile.read`"
        )),
        Some(_) => {}
    }

    if route.version.is_none() {
        warnings.push(format!(
            "{file}: the route declares no `version` — it will be mounted under v1 forever"
        ));
    }

    if !route.path.starts_with('/') {
        errors.push(format!(
            "{file}: the route path \"{}\" does not start with `/`",
            route.path
        ));
    }
    if route.path.len() > 1 && route.path.ends_with('/') {
        warnings.push(format!(
            "{file}: the route path \"{}\" has a trailing slash",
            route.path
        ));
    }

    // A socket route is upgraded before the role guard runs, so it is checked
    // by the handler rather than by the decorator.
    if route.method != "socket" && !route.declares_roles {
        warnings.push(format!(
            "{file}: the route declares no `roles` — it is open to anyone"
        ));
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );
    let routes = collect(root, &modules);

    if routes.is_empty() {
        return CheckOutcome::new(CheckId::Routes, CheckStatus::Skipped, "no controller found");
    }

    let mut errors = collisions(&routes);
    let mut warnings = Vec::new();
    for route in &routes {
        inspect(route, &mut errors, &mut warnings);
    }

    let public = routes.iter().filter(|route| route.is_public()).count();
    let scope = format!(
        "{} route{} · {public} public",
        routes.len(),
        if routes.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Routes,
        &scope,
        "every route is unique and guarded",
        errors,
        warnings,
    )
    .with_hint("Scaffold with `talos controller:create`, which fills the route config")
}
