//! Permissions check — whether a permission class decides anything.
//!
//! A generated permission returns `true` from `check()` and grants nothing in
//! `allow()`, because the rules are the part only the domain knows. That
//! placeholder is indistinguishable from a finished class: it compiles, it is
//! bound, it is injected, and it lets every caller through. The one place it
//! shows up is an audit, which is late.

use std::collections::BTreeMap;
use std::path::Path;

use super::artifacts::{self, Artifact, Corpus, is_backend};
use super::modules::{discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// The lines of a body that are code rather than commentary. Every generated
/// artifact documents itself with commented-out examples, so a rule reading a
/// body has to see past them.
pub fn code_lines(body: &str) -> Vec<&str> {
    body.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| !line.starts_with("//") && !line.starts_with('*') && !line.starts_with("/*"))
        .collect()
}

/// Whether a body decides nothing: it returns a constant and does no work to
/// get there.
pub fn is_constant(body: &str, value: &str) -> bool {
    code_lines(body) == [format!("return {value};")]
}

/// Everything about one permission that reads like a placeholder.
pub fn inspect(
    permission: &Artifact,
    corpus: &Corpus,
    registry: &str,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let file = &permission.file;
    let class = &permission.class;

    match artifacts::method_body(&permission.content, "check") {
        None => errors.push(format!("{file}: `{class}` declares no `check`")),
        Some(body) if is_constant(body, "true") => warnings.push(format!(
            "{file}: `{class}`.check returns true unconditionally — it guards nothing"
        )),
        Some(_) => {}
    }

    match artifacts::method_body(&permission.content, "allow") {
        None => errors.push(format!("{file}: `{class}` declares no `allow`")),
        Some(body) if artifacts::is_empty_body(body) || is_constant(body, "this") => warnings.push(
            format!("{file}: `{class}`.allow grants no ability — every `can` check will fail"),
        ),
        Some(_) => {}
    }

    if let Some(body) = artifacts::method_body(&permission.content, "setUserPermissions")
        && (artifacts::is_empty_body(body) || is_constant(body, "this"))
    {
        warnings.push(format!(
            "{file}: `{class}`.setUserPermissions ignores the user — roles change nothing"
        ));
    }

    if !corpus.mentioned_outside(class, &[file.as_str(), registry]) {
        warnings.push(format!("{file}: nothing reads `{class}`"));
    }
}

/// Two permissions sharing a class name resolve to whichever was bound last.
pub fn collisions(permissions: &[Artifact]) -> Vec<String> {
    let mut owners: BTreeMap<&str, &str> = BTreeMap::new();
    let mut findings = Vec::new();

    for permission in permissions {
        match owners.get(permission.class.as_str()) {
            Some(owner) => findings.push(format!(
                "{}: `{}` is already declared by {owner}",
                permission.file, permission.class
            )),
            None => {
                owners.insert(&permission.class, &permission.file);
            }
        }
    }

    findings
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<_> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(is_backend)
    .collect();

    let permissions = artifacts::collect(root, &modules, &["permission"]);
    if permissions.is_empty() {
        return CheckOutcome::new(
            CheckId::Permissions,
            CheckStatus::Skipped,
            "no permission found",
        );
    }

    let corpus = Corpus::build(root, &modules);
    let mut errors = collisions(&permissions);
    let mut warnings = Vec::new();

    for permission in &permissions {
        let registry = modules
            .iter()
            .find(|module| module.name == permission.module)
            .map(|module| artifacts::registry_label(root, module))
            .unwrap_or_default();
        inspect(permission, &corpus, &registry, &mut errors, &mut warnings);
    }

    let scope = format!(
        "{} permission{}",
        permissions.len(),
        if permissions.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Permissions,
        &scope,
        "every permission decides something",
        errors,
        warnings,
    )
    .with_hint("Fill `allow()` with `this.ability.can(...)` and narrow `check()` to the context")
}
