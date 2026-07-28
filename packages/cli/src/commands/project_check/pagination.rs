//! Pagination check — collection endpoints with a ceiling on what they return.
//!
//! A list route written against ten rows of seed data behaves identically to
//! one written against ten million: `find()` with no `take` selects the table,
//! serialises it, and hands it to a client that asked for a page. The first
//! time it matters is the first time the table is big, which is also the first
//! time it is expensive to fix.

use std::fs;
use std::path::Path;

use super::artifacts::is_backend;
use super::modules::{
    WorkspaceModule, collect_files, discover_modules, filter_modules, relative, wanted_names,
};
use super::routes::{self, Route, config_body};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// The parameters a paginated route has to accept.
const REQUIRED_QUERIES: [&str; 2] = ["page", "limit"];

/// The route names that mean "everything of this kind".
const COLLECTION_SUFFIXES: [&str; 5] = ["list", "index", "all", "search", "find"];

/// One route, read for whether it returns a collection and bounds it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Endpoint {
    pub route: Route,
    pub returns_collection: bool,
    /// The pagination parameters its `queries` declares.
    pub accepts: Vec<&'static str>,
}

/// The body of a named section of a route config, e.g. `queries: Assert({ … })`.
pub fn section<'a>(body: &'a str, name: &str) -> Option<&'a str> {
    let start = body.find(&format!("{name}:"))?;
    let open = body[start..].find('{').map(|offset| start + offset)?;
    config_body(body, open)
}

/// Whether a route hands back more than one of something.
///
/// Three things say so and any one is enough: the response is an arktype array,
/// it carries the shape a paginated repository returns, or the route is named
/// after the act of listing.
pub fn returns_collection(config: &str, content: &str, route: &Route) -> bool {
    let response = section(config, "response").unwrap_or_default();

    if response.contains("[]") || response.contains(".array()") || response.contains("resources") {
        return true;
    }
    if content.contains("FilterResultType") {
        return true;
    }
    route
        .name
        .as_deref()
        .map(|name| {
            let last = name.rsplit('.').next().unwrap_or(name);
            COLLECTION_SUFFIXES.contains(&last)
        })
        .unwrap_or(false)
}

/// Read one controller file.
pub fn parse(content: &str, file: &str) -> Option<Endpoint> {
    let route = routes::parse(content, file)?;
    let start = content.find("@Route.")?;
    let open = content[start..].find('{').map(|offset| start + offset)?;
    let config = config_body(content, open)?;

    let queries = section(config, "queries").unwrap_or_default();
    Some(Endpoint {
        returns_collection: returns_collection(config, content, &route),
        accepts: REQUIRED_QUERIES
            .into_iter()
            .filter(|parameter| queries.contains(parameter))
            .collect(),
        route,
    })
}

/// Every controller of a set of modules, read for pagination.
pub fn collect(root: &Path, modules: &[WorkspaceModule]) -> Vec<Endpoint> {
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

/// Collection routes that will return the whole table.
pub fn inspect(endpoints: &[Endpoint], warnings: &mut Vec<String>) {
    for endpoint in endpoints {
        if !endpoint.returns_collection || endpoint.route.method != "get" {
            continue;
        }

        let missing: Vec<&str> = REQUIRED_QUERIES
            .into_iter()
            .filter(|parameter| !endpoint.accepts.contains(parameter))
            .collect();
        if missing.is_empty() {
            continue;
        }

        warnings.push(format!(
            "{}: `{}` returns a collection and accepts no {} — the response is unbounded",
            endpoint.route.file,
            endpoint.route.endpoint(),
            missing.join(" or ")
        ));
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<_> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(is_backend)
    .collect();

    let endpoints = collect(root, &modules);
    if endpoints.is_empty() {
        return CheckOutcome::new(
            CheckId::Pagination,
            CheckStatus::Skipped,
            "no controller found",
        );
    }

    let collections = endpoints
        .iter()
        .filter(|endpoint| endpoint.returns_collection)
        .count();

    let mut warnings = Vec::new();
    inspect(&endpoints, &mut warnings);

    let scope = format!(
        "{collections} collection route{} of {}",
        if collections == 1 { "" } else { "s" },
        endpoints.len()
    );

    static_outcome(
        CheckId::Pagination,
        &scope,
        "every collection route is bounded",
        Vec::new(),
        warnings,
    )
    .with_hint(
        "Declare `page` and `limit` in the route's `queries` and pass them to the repository",
    )
}
