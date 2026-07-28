//! Flags check — the feature flags a project can still account for.
//!
//! A flag is addressed by the string `getKey()` returns, and nothing in the
//! type system relates that string to the class. Two flags can claim the same
//! key, in which case which one answers depends on binding order. A flag that
//! nothing reads is a branch of the product permanently pinned to one side,
//! and a flag that has been read out of the code but not deleted is the same
//! thing wearing the opposite disguise.

use std::collections::BTreeMap;
use std::path::Path;

use super::artifacts::{self, Artifact, Corpus, is_backend, is_frontend};
use super::modules::{discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// One feature flag, reduced to the key it answers to.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Flag {
    pub class: String,
    pub key: Option<String>,
    pub described: bool,
    pub file: String,
}

/// Read a feature flag class.
pub fn parse(flag: &Artifact) -> Flag {
    Flag {
        class: flag.class.clone(),
        key: artifacts::returned_string(&flag.content, "getKey"),
        described: artifacts::returned_string(&flag.content, "getDescription")
            .map(|description| !description.trim().is_empty())
            .unwrap_or(false),
        file: flag.file.clone(),
    }
}

/// Keys claimed twice, and flags declaring none.
pub fn inspect(flags: &[Flag], errors: &mut Vec<String>, warnings: &mut Vec<String>) {
    let mut keys: BTreeMap<&str, &str> = BTreeMap::new();

    for flag in flags {
        let file = &flag.file;

        let Some(key) = flag.key.as_deref() else {
            errors.push(format!(
                "{file}: `{}` returns no literal key from getKey()",
                flag.class
            ));
            continue;
        };
        if key.trim().is_empty() {
            errors.push(format!("{file}: `{}` declares an empty key", flag.class));
            continue;
        }

        match keys.get(key) {
            Some(owner) => errors.push(format!(
                "{file}: the flag key \"{key}\" is already claimed by {owner}"
            )),
            None => {
                keys.insert(key, file);
            }
        }

        if !flag.described {
            warnings.push(format!(
                "{file}: `{}` has no description — nobody will know when it can be removed",
                flag.class
            ));
        }
    }
}

/// Flags nothing reads, by class or by key.
///
/// Both spellings count: a backend call injects the class, a front-end one
/// commonly asks for the key as a string, and either is a reader.
pub fn unread(flags: &[Flag], artifacts_of: &[Artifact], corpus: &Corpus) -> Vec<String> {
    flags
        .iter()
        .zip(artifacts_of)
        .filter(|(flag, _)| {
            let by_class = corpus.mentioned_outside(&flag.class, &[flag.file.as_str()]);
            let by_key = flag
                .key
                .as_deref()
                .map(|key| {
                    corpus
                        .files
                        .iter()
                        .filter(|(file, _)| file.as_str() != flag.file)
                        .any(|(_, content)| content.contains(&format!("\"{key}\"")))
                })
                .unwrap_or(false);
            !by_class && !by_key
        })
        .map(|(flag, _)| {
            format!(
                "{}: nothing reads `{}` — the branch it guards is pinned",
                flag.file, flag.class
            )
        })
        .collect()
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    // A flag is declared on the backend and commonly read from a front-end
    // module, so both sides have to be in the corpus for "nothing reads it" to
    // mean anything.
    let modules: Vec<_> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(|module| is_backend(module) || is_frontend(module))
    .collect();

    let declared = artifacts::collect(root, &modules, &["featureFlag"]);
    if declared.is_empty() {
        return CheckOutcome::new(
            CheckId::Flags,
            CheckStatus::Skipped,
            "no feature flag found",
        );
    }

    let corpus = Corpus::build(root, &modules);
    let flags: Vec<Flag> = declared.iter().map(parse).collect();

    let mut errors = Vec::new();
    let mut warnings = unread(&flags, &declared, &corpus);
    inspect(&flags, &mut errors, &mut warnings);

    let scope = format!(
        "{} flag{}",
        flags.len(),
        if flags.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Flags,
        &scope,
        "every flag has a unique key and a reader",
        errors,
        warnings,
    )
    .with_hint("Scaffold with `talos feature-flag:create`, and delete a flag once it has landed")
}
