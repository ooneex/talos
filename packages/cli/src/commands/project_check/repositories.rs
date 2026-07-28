//! Repositories check — the one layer allowed to touch the database.
//!
//! Clean Architecture puts persistence behind a repository so a query has one
//! place to live and one place to change. Nothing enforces that: a service can
//! inject `"database"` and open a TypeORM repository itself, and the code
//! compiles, passes review by looking familiar, and quietly puts a query
//! somewhere no index review will ever find it. A repository pointed at an
//! entity that has been renamed is the same problem read backwards.

use std::collections::BTreeSet;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::artifacts::{self, Artifact, Corpus, is_backend};
use super::entities::collect_entities;
use super::modules::{WorkspaceModule, discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Ways of reaching the database that belong to a repository and nowhere else.
const DIRECT_ACCESS: [(&str, &str); 3] = [
    ("database.open(", "opens a TypeORM repository directly"),
    ("createQueryBuilder(", "builds a query outside a repository"),
    ("getRepository(", "resolves a repository by entity"),
];

fn entity_reference_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"\b([A-Z][A-Za-z0-9_$]*Entity)\b").expect("the entity reference is valid")
    })
}

fn hard_delete_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"\brepository\s*\.\s*(delete|remove)\s*\(")
            .expect("the hard delete pattern is valid")
    })
}

/// The entity classes a repository names.
pub fn entities_of(content: &str) -> BTreeSet<String> {
    entity_reference_pattern()
        .captures_iter(content)
        .filter_map(|captured| captured.get(1))
        .map(|group| group.as_str().to_string())
        .collect()
}

/// Everything about one repository that will not survive its entity.
pub fn inspect(
    repository: &Artifact,
    declared: &BTreeSet<String>,
    soft_deletable: &BTreeSet<String>,
    corpus: &Corpus,
    registry: &str,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let file = &repository.file;
    let class = &repository.class;
    let referenced = entities_of(&repository.content);

    if referenced.is_empty() {
        warnings.push(format!("{file}: `{class}` names no entity"));
    }
    for entity in &referenced {
        if !declared.contains(entity) {
            errors.push(format!(
                "{file}: `{class}` is built on `{entity}`, which no entity class declares"
            ));
        }
    }

    // `softDelete` sets the timestamp the entity carries; `delete` throws the
    // row away, which is not what an entity with a `deletedAt` column means.
    if hard_delete_pattern().is_match(&repository.content)
        && referenced
            .iter()
            .any(|entity| soft_deletable.contains(entity))
    {
        warnings.push(format!(
            "{file}: `{class}` deletes rows outright though its entity is soft-deletable"
        ));
    }

    if !corpus.mentioned_outside(class, &[file.as_str(), registry]) {
        warnings.push(format!("{file}: nothing injects `{class}`"));
    }
}

/// Files reaching past the repository layer to the database itself.
pub fn direct_access(corpus: &Corpus) -> Vec<String> {
    let mut findings = Vec::new();

    for (file, content) in &corpus.files {
        // The repository layer is where this belongs, and a migration has no
        // repository to go through.
        if file.contains("/repositories/")
            || file.contains("/migrations/")
            || file.contains("/seeds/")
            || file.contains("/databases/")
        {
            continue;
        }

        for (needle, reason) in DIRECT_ACCESS {
            let Some(offset) = content.find(needle) else {
                continue;
            };
            findings.push(format!(
                "{file}:{}: {reason} — put the query in a repository",
                artifacts::line_of(content, offset)
            ));
        }
    }

    findings
}

/// The entity classes of a module, and which of them are soft-deletable.
pub fn schema(root: &Path, modules: &[WorkspaceModule]) -> (BTreeSet<String>, BTreeSet<String>) {
    let mut declared = BTreeSet::new();
    let mut soft_deletable = BTreeSet::new();

    for module in modules {
        for entity in collect_entities(root, module) {
            if entity
                .columns
                .iter()
                .any(|column| column.contains("deleted"))
            {
                soft_deletable.insert(entity.class.clone());
            }
            declared.insert(entity.class);
        }
    }

    (declared, soft_deletable)
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<_> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(is_backend)
    .collect();

    let repositories = artifacts::collect(root, &modules, &["repository"]);
    if repositories.is_empty() {
        return CheckOutcome::new(
            CheckId::Repositories,
            CheckStatus::Skipped,
            "no repository found",
        );
    }

    let corpus = Corpus::build(root, &modules);
    let (declared, soft_deletable) = schema(root, &modules);

    let mut errors = Vec::new();
    let mut warnings = direct_access(&corpus);

    for repository in &repositories {
        let registry = modules
            .iter()
            .find(|module| module.name == repository.module)
            .map(|module| artifacts::registry_label(root, module))
            .unwrap_or_default();
        inspect(
            repository,
            &declared,
            &soft_deletable,
            &corpus,
            &registry,
            &mut errors,
            &mut warnings,
        );
    }

    let scope = format!(
        "{} repositor{}",
        repositories.len(),
        if repositories.len() == 1 { "y" } else { "ies" }
    );

    static_outcome(
        CheckId::Repositories,
        &scope,
        "every query goes through a repository",
        errors,
        warnings,
    )
    .with_hint("Scaffold with `talos repository:create --module=<name>`")
}
