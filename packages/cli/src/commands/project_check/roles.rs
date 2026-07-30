//! Roles check — the role names a route guards itself with.
//!
//! `roles: ["ROLE_ADMIN"]` is a string, and a string that does not exist in
//! `roles.yml` guards nothing: the route either rejects everyone or, worse,
//! matches nothing and lets the request through. A typo here reads exactly like
//! a working guard in review.
//!
//! The direction only runs one way. A role a route names has to be declared, so
//! an undeclared one fails the check. A declared role no route names yet is
//! fine — `roles.yml` is the vocabulary, and a word waiting for its first use is
//! not a defect.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use serde_yaml::Value;

use super::modules::{WorkspaceModule, discover_modules, filter_modules, relative, wanted_names};
use super::routes;
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// The file a module declares its roles in.
pub const ROLES_FILE: &str = "roles.yml";

/// A parsed `roles.yml`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Roles {
    /// The role names the application recognises, e.g. `ROLE_ADMIN`.
    pub names: BTreeSet<String>,
    /// Each role and the roles it inherits from.
    pub hierarchy: BTreeMap<String, Vec<String>>,
}

/// Parse a `roles.yml` into the names it defines and the tree it declares.
pub fn parse(content: &str) -> Option<Roles> {
    let document: Value = serde_yaml::from_str(content).ok()?;

    let names = document
        .get("roles")
        .and_then(Value::as_mapping)
        .map(|mapping| {
            mapping
                .values()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();

    let hierarchy = document
        .get("hierarchy")
        .and_then(Value::as_mapping)
        .map(|mapping| {
            mapping
                .iter()
                .filter_map(|(role, definition)| {
                    let inherits = definition
                        .get("inherits")
                        .and_then(Value::as_sequence)
                        .map(|entries| {
                            entries
                                .iter()
                                .filter_map(Value::as_str)
                                .map(str::to_string)
                                .collect()
                        })
                        .unwrap_or_default();
                    Some((role.as_str()?.to_string(), inherits))
                })
                .collect()
        })
        .unwrap_or_default();

    Some(Roles { names, hierarchy })
}

/// Everything inconsistent inside one `roles.yml`.
pub fn inspect(label: &str, roles: &Roles, errors: &mut Vec<String>, warnings: &mut Vec<String>) {
    for (role, inherits) in &roles.hierarchy {
        if !roles.names.contains(role) {
            errors.push(format!(
                "{label}: the hierarchy defines `{role}`, which no `roles:` entry declares"
            ));
        }
        for parent in inherits {
            if !roles.names.contains(parent) {
                errors.push(format!(
                    "{label}: `{role}` inherits `{parent}`, which no `roles:` entry declares"
                ));
            }
            if parent == role {
                errors.push(format!("{label}: `{role}` inherits itself"));
            }
        }
    }

    for role in roles
        .names
        .iter()
        .filter(|role| !roles.hierarchy.contains_key(*role))
    {
        warnings.push(format!(
            "{label}: `{role}` is declared but has no place in the hierarchy"
        ));
    }

    for cycle in cycles(&roles.hierarchy) {
        errors.push(format!("{label}: the hierarchy loops: {cycle}"));
    }
}

/// Inheritance loops, which make a role resolution never terminate.
fn cycles(hierarchy: &BTreeMap<String, Vec<String>>) -> Vec<String> {
    let edges: BTreeMap<String, BTreeSet<String>> = hierarchy
        .iter()
        .map(|(role, inherits)| (role.clone(), inherits.iter().cloned().collect()))
        .collect();

    super::imports::cycles(&edges)
        .iter()
        .map(|cycle| super::imports::render_cycle(cycle))
        .collect()
}

/// The `roles.yml` files that govern a workspace, merged: a module inherits the
/// application's roles, and only an app or microservice declares its own.
pub fn collect(root: &Path, modules: &[WorkspaceModule]) -> Vec<(String, Roles)> {
    std::iter::once(root.join(ROLES_FILE))
        .chain(modules.iter().map(|module| module.dir.join(ROLES_FILE)))
        .filter(|path| path.is_file())
        .filter_map(|path| {
            let content = fs::read_to_string(&path).ok()?;
            Some((relative(root, &path), parse(&content)?))
        })
        .collect()
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );
    let files = collect(root, &modules);

    if files.is_empty() {
        return CheckOutcome::new(CheckId::Roles, CheckStatus::Skipped, "no roles.yml found");
    }

    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    for (label, roles) in &files {
        inspect(label, roles, &mut errors, &mut warnings);
    }

    // A route is guarded by a name, so every name it uses has to exist
    // somewhere — which `roles.yml` it comes from is the runtime's business. A
    // declared name no route uses is not the same problem in reverse: it is a
    // role the app knows and no endpoint has needed yet, so it passes.
    let declared: BTreeSet<&String> = files.iter().flat_map(|(_, roles)| &roles.names).collect();
    let routes = routes::collect(root, &modules);
    let mut guarded = 0;

    for route in &routes {
        guarded += route.roles.len();
        for role in &route.roles {
            if !declared.contains(role) {
                errors.push(format!(
                    "{}: the route guards on `{role}`, which no roles.yml declares",
                    route.file
                ));
            }
        }
    }

    let scope = format!(
        "{} role{} · {guarded} guard{}",
        declared.len(),
        if declared.len() == 1 { "" } else { "s" },
        if guarded == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Roles,
        &scope,
        "every guard names a declared role",
        errors,
        warnings,
    )
    .with_hint("Roles live in `roles.yml`; a route names them in its `roles:` list")
}
