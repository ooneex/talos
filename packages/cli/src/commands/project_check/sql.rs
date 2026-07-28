//! SQL check — the raw queries a migration or repository writes by hand.
//!
//! Almost everything in this codebase reaches the database through TypeORM,
//! which parameterises for you. The exceptions are migrations and the occasional
//! hand-written repository query, and those are exactly where an interpolated
//! template literal turns a value into executable SQL.

use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::modules::{collect_files, discover_modules, filter_modules, relative, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Folders holding the code allowed to write SQL at all.
const SQL_DIRS: [&str; 4] = ["migrations", "repositories", "seeds", "databases"];

/// Keywords that make a string a query rather than a message.
const SQL_KEYWORDS: [&str; 8] = [
    "SELECT ", "INSERT ", "UPDATE ", "DELETE ", "CREATE ", "ALTER ", "DROP ", "WHERE ",
];

/// One interpolation found inside a query.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Injection {
    pub line: usize,
    /// The expression spliced into the query.
    pub expression: String,
}

fn interpolation_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN
        .get_or_init(|| Regex::new(r"\$\{([^}]*)\}").expect("the interpolation pattern is valid"))
}

/// Whether a template literal is a SQL statement.
pub fn is_query(literal: &str) -> bool {
    let upper = literal.to_uppercase();
    SQL_KEYWORDS.iter().any(|keyword| upper.contains(keyword))
}

/// Whether an interpolated expression is a value — the dangerous case — rather
/// than a name the code controls.
///
/// A schema or table name held in a constant is how a migration is written; a
/// variable carrying a request value is how an injection happens. The two are
/// told apart by what the expression looks like, so anything that is not a
/// plain identifier in SCREAMING_CASE is reported.
pub fn is_value(expression: &str) -> bool {
    let expression = expression.trim();
    if expression.is_empty() {
        return false;
    }
    // A constant, e.g. `${TABLE_NAME}` or `${SCHEMA}`.
    !expression.chars().all(|character| {
        character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
    })
}

/// Every interpolation inside a query in one file.
pub fn scan(content: &str) -> Vec<Injection> {
    let mut found = Vec::new();

    for (number, line) in content.lines().enumerate() {
        // A template literal spans lines, so the line is judged on its own: a
        // line that both interpolates and reads as SQL is the one to report.
        if !is_query(line) {
            continue;
        }
        for captured in interpolation_pattern().captures_iter(line) {
            let Some(expression) = captured.get(1).map(|group| group.as_str()) else {
                continue;
            };
            if !is_value(expression) {
                continue;
            }
            found.push(Injection {
                line: number + 1,
                expression: expression.trim().to_string(),
            });
        }
    }

    found
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );

    let mut errors = Vec::new();
    let mut counted = 0;

    for module in &modules {
        for directory in SQL_DIRS {
            for path in collect_files(&module.dir.join("src").join(directory), &["ts"], 4) {
                let Ok(content) = fs::read_to_string(&path) else {
                    continue;
                };
                counted += 1;
                let label = relative(root, &path);
                for injection in scan(&content) {
                    errors.push(format!(
                        "{label}:{}: `${{{}}}` is interpolated into a query — bind it as a parameter",
                        injection.line, injection.expression
                    ));
                }
            }
        }
    }

    if counted == 0 {
        return CheckOutcome::new(CheckId::Sql, CheckStatus::Skipped, "no query to inspect");
    }

    let scope = format!("{counted} file{}", if counted == 1 { "" } else { "s" });

    static_outcome(
        CheckId::Sql,
        &scope,
        "every query binds its values",
        errors,
        Vec::new(),
    )
    .with_hint("Pass values as parameters: `query(sql, [value])`, never inside the string")
}
