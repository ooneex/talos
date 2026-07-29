//! Health check — the liveness probe every deployed service is asked for.
//!
//! An `api` or `microservice` module is the thing an orchestrator restarts, and
//! it decides whether to restart by calling a URL. The generated `Dockerfile`
//! already declares that `HEALTHCHECK`, so the probe exists whether or not a
//! controller answers it: with nothing mounted the request 404s, the container
//! never turns healthy, and the orchestrator kills it in a loop. Worse, the
//! probe is a bare path while routes mount under `/<prefix>/v<version>`, so a
//! controller can exist and still not be the one being called.

use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::modules::{WorkspaceModule, discover_modules, filter_modules, relative, wanted_names};
use super::routes::{Route, collect};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Module types that are deployed as a service and therefore probed.
pub const PROBED_MODULE_TYPES: [&str; 2] = ["api", "microservice"];

/// Paths that read as a health probe. `/healthcheck` is what the generated
/// `Dockerfile` calls; the rest are the conventions an orchestrator or a load
/// balancer is usually pointed at instead.
const HEALTH_PATHS: [&str; 6] = [
    "/healthcheck",
    "/health",
    "/healthz",
    "/livez",
    "/readyz",
    "/ping",
];

/// Whether a route path is the module's health probe.
pub fn is_health_path(path: &str) -> bool {
    let path = path.trim_end_matches('/').to_lowercase();
    HEALTH_PATHS.contains(&path.as_str())
}

/// The health route a module declares, if any.
pub fn health_route(routes: &[Route]) -> Option<&Route> {
    routes.iter().find(|route| is_health_path(&route.path))
}

fn prefix_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r#"routing\s*:\s*\{[^}]*\bprefix\s*:\s*["']([^"']*)["']"#)
            .expect("the routing prefix pattern is valid")
    })
}

/// The `routing.prefix` the module's `App` is constructed with, trimmed of its
/// slashes the way `App` trims it. `None` when no prefix is configured.
pub fn routing_prefix(content: &str) -> Option<String> {
    let prefix = prefix_pattern()
        .captures(content)?
        .get(1)?
        .as_str()
        .trim_matches('/')
        .to_string();
    (!prefix.is_empty()).then_some(prefix)
}

/// Where a route is actually served: `formatHttpRoutes` mounts every route
/// under the routing prefix and the route's own version.
pub fn mounted_path(prefix: Option<&str>, version: u32, path: &str) -> String {
    match prefix {
        Some(prefix) => format!("/{prefix}/v{version}{path}"),
        None => format!("/v{version}{path}"),
    }
}

fn probe_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // The generated probe is a `fetch()` inside the HEALTHCHECK CMD, so the
        // URL is read out of it rather than out of the CMD shape.
        Regex::new(r"https?://[^/\s`'\x22]+(/[^\s`'\x22)]*)").expect("the probe pattern is valid")
    })
}

/// The path a `Dockerfile`'s `HEALTHCHECK` probes. `None` when the file
/// declares no `HEALTHCHECK` at all.
pub fn probed_path(dockerfile: &str) -> Option<String> {
    let directive = dockerfile
        .lines()
        .skip_while(|line| !line.trim_start().to_uppercase().starts_with("HEALTHCHECK"))
        .take_while(|line| !line.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    if directive.is_empty() {
        return None;
    }

    Some(
        probe_pattern()
            .captures(&directive)
            .and_then(|captured| captured.get(1))
            .map_or_else(|| "/".to_string(), |group| group.as_str().to_string()),
    )
}

/// What the module's image asks for. The three cases read differently: no
/// image at all is a deployment question, a `Dockerfile` with no `HEALTHCHECK`
/// leaves the route uncalled, and a declared path can simply be the wrong one.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Probe<'a> {
    NoImage,
    NoDirective,
    Path(&'a str),
}

/// Everything wrong with one module's probe.
pub fn inspect(
    module: &WorkspaceModule,
    route: Option<&Route>,
    prefix: Option<&str>,
    probe: Probe,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let label = module.label();

    let Some(route) = route else {
        errors.push(format!(
            "{label}: no controller declares a health route — a deployed service is restarted by whatever answers `/healthcheck`"
        ));
        return;
    };

    // A probe is a GET issued by a machine with no session: anything else and
    // the orchestrator's request cannot reach the handler.
    if route.method != "get" {
        errors.push(format!(
            "{}: the health route is `{}`, but a probe issues a GET",
            route.file,
            route.method.to_uppercase()
        ));
    }
    if !route.is_public() {
        errors.push(format!(
            "{}: the health route guards on {} — a probe carries no credentials and would be rejected",
            route.file,
            route
                .roles
                .iter()
                .map(|role| format!("`{role}`"))
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }

    let mounted = mounted_path(prefix, route.version.unwrap_or(1), &route.path);

    match probe {
        // A module with no image is reported once, by the caller, rather than
        // again here for a HEALTHCHECK the missing file could not declare.
        Probe::NoImage => {}
        Probe::NoDirective => warnings.push(format!(
            "{label}: the Dockerfile declares no HEALTHCHECK, so nothing calls `{mounted}`"
        )),
        Probe::Path(probe) if probe.trim_end_matches('/') != mounted.trim_end_matches('/') => {
            errors.push(format!(
                "{label}: the Dockerfile probes `{probe}` but the health route is served at `{mounted}`"
            ));
        }
        Probe::Path(_) => {}
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<WorkspaceModule> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(|module| {
        module
            .kind
            .as_deref()
            .is_some_and(|kind| PROBED_MODULE_TYPES.contains(&kind))
    })
    .collect();

    if modules.is_empty() {
        return CheckOutcome::new(
            CheckId::Health,
            CheckStatus::Skipped,
            "no api or microservice module found",
        );
    }

    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    for module in &modules {
        let routes = collect(root, std::slice::from_ref(module));
        let prefix = fs::read_to_string(module.dir.join("src").join("index.ts"))
            .ok()
            .and_then(|content| routing_prefix(&content));
        let dockerfile = module.dir.join("Dockerfile");
        let declared = fs::read_to_string(&dockerfile).ok();
        let path = declared.as_deref().and_then(probed_path);

        if declared.is_none() {
            warnings.push(format!(
                "{}: no Dockerfile, so the service is deployed without a probe",
                relative(root, &dockerfile)
            ));
        }

        let probe = match (&declared, &path) {
            (None, _) => Probe::NoImage,
            (Some(_), None) => Probe::NoDirective,
            (Some(_), Some(path)) => Probe::Path(path),
        };

        inspect(
            module,
            health_route(&routes),
            prefix.as_deref(),
            probe,
            &mut errors,
            &mut warnings,
        );
    }

    let scope = format!(
        "{} service{}",
        modules.len(),
        if modules.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Health,
        &scope,
        "every service answers its probe",
        errors,
        warnings,
    )
    .with_hint("Add the route with `talos controller:create --name Healthcheck`")
}
