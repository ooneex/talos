//! Env check — the local `.env.yml` files against the committed examples.
//!
//! `.env.yml` is git-ignored, so it drifts the moment a teammate adds a key to
//! the example. A missing key surfaces as a confusing runtime error much later,
//! which is exactly what this check prevents.

use std::fs;
use std::path::{Path, PathBuf};

use serde_yaml::Value;

use super::modules::{discover_modules, filter_modules, relative, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Example file names, paired with the real file they describe.
const ENV_FILES: [(&str, &str); 2] = [(".env.example.yml", ".env.yml"), (".env.example", ".env")];

/// One example/actual pair found in the workspace.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EnvPair {
    pub example: PathBuf,
    pub actual: PathBuf,
}

/// Every key path of a YAML document, dot-separated (`logs.betterstack.token`).
pub fn flatten_keys(value: &Value, prefix: &str, keys: &mut Vec<String>) {
    let Value::Mapping(mapping) = value else {
        return;
    };

    for (key, child) in mapping {
        let Some(key) = key.as_str() else {
            continue;
        };
        let path = if prefix.is_empty() {
            key.to_string()
        } else {
            format!("{prefix}.{key}")
        };

        if matches!(child, Value::Mapping(_)) {
            flatten_keys(child, &path, keys);
            continue;
        }
        keys.push(path);
    }
}

/// The leaf key paths of a YAML file, or `None` when it cannot be parsed.
pub fn read_keys(content: &str) -> Option<Vec<String>> {
    let value: Value = serde_yaml::from_str(content).ok()?;
    let mut keys = Vec::new();
    flatten_keys(&value, "", &mut keys);
    keys.sort();
    keys.dedup();
    Some(keys)
}

/// Compare an example against its actual file: `(missing, extra)`.
pub fn diff_keys(example: &[String], actual: &[String]) -> (Vec<String>, Vec<String>) {
    let missing = example
        .iter()
        .filter(|key| !actual.contains(key))
        .cloned()
        .collect();
    let extra = actual
        .iter()
        .filter(|key| !example.contains(key))
        .cloned()
        .collect();
    (missing, extra)
}

/// Every example/actual pair in the root and in each selected module.
pub fn discover_pairs(root: &Path, dirs: &[PathBuf]) -> Vec<EnvPair> {
    let mut pairs = Vec::new();
    for dir in std::iter::once(root.to_path_buf()).chain(dirs.iter().cloned()) {
        for (example, actual) in ENV_FILES {
            let example = dir.join(example);
            if example.is_file() {
                pairs.push(EnvPair {
                    example,
                    actual: dir.join(actual),
                });
            }
        }
    }
    pairs
}

/// Inspect one pair, appending to the shared error/warning buckets.
pub fn inspect_pair(
    root: &Path,
    pair: &EnvPair,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let example_label = relative(root, &pair.example);
    let actual_label = relative(root, &pair.actual);

    if !pair.actual.is_file() {
        errors.push(format!(
            "{actual_label} is missing — copy {example_label} and fill it in"
        ));
        return;
    }

    let Some(example_keys) = fs::read_to_string(&pair.example)
        .ok()
        .and_then(|content| read_keys(&content))
    else {
        errors.push(format!("{example_label} is not valid YAML"));
        return;
    };
    let Some(actual_keys) = fs::read_to_string(&pair.actual)
        .ok()
        .and_then(|content| read_keys(&content))
    else {
        errors.push(format!("{actual_label} is not valid YAML"));
        return;
    };

    let (missing, extra) = diff_keys(&example_keys, &actual_keys);
    for key in missing {
        errors.push(format!("{actual_label}: missing key `{key}`"));
    }
    for key in extra {
        warnings.push(format!(
            "{actual_label}: `{key}` is not documented in {example_label}"
        ));
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );
    let dirs: Vec<PathBuf> = modules.iter().map(|module| module.dir.clone()).collect();
    let pairs = discover_pairs(root, &dirs);

    if pairs.is_empty() {
        return CheckOutcome::new(
            CheckId::Env,
            CheckStatus::Skipped,
            "no .env.example.yml to compare against",
        );
    }

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    for pair in &pairs {
        inspect_pair(root, pair, &mut errors, &mut warnings);
    }

    let scope = format!(
        "{} env file{}",
        pairs.len(),
        if pairs.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Env,
        &scope,
        "every documented key is set locally",
        errors,
        warnings,
    )
    .with_hint(
        "`.env.yml` is git-ignored — never commit it, document the key in the example instead",
    )
}
