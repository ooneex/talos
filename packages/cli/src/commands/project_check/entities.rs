//! Entities check — the schema the entities describe against the one the
//! migrations actually build.
//!
//! TypeORM runs with `synchronize: false`, so an entity is only a description:
//! the table exists because a migration created it. Adding a column to the
//! class and forgetting the migration type-checks perfectly and then fails at
//! runtime, on the one query that selects it.

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

/// One entity class, reduced to the schema it claims.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entity {
    pub class: String,
    /// The `name:` given to `@Entity`, which is the table.
    pub table: Option<String>,
    /// The `name:` of every column decorator, in declaration order.
    pub columns: Vec<String>,
    pub file: String,
}

fn entity_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r#"(?s)@Entity\(\s*\{[^}]*name\s*:\s*"([^"]+)""#)
            .expect("the entity pattern is valid")
    })
}

fn class_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"(?m)^\s*(?:export\s+)?class\s+([A-Za-z0-9_$]+)")
            .expect("the class pattern is valid")
    })
}

fn column_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // Every column decorator carries the database name as its first key,
        // whichever flavour of column it is — `@Column`, `@PrimaryColumn`,
        // `@CreateDateColumn`, `@PrimaryGeneratedColumn` and the rest.
        Regex::new(r#"(?s)@[A-Za-z]*Column\(\s*\{\s*name\s*:\s*"([^"]+)""#)
            .expect("the column pattern is valid")
    })
}

/// Parse an entity file.
pub fn parse(content: &str, file: &str) -> Option<Entity> {
    let class = class_pattern()
        .captures(content)?
        .get(1)?
        .as_str()
        .to_string();

    Some(Entity {
        class,
        table: entity_pattern()
            .captures(content)
            .and_then(|captured| captured.get(1))
            .map(|group| group.as_str().to_string()),
        columns: column_pattern()
            .captures_iter(content)
            .filter_map(|captured| captured.get(1))
            .map(|group| group.as_str().to_string())
            .collect(),
        file: file.to_string(),
    })
}

/// Every entity of a module.
pub fn collect_entities(root: &Path, module: &WorkspaceModule) -> Vec<Entity> {
    collect_files(&module.dir.join("src").join("entities"), &["ts"], 4)
        .into_iter()
        .filter_map(|path| {
            let content = fs::read_to_string(&path).ok()?;
            // A barrel re-exporting the entities declares no class of its own.
            if !content.contains("@Entity") {
                return None;
            }
            parse(&content, &relative(root, &path))
        })
        .collect()
}

/// The text of every migration of a module, concatenated. A migration is read
/// as text on purpose: it may build the schema through the query builder, raw
/// SQL, or a mix of both, and all that matters here is whether the name appears.
pub fn migration_text(module: &WorkspaceModule) -> String {
    collect_files(&module.dir.join("src").join("migrations"), &["ts"], 4)
        .into_iter()
        .filter_map(|path| fs::read_to_string(path).ok())
        .collect::<Vec<String>>()
        .join("\n")
}

/// Whether a migration mentions a database identifier.
pub fn mentions(migrations: &str, identifier: &str) -> bool {
    migrations.contains(&format!("\"{identifier}\""))
        || migrations.contains(&format!("'{identifier}'"))
        || migrations.contains(&format!("`{identifier}`"))
}

/// Compare one module's entities against its migrations.
pub fn inspect_module(
    entities: &[Entity],
    migrations: &str,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let mut tables: BTreeMap<&str, &str> = BTreeMap::new();

    for entity in entities {
        let Some(table) = entity.table.as_deref() else {
            errors.push(format!(
                "{}: `{}` declares no table name in @Entity",
                entity.file, entity.class
            ));
            continue;
        };

        if let Some(owner) = tables.insert(table, &entity.file) {
            errors.push(format!(
                "{}: the table \"{table}\" is already mapped by {owner}",
                entity.file
            ));
        }

        if !mentions(migrations, table) {
            errors.push(format!(
                "{}: no migration mentions the table \"{table}\"",
                entity.file
            ));
            // Reporting each of its columns as well would bury the one line
            // that matters.
            continue;
        }

        for column in &entity.columns {
            if !mentions(migrations, column) {
                warnings.push(format!(
                    "{}: no migration mentions \"{table}\".\"{column}\"",
                    entity.file
                ));
            }
        }
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut counted = 0;
    let mut columns = 0;

    for module in &modules {
        let entities = collect_entities(root, module);
        if entities.is_empty() {
            continue;
        }
        counted += entities.len();
        columns += entities
            .iter()
            .map(|entity| entity.columns.len())
            .sum::<usize>();

        let migrations = migration_text(module);
        if migrations.is_empty() {
            errors.push(format!(
                "{}: {} entit{} but no migration builds their tables",
                module.label(),
                entities.len(),
                if entities.len() == 1 { "y" } else { "ies" }
            ));
            continue;
        }
        inspect_module(&entities, &migrations, &mut errors, &mut warnings);
    }

    if counted == 0 {
        return CheckOutcome::new(CheckId::Entities, CheckStatus::Skipped, "no entity found");
    }

    let scope = format!(
        "{counted} entit{} · {columns} column{}",
        if counted == 1 { "y" } else { "ies" },
        if columns == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Entities,
        &scope,
        "every table and column is migrated",
        errors,
        warnings,
    )
    .with_hint("Write the missing migration with `talos migration:create --module=<name>`")
}
