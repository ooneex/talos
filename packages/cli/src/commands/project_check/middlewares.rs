//! Middlewares check — whether a middleware can actually do its job.
//!
//! A middleware is the one artifact in the framework whose contract is a
//! *return value*: `handler` receives the context and has to hand it back, or
//! the chain stops there. Forgetting the `return` type-checks under
//! `Promise<ContextType>` only because a missing return is `undefined`, and the
//! request dies with no error and no log line. The registration check already
//! proves a middleware is loaded; this one proves it is wired correctly.

use std::path::Path;

use super::artifacts::{self, Artifact, Corpus, is_backend};
use super::modules::{discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Everything about one middleware that reads like an oversight.
pub fn inspect(
    middleware: &Artifact,
    corpus: &Corpus,
    registry: &str,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let file = &middleware.file;

    let Some(body) = artifacts::method_body(&middleware.content, "handler") else {
        errors.push(format!(
            "{file}: `{}` declares no `handler` — IMiddleware requires one",
            middleware.class
        ));
        return;
    };

    // `return context` is the whole contract. A middleware that only mutates
    // the context it was handed still has to pass it on.
    if !body.contains("return ") {
        errors.push(format!(
            "{file}: `{}`.handler never returns the context — the chain stops here",
            middleware.class
        ));
    } else if artifacts::is_empty_body(body) {
        warnings.push(format!(
            "{file}: `{}`.handler does nothing yet",
            middleware.class
        ));
    }

    // A middleware nothing mentions is loaded globally by its module and runs
    // on every request — which is fine, but a route-scoped one that no route
    // names has simply been forgotten.
    if !corpus.mentioned_outside(&middleware.class, &[file.as_str(), registry]) {
        warnings.push(format!(
            "{file}: nothing outside its module registry mentions `{}`",
            middleware.class
        ));
    }
}

/// Two middlewares sharing a class name make the order they run in depend on
/// which module registered first.
pub fn collisions(middlewares: &[Artifact]) -> Vec<String> {
    let mut findings = Vec::new();

    for (position, middleware) in middlewares.iter().enumerate() {
        let Some(owner) = middlewares[..position]
            .iter()
            .find(|other| other.class == middleware.class)
        else {
            continue;
        };
        findings.push(format!(
            "{}: `{}` is already declared by {} — the order they run in is undefined",
            middleware.file, middleware.class, owner.file
        ));
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

    let middlewares = artifacts::collect(root, &modules, &["middleware", "socketMiddleware"]);
    if middlewares.is_empty() {
        return CheckOutcome::new(
            CheckId::Middlewares,
            CheckStatus::Skipped,
            "no middleware found",
        );
    }

    let corpus = Corpus::build(root, &modules);
    let mut errors = collisions(&middlewares);
    let mut warnings = Vec::new();

    for middleware in &middlewares {
        let Some(module) = modules
            .iter()
            .find(|module| module.name == middleware.module)
        else {
            continue;
        };
        let registry = artifacts::registry_label(root, module);
        inspect(middleware, &corpus, &registry, &mut errors, &mut warnings);
    }

    let scope = format!(
        "{} middleware{}",
        middlewares.len(),
        if middlewares.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Middlewares,
        &scope,
        "every middleware returns its context",
        errors,
        warnings,
    )
    .with_hint("Scaffold with `talos middleware:create`, whose handler returns the context")
}
