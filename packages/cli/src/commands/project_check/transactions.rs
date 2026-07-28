//! Transactions check — writes that have to succeed or fail together.
//!
//! A method that saves an order and then decrements the stock has two ways to
//! end: both, or the order without the stock. The second one is not an error
//! anywhere — the first `save` committed, the second threw, and the database is
//! now describing something that never happened. Nothing in the type system
//! distinguishes the two, and no test that mocks the repository can either.

use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::artifacts::{self, Corpus, is_backend};
use super::modules::{discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Directories whose writes are a transaction's job rather than its caller's: a
/// repository performs one write, a migration and a seed each run inside their
/// own.
const EXEMPT_SEGMENTS: [&str; 4] = ["/repositories/", "/migrations/", "/seeds/", "/databases/"];

/// The ways a method can already be transactional.
const TRANSACTION_MARKERS: [&str; 5] = [
    "transaction(",
    "queryRunner",
    "manager.transaction",
    "withTransaction",
    "startTransaction",
];

fn method_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(
            r"(?m)^\s*(?:public|private|protected)\s+(?:static\s+)?(?:async\s+)?([A-Za-z0-9_$]+)\s*(?:=\s*(?:async\s*)?)?\(",
        )
        .expect("the method pattern is valid")
    })
}

fn write_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(
            r"\.\s*(save|insert|update|updateMany|delete|softDelete|remove|create|createMany|upsert|increment|decrement)\s*\(",
        )
        .expect("the write pattern is valid")
    })
}

/// One method that writes more than once.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Unguarded {
    pub method: String,
    pub file: String,
    pub line: usize,
    /// The write calls it makes, in the order they run.
    pub writes: Vec<String>,
}

/// The methods of a file that write more than once without a transaction.
pub fn inspect(content: &str, file: &str) -> Vec<Unguarded> {
    let mut found = Vec::new();

    for captured in method_pattern().captures_iter(content) {
        let (Some(whole), Some(name)) = (captured.get(0), captured.get(1)) else {
            continue;
        };
        let Some(open) = content[whole.end()..]
            .find('{')
            .map(|offset| whole.end() + offset)
        else {
            continue;
        };
        let Some(body) = artifacts::balanced(content, open) else {
            continue;
        };

        if TRANSACTION_MARKERS
            .iter()
            .any(|marker| body.contains(marker))
        {
            continue;
        }

        let writes: Vec<String> = write_pattern()
            .captures_iter(body)
            .filter_map(|captured| captured.get(1))
            .map(|group| group.as_str().to_string())
            .collect();

        if writes.len() < 2 {
            continue;
        }

        found.push(Unguarded {
            method: name.as_str().to_string(),
            file: file.to_string(),
            line: artifacts::line_of(content, whole.start()),
            writes,
        });
    }

    found
}

/// Whether a file is one the rule applies to.
pub fn is_checked(file: &str) -> bool {
    !EXEMPT_SEGMENTS.iter().any(|segment| file.contains(segment))
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<_> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(is_backend)
    .collect();

    if modules.is_empty() {
        return CheckOutcome::new(
            CheckId::Transactions,
            CheckStatus::Skipped,
            "no backend module to inspect",
        );
    }

    let corpus = Corpus::build(root, &modules);
    let mut warnings = Vec::new();
    let mut counted = 0;

    for (file, content) in &corpus.files {
        if !is_checked(file) {
            continue;
        }
        counted += 1;
        for unguarded in inspect(content, file) {
            warnings.push(format!(
                "{}:{}: `{}` writes {} times outside a transaction ({})",
                unguarded.file,
                unguarded.line,
                unguarded.method,
                unguarded.writes.len(),
                unguarded.writes.join(", ")
            ));
        }
    }

    if counted == 0 {
        return CheckOutcome::new(
            CheckId::Transactions,
            CheckStatus::Skipped,
            "no TypeScript source to inspect",
        );
    }

    let scope = format!("{counted} file{}", if counted == 1 { "" } else { "s" });

    static_outcome(
        CheckId::Transactions,
        &scope,
        "every multi-write method is atomic",
        Vec::new(),
        warnings,
    )
    .with_hint("Wrap the writes in `dataSource.transaction(async (manager) => …)`")
}
