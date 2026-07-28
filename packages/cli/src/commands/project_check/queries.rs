//! Queries check — the cache keys a front-end module reads and invalidates by.
//!
//! TanStack Query is keyed by an array, and the array is the whole contract: a
//! read and the invalidation meant to refresh it agree only if the two literals
//! happen to match. They drift the moment a key gains a parameter, and the
//! symptom is not an error — it is a screen that keeps showing what the user
//! just changed. The convention is a key factory per feature, which is exactly
//! what can be checked.

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::artifacts::{self, Corpus, is_frontend};
use super::modules::{discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// The hooks that read from the cache.
const READ_HOOKS: [&str; 4] = [
    "useQuery",
    "useSuspenseQuery",
    "useInfiniteQuery",
    "useSuspenseInfiniteQuery",
];

/// The hooks that write to the server and therefore have to invalidate.
const WRITE_HOOKS: [&str; 1] = ["useMutation"];

/// The call-site pattern of every hook, compiled once.
///
/// This runs over every source file of every front-end module, and a design
/// system is tens of thousands of them — recompiling five regexes per file is
/// the difference between the check taking a second and taking a minute.
fn hook_patterns() -> &'static [(&'static str, Regex)] {
    static PATTERNS: OnceLock<Vec<(&'static str, Regex)>> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        READ_HOOKS
            .iter()
            .chain(WRITE_HOOKS.iter())
            .map(|hook| {
                let pattern = Regex::new(&format!(
                    r"\b{}\s*(?:<[^>(]*>)?\s*\(\s*\{{",
                    regex::escape(hook)
                ))
                .expect("the hook pattern is valid");
                (*hook, pattern)
            })
            .collect()
    })
}

fn literal_key_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r#"queryKey\s*:\s*\[\s*["'`]([^"'`]+)["'`]"#)
            .expect("the literal key pattern is valid")
    })
}

fn factory_key_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"queryKey\s*:\s*([A-Za-z_$][A-Za-z0-9_$]*)")
            .expect("the factory key pattern is valid")
    })
}

/// One call site, reduced to what it does to the cache.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CallSite {
    pub hook: String,
    pub file: String,
    pub line: usize,
    /// The first element of an inline `queryKey` array, when it is a literal.
    pub literal_root: Option<String>,
    /// Whether the key comes from an identifier — a factory — instead.
    pub from_factory: bool,
    /// Whether a write hook refreshes the cache once it resolves.
    pub invalidates: bool,
}

/// Every query and mutation a file sets up.
pub fn call_sites(content: &str, file: &str) -> Vec<CallSite> {
    let mut sites = Vec::new();

    for (hook, pattern) in hook_patterns() {
        for found in pattern.find_iter(content) {
            let Some(body) = artifacts::balanced(content, found.end() - 1) else {
                continue;
            };
            sites.push(CallSite {
                hook: (*hook).to_string(),
                file: file.to_string(),
                line: artifacts::line_of(content, found.start()),
                literal_root: literal_key_pattern()
                    .captures(body)
                    .and_then(|captured| captured.get(1))
                    .map(|group| group.as_str().to_string()),
                from_factory: factory_key_pattern().is_match(body),
                invalidates: body.contains("invalidateQueries")
                    || body.contains("setQueryData")
                    || body.contains("resetQueries")
                    || body.contains("removeQueries"),
            });
        }
    }

    sites.sort_by(|left, right| (&left.file, left.line).cmp(&(&right.file, right.line)));
    sites
}

/// The feature a file belongs to, which is what a key root should be scoped to.
pub fn feature_of(file: &str) -> Option<&str> {
    let (_, rest) = file.split_once("/features/")?;
    rest.split('/').next()
}

/// Everything about a set of call sites that will leave the screen stale.
pub fn inspect(sites: &[CallSite], errors: &mut Vec<String>, warnings: &mut Vec<String>) {
    // A key root belongs to one feature. Two features reading under the same
    // root invalidate each other's caches by accident.
    let mut roots: BTreeMap<&str, (&str, Option<&str>)> = BTreeMap::new();

    for site in sites {
        let file = &site.file;
        let line = site.line;

        if WRITE_HOOKS.contains(&site.hook.as_str()) {
            if !site.invalidates {
                warnings.push(format!(
                    "{file}:{line}: the mutation never refreshes the cache — the screen keeps the old value"
                ));
            }
            continue;
        }

        let Some(root) = site.literal_root.as_deref() else {
            if !site.from_factory {
                warnings.push(format!("{file}:{line}: {} declares no queryKey", site.hook));
            }
            continue;
        };

        warnings.push(format!(
            "{file}:{line}: the queryKey is written inline as [\"{root}\", …] rather than read from a key factory"
        ));

        let feature = feature_of(file);
        match roots.get(root) {
            Some((owner, owner_feature)) if *owner_feature != feature => errors.push(format!(
                "{file}:{line}: the key root \"{root}\" is also used by {owner}, in another feature"
            )),
            Some(_) => {}
            None => {
                roots.insert(root, (file, feature));
            }
        }
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<_> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(is_frontend)
    .collect();

    if modules.is_empty() {
        return CheckOutcome::new(
            CheckId::Queries,
            CheckStatus::Skipped,
            "no front-end module to inspect",
        );
    }

    let corpus = Corpus::build(root, &modules);
    let sites: Vec<CallSite> = corpus
        .files
        .iter()
        .flat_map(|(file, content)| call_sites(content, file))
        .collect();

    if sites.is_empty() {
        return CheckOutcome::new(
            CheckId::Queries,
            CheckStatus::Skipped,
            "no query or mutation found",
        );
    }

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    inspect(&sites, &mut errors, &mut warnings);

    let reads = sites
        .iter()
        .filter(|site| READ_HOOKS.contains(&site.hook.as_str()))
        .count();
    let scope = format!(
        "{reads} quer{} · {} mutation{}",
        if reads == 1 { "y" } else { "ies" },
        sites.len() - reads,
        if sites.len() - reads == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Queries,
        &scope,
        "every key comes from a factory and every mutation invalidates",
        errors,
        warnings,
    )
    .with_hint("`talos spa:feature:create` writes a `<feature>Keys` factory reads and writes share")
}
