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

/// How deep constants are followed before giving up.
const MAX_RESOLVE_DEPTH: usize = 4;

/// The source text of a route's `queries`, with every constant it names or
/// spreads (`queries: PAGE_QUERIES`, `type({ ...PAGE_QUERIES, q: "string" })`)
/// replaced by that constant's definition.
pub fn queries_text(config: &str, content: &str, dir: Option<&Path>) -> String {
    let Some(start) = config.find("queries:") else {
        return String::new();
    };
    let expression = expression(&config[start + "queries:".len()..]);
    expand(expression, content, dir, 0)
}

/// The leading expression of `text`, up to the first top-level `,` or `;`.
fn expression(text: &str) -> &str {
    let mut depth = 0i32;
    let mut quote: Option<char> = None;
    for (offset, character) in text.char_indices() {
        if let Some(open) = quote {
            if character == open {
                quote = None;
            }
            continue;
        }
        match character {
            '"' | '\'' | '`' => quote = Some(character),
            '{' | '(' | '[' => depth += 1,
            '}' | ')' | ']' => {
                depth -= 1;
                if depth < 0 {
                    return text[..offset].trim();
                }
            }
            ',' | ';' if depth == 0 => return text[..offset].trim(),
            _ => {}
        }
    }
    text.trim()
}

fn is_identifier(text: &str) -> bool {
    let mut characters = text.chars();
    characters
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic() || first == '_' || first == '$')
        && characters.all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '$'
        })
}

/// The constants an expression stands for: itself when it is a bare name,
/// plus every `...NAME` spread.
fn referenced(expression: &str) -> Vec<String> {
    let mut names = Vec::new();
    let trimmed = expression.trim();
    if is_identifier(trimmed) {
        names.push(trimmed.to_string());
    }
    let mut rest = expression;
    while let Some(position) = rest.find("...") {
        rest = &rest[position + 3..];
        let name: String = rest
            .trim_start()
            .chars()
            .take_while(|character| {
                character.is_ascii_alphanumeric() || *character == '_' || *character == '$'
            })
            .collect();
        if is_identifier(&name) {
            names.push(name);
        }
    }
    names
}

fn expand(expression: &str, content: &str, dir: Option<&Path>, depth: usize) -> String {
    let mut text = expression.to_string();
    if depth >= MAX_RESOLVE_DEPTH {
        return text;
    }
    for name in referenced(expression) {
        if let Some(resolved) = resolve(&name, content, dir, depth) {
            text.push('\n');
            text.push_str(&resolved);
        }
    }
    text
}

/// The expanded definition of constant `name`, looked up in `content` and
/// then through the relative import that brings it in.
fn resolve(name: &str, content: &str, dir: Option<&Path>, depth: usize) -> Option<String> {
    let definition = regex::Regex::new(&format!(
        r"(?:const|let|var)\s+{}\s*(?::[^=]+)?=",
        regex::escape(name)
    ))
    .ok()?;
    if let Some(found) = definition.find(content) {
        let value = expression(&content[found.end()..]);
        return Some(expand(value, content, dir, depth + 1));
    }

    let dir = dir?;
    let import =
        regex::Regex::new(r#"import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["'](\.[^"']*)["']"#)
            .ok()?;
    for captured in import.captures_iter(content) {
        let local = captured[1].split(',').find_map(|item| {
            let mut parts = item.split(" as ").map(str::trim);
            let original = parts.next()?;
            let alias = parts.next().unwrap_or(original);
            (alias == name).then(|| original.to_string())
        });
        let Some(original) = local else { continue };
        let base = dir.join(&captured[2]);
        let candidates = [
            base.clone(),
            std::path::PathBuf::from(format!("{}.ts", base.display())),
            base.join("index.ts"),
        ];
        let Some(path) = candidates.iter().find(|path| path.is_file()) else {
            continue;
        };
        let imported = fs::read_to_string(path).ok()?;
        return resolve(&original, &imported, path.parent(), depth + 1);
    }
    None
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

/// Read one controller file, resolving `queries` constants within the file only.
pub fn parse(content: &str, file: &str) -> Option<Endpoint> {
    parse_at(content, file, None)
}

/// Read one controller file living in `dir`, so constants that `queries`
/// names or spreads can also be followed through relative imports.
pub fn parse_at(content: &str, file: &str, dir: Option<&Path>) -> Option<Endpoint> {
    let route = routes::parse(content, file)?;
    let start = content.find("@Route.")?;
    let open = content[start..].find('{').map(|offset| start + offset)?;
    let config = config_body(content, open)?;

    let queries = queries_text(config, content, dir);
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
            parse_at(&content, &relative(root, &path), path.parent())
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
