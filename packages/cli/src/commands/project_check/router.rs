//! Router check — the route tree the files describe against the one that ships.
//!
//! TanStack Router builds its tree from the filesystem and writes the result
//! into `routeTree.gen.ts`. Two things drift from there. A file can declare a
//! `createFileRoute("/somewhere-else")` that does not match where it sits, which
//! the generator will happily regenerate away and a hand edit will not. And the
//! generated tree can simply be stale — the file exists, the route does not,
//! and the only symptom is a 404 on a page that is right there in the editor.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::artifacts::is_frontend;
use super::modules::{
    TS_EXTENSIONS, WorkspaceModule, collect_files, discover_modules, filter_modules, relative,
    wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// The generated tree, which is the router's actual input.
const GENERATED_TREE: &str = "routeTree.gen.ts";

/// The boundaries a route should declare, and what each one covers.
const BOUNDARIES: [(&str, &str); 3] = [
    (
        "errorComponent",
        "a throw renders the router's default error page",
    ),
    ("pendingComponent", "the route shows nothing while it loads"),
    (
        "notFoundComponent",
        "a missing resource escapes to the root",
    ),
];

fn file_route_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r#"create(?:File|Lazy(?:File)?)Route\s*\(\s*["']([^"']*)["']"#)
            .expect("the file route pattern is valid")
    })
}

/// One route file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RouteFile {
    pub file: String,
    /// The route id derived from where the file sits.
    pub expected: String,
    /// The route id the file declares, when it declares one.
    pub declared: Option<String>,
    /// The boundaries it does not set.
    pub missing: Vec<&'static str>,
}

/// The route id a file's location implies.
///
/// The flat form (`posts.$id.tsx`) and the nested one (`posts/$id.tsx`) address
/// the same route, and `index` addresses its parent — which is why the id is
/// derived rather than assumed to be the path.
pub fn route_id(relative_path: &str) -> String {
    let stem = relative_path
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(relative_path);

    let segments: Vec<&str> = stem
        .split('/')
        .flat_map(|segment| segment.split('.'))
        .filter(|segment| !segment.is_empty())
        // A folder wrapped in parentheses groups routes without adding a path
        // segment, and a leading underscore marks a pathless layout.
        .filter(|segment| !(segment.starts_with('(') && segment.ends_with(')')))
        .filter(|segment| *segment != "index" && *segment != "route")
        .collect();

    if segments.is_empty() {
        return "/".to_string();
    }
    format!("/{}", segments.join("/"))
}

/// Read one route file.
pub fn parse(content: &str, file: &str, relative_path: &str) -> RouteFile {
    RouteFile {
        file: file.to_string(),
        expected: route_id(relative_path),
        declared: file_route_pattern()
            .captures(content)
            .and_then(|captured| captured.get(1))
            .map(|group| group.as_str().to_string()),
        missing: BOUNDARIES
            .iter()
            .filter(|(boundary, _)| !content.contains(boundary))
            .map(|(boundary, _)| *boundary)
            .collect(),
    }
}

/// Whether two route ids address the same route.
pub fn same_route(left: &str, right: &str) -> bool {
    let normalize = |id: &str| {
        let trimmed = id.trim_end_matches('/');
        if trimmed.is_empty() {
            "/".to_string()
        } else {
            trimmed.to_string()
        }
    };
    normalize(left) == normalize(right)
}

/// Every route file of one module, with the generated tree it should appear in.
pub fn collect(root: &Path, module: &WorkspaceModule) -> (Vec<RouteFile>, Option<String>) {
    let routes_dir = module.dir.join("src").join("routes");
    let tree = fs::read_to_string(
        module
            .dir
            .join("src")
            .join("bootstrap")
            .join(GENERATED_TREE),
    )
    .ok()
    .or_else(|| fs::read_to_string(module.dir.join("src").join(GENERATED_TREE)).ok());

    let files = collect_files(&routes_dir, TS_EXTENSIONS, 8)
        .into_iter()
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                // The root route and the generated tree are not routes of their
                // own.
                .is_some_and(|name| name != "__root.tsx" && name != GENERATED_TREE)
        })
        .filter_map(|path| {
            let content = fs::read_to_string(&path).ok()?;
            let inside = path.strip_prefix(&routes_dir).ok()?.to_string_lossy();
            Some(parse(&content, &relative(root, &path), &inside))
        })
        .collect();

    (files, tree)
}

/// Everything about a module's routes that will not be reachable.
pub fn inspect(
    routes: &[RouteFile],
    tree: Option<&str>,
    label: &str,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let mut seen: BTreeSet<&str> = BTreeSet::new();

    for route in routes {
        let file = &route.file;

        let Some(declared) = route.declared.as_deref() else {
            errors.push(format!(
                "{file}: no createFileRoute — the file is under routes/ and mounts nothing"
            ));
            continue;
        };

        if !same_route(declared, &route.expected) {
            errors.push(format!(
                "{file}: declares \"{declared}\" but its location means \"{}\"",
                route.expected
            ));
        }
        if !seen.insert(declared) {
            errors.push(format!(
                "{file}: the route \"{declared}\" is declared twice"
            ));
        }

        for boundary in &route.missing {
            let reason = BOUNDARIES
                .iter()
                .find(|(name, _)| name == boundary)
                .map(|(_, reason)| *reason)
                .unwrap_or_default();
            warnings.push(format!("{file}: no {boundary} — {reason}"));
        }

        // The generated tree names each route file it imports. A file it never
        // names was added after the last generation.
        if let Some(tree) = tree {
            let stem = file
                .rsplit('/')
                .next()
                .and_then(|name| name.rsplit_once('.'))
                .map(|(stem, _)| stem)
                .unwrap_or_default();
            if !stem.is_empty() && !tree.contains(stem) {
                errors.push(format!(
                    "{file}: {GENERATED_TREE} does not know about it — regenerate the route tree"
                ));
            }
        }
    }

    if tree.is_none() && !routes.is_empty() {
        errors.push(format!(
            "{label}: {} route{} but no {GENERATED_TREE}",
            routes.len(),
            if routes.len() == 1 { "" } else { "s" }
        ));
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<_> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(is_frontend)
    // A design module ships components rather than a router.
    .filter(|module| module.kind.as_deref() != Some("design"))
    .collect();

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut counted = 0;

    for module in &modules {
        let (routes, tree) = collect(root, module);
        if routes.is_empty() {
            continue;
        }
        counted += routes.len();
        inspect(
            &routes,
            tree.as_deref(),
            &module.label(),
            &mut errors,
            &mut warnings,
        );
    }

    if counted == 0 {
        return CheckOutcome::new(CheckId::Router, CheckStatus::Skipped, "no route file found");
    }

    let scope = format!("{counted} route{}", if counted == 1 { "" } else { "s" });

    static_outcome(
        CheckId::Router,
        &scope,
        "every route matches its file and is in the generated tree",
        errors,
        warnings,
    )
    .with_hint("`talos spa:feature:create` writes the route and its four boundaries together")
}
