//! Indexes check — the columns a query filters on against the ones the
//! migrations index.
//!
//! A foreign key is not an index. TypeORM will happily join on `user_id` with
//! nothing behind it, and the query plan degrades from a lookup to a full scan
//! at exactly the row count where nobody is watching any more. The same is true
//! of a `unique: true` column: the constraint is what enforces uniqueness, and
//! without a migration creating it the entity is the only thing that believes
//! it.
//!
//! What a migration builds is read as text — it may use the query runner, raw
//! SQL, or both — so every finding here is a warning rather than a failure.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::artifacts::is_backend;
use super::entities::{mentions, migration_text};
use super::modules::{
    TS_EXTENSIONS, WorkspaceModule, collect_files, discover_modules, filter_modules, relative,
    wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// How much text after the word `index` still belongs to that statement. A
/// `TableIndex` spelled out over several lines stays well inside this.
const STATEMENT_WINDOW: usize = 400;

fn join_column_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r#"(?s)@JoinColumn\(\s*\{[^}]*name\s*:\s*"([^"]+)""#)
            .expect("the join column pattern is valid")
    })
}

fn column_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // The decorator's prefix is captured so `@JoinColumn` — which names the
        // same column from the relation's side — is not counted twice.
        Regex::new(r#"(?s)@([A-Za-z]*)Column\(\s*\{([^}]*)\}"#)
            .expect("the column pattern is valid")
    })
}

fn name_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r#"name\s*:\s*"([^"]+)""#).expect("the column name pattern is valid")
    })
}

/// A column that a query will look things up by.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Lookup {
    pub column: String,
    /// Why it needs one, which is what the report line says.
    pub reason: &'static str,
    /// Whether the index has to be a unique one.
    pub unique: bool,
    pub file: String,
}

/// The columns of one entity file that should be indexed.
pub fn lookups(content: &str, file: &str) -> Vec<Lookup> {
    let mut found = Vec::new();

    for captured in join_column_pattern().captures_iter(content) {
        let Some(column) = captured.get(1) else {
            continue;
        };
        found.push(Lookup {
            column: column.as_str().to_string(),
            reason: "it is a foreign key every join filters on",
            unique: false,
            file: file.to_string(),
        });
    }

    for captured in column_pattern().captures_iter(content) {
        if captured.get(1).map(|group| group.as_str()) == Some("Join") {
            continue;
        }
        let Some(options) = captured.get(2).map(|group| group.as_str()) else {
            continue;
        };
        let Some(column) = name_pattern()
            .captures(options)
            .and_then(|captured| captured.get(1))
            .map(|group| group.as_str().to_string())
        else {
            continue;
        };

        if options.contains("unique: true") || options.contains("unique:true") {
            found.push(Lookup {
                column,
                reason: "the entity declares it unique",
                unique: true,
                file: file.to_string(),
            });
            continue;
        }
        // A column named after another table's key is a foreign key whether or
        // not a relation decorator says so.
        if column != "id" && (column.ends_with("_id") || column.ends_with("Id")) {
            found.push(Lookup {
                column,
                reason: "it names a key rows are looked up by",
                unique: false,
                file: file.to_string(),
            });
        }
    }

    found.sort();
    found.dedup();
    found
}

/// The parts of the migrations that create an index, concatenated.
///
/// Only these windows are searched, so a column merely *created* by a migration
/// is not mistaken for one that is indexed by it.
pub fn index_statements(migrations: &str) -> String {
    let lowercase = migrations.to_ascii_lowercase();
    let mut statements = String::new();
    let mut from = 0;

    while let Some(offset) = lowercase[from..].find("index") {
        let start = from + offset;
        let end = (start + STATEMENT_WINDOW).min(migrations.len());
        // Slicing on a char boundary keeps a migration holding non-ASCII text
        // from panicking the check.
        let end = (start..=end)
            .rev()
            .find(|position| migrations.is_char_boundary(*position))
            .unwrap_or(start);
        statements.push_str(&migrations[start..end]);
        statements.push('\n');
        from = start + "index".len();
    }

    statements
}

/// Whether the migrations create a unique constraint mentioning the column.
pub fn has_unique(migrations: &str, column: &str) -> bool {
    let lowercase = migrations.to_ascii_lowercase();
    let mut from = 0;

    while let Some(offset) = lowercase[from..].find("unique") {
        let start = from + offset;
        let end = (start + STATEMENT_WINDOW).min(migrations.len());
        let end = (start..=end)
            .rev()
            .find(|position| migrations.is_char_boundary(*position))
            .unwrap_or(start);
        if mentions(&migrations[start..end], column) {
            return true;
        }
        from = start + "unique".len();
    }

    false
}

/// The lookups a module's migrations leave unindexed.
pub fn inspect(lookups: &[Lookup], migrations: &str, warnings: &mut Vec<String>) {
    let statements = index_statements(migrations);

    for lookup in lookups {
        if lookup.unique {
            if has_unique(migrations, &lookup.column) || mentions(&statements, &lookup.column) {
                continue;
            }
            warnings.push(format!(
                "{}: no migration creates a unique index on \"{}\" — {}",
                lookup.file, lookup.column, lookup.reason
            ));
            continue;
        }

        if mentions(&statements, &lookup.column) {
            continue;
        }
        warnings.push(format!(
            "{}: no migration indexes \"{}\" — {}",
            lookup.file, lookup.column, lookup.reason
        ));
    }
}

/// Every entity file of a module.
fn entity_files(root: &Path, module: &WorkspaceModule) -> Vec<(String, String)> {
    collect_files(&module.dir.join("src").join("entities"), TS_EXTENSIONS, 4)
        .into_iter()
        .filter_map(|path| {
            let content = fs::read_to_string(&path).ok()?;
            if !content.contains("@Entity") {
                return None;
            }
            Some((relative(root, &path), content))
        })
        .collect()
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<_> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(is_backend)
    .collect();

    let mut warnings = Vec::new();
    let mut counted = 0;
    let mut indexed = BTreeSet::new();

    for module in &modules {
        let files = entity_files(root, module);
        if files.is_empty() {
            continue;
        }
        let found: Vec<Lookup> = files
            .iter()
            .flat_map(|(file, content)| lookups(content, file))
            .collect();
        if found.is_empty() {
            continue;
        }
        counted += found.len();
        indexed.extend(found.iter().map(|lookup| lookup.column.clone()));

        inspect(&found, &migration_text(module), &mut warnings);
    }

    if counted == 0 {
        return CheckOutcome::new(
            CheckId::Indexes,
            CheckStatus::Skipped,
            "no column needing an index found",
        );
    }

    let scope = format!("{counted} column{}", if counted == 1 { "" } else { "s" });

    static_outcome(
        CheckId::Indexes,
        &scope,
        "every key column is indexed",
        Vec::new(),
        warnings,
    )
    .with_hint("Add the index in a migration with `talos migration:create --module=<name>`")
}
