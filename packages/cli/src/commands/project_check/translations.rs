//! Translations check — locale parity inside every dictionary.
//!
//! `trans()` falls back to `en` and returns the key itself when a locale is
//! missing, so an incomplete dictionary ships silently. Comparing every leaf
//! against the locales the file already uses catches it before release.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use regex::Regex;
use serde_json::Value;

use super::modules::{
    WorkspaceModule, collect_files, discover_modules, filter_modules, relative, wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// The locale every dictionary must define, because `trans()` falls back to it.
pub const FALLBACK_LOCALE: &str = "en";

/// File names the translation generators produce.
const DICTIONARY_NAMES: [&str; 3] = ["translations.yml", "translations.yaml", "translations.json"];

/// A dictionary flattened to `key path -> locale -> value`.
pub type Dictionary = BTreeMap<String, BTreeMap<String, String>>;

/// Parse a dictionary from YAML or JSON.
pub fn parse_dictionary(content: &str, json: bool) -> Option<Value> {
    if json {
        serde_json::from_str(content).ok()
    } else {
        serde_yaml::from_str(content).ok()
    }
}

/// Flatten a dictionary document into its locale maps.
pub fn flatten(value: &Value) -> Dictionary {
    let mut entries = Dictionary::new();
    collect(value, "", &mut entries);
    entries
}

fn collect(value: &Value, prefix: &str, entries: &mut Dictionary) {
    let Some(mapping) = value.as_object() else {
        return;
    };

    // A node whose values are all strings is a locale map, i.e. a leaf.
    if !mapping.is_empty() && mapping.values().all(Value::is_string) {
        if prefix.is_empty() {
            return;
        }
        entries.insert(
            prefix.to_string(),
            mapping
                .iter()
                .filter_map(|(locale, text)| Some((locale.clone(), text.as_str()?.to_string())))
                .collect(),
        );
        return;
    }

    for (key, child) in mapping {
        let path = if prefix.is_empty() {
            key.clone()
        } else {
            format!("{prefix}.{key}")
        };
        collect(child, &path, entries);
    }
}

/// Every locale used anywhere in a dictionary.
pub fn locales(dictionary: &Dictionary) -> BTreeSet<String> {
    dictionary
        .values()
        .flat_map(|translations| translations.keys().cloned())
        .collect()
}

fn placeholder_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"\{\{\s*([A-Za-z0-9_]+)\s*\}\}").expect("the placeholder pattern is valid")
    })
}

/// The `{{ param }}` names a translation interpolates.
pub fn placeholders(text: &str) -> BTreeSet<String> {
    placeholder_pattern()
        .captures_iter(text)
        .filter_map(|captured| captured.get(1))
        .map(|group| group.as_str().to_string())
        .collect()
}

/// Compare every leaf against the locales the file uses: `(errors, warnings)`.
pub fn inspect_dictionary(label: &str, dictionary: &Dictionary) -> (Vec<String>, Vec<String>) {
    let used = locales(dictionary);
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    for (key, translations) in dictionary {
        if !translations.contains_key(FALLBACK_LOCALE) {
            errors.push(format!(
                "{label}: `{key}` has no `{FALLBACK_LOCALE}` value — it is the fallback locale"
            ));
        }

        for locale in used
            .iter()
            .filter(|locale| !translations.contains_key(*locale))
        {
            warnings.push(format!(
                "{label}: `{key}` is missing the `{locale}` translation"
            ));
        }

        for (locale, text) in translations {
            if text.trim().is_empty() {
                warnings.push(format!("{label}: `{key}` is empty in `{locale}`"));
            }
        }

        let Some(reference) = translations.get(FALLBACK_LOCALE) else {
            continue;
        };
        let expected = placeholders(reference);
        for (locale, text) in translations
            .iter()
            .filter(|(locale, _)| *locale != FALLBACK_LOCALE)
        {
            let actual = placeholders(text);
            let missing: Vec<&String> = expected.difference(&actual).collect();
            if !missing.is_empty() {
                warnings.push(format!(
                    "{label}: `{key}` in `{locale}` drops the placeholder{} {}",
                    if missing.len() == 1 { "" } else { "s" },
                    missing
                        .iter()
                        .map(|name| format!("{{{{ {name} }}}}"))
                        .collect::<Vec<_>>()
                        .join(", ")
                ));
            }
        }
    }

    (errors, warnings)
}

/// Every dictionary file inside the selected modules.
pub fn discover_dictionaries(modules: &[WorkspaceModule]) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = modules
        .iter()
        .flat_map(|module| collect_files(&module.dir, &["yml", "yaml", "json"], 8))
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| DICTIONARY_NAMES.contains(&name))
                .unwrap_or(false)
        })
        .collect();
    files.sort();
    files.dedup();
    files
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );
    let files = discover_dictionaries(&modules);

    if files.is_empty() {
        return CheckOutcome::new(
            CheckId::Translations,
            CheckStatus::Skipped,
            "no translations dictionary found",
        );
    }

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut keys = 0;

    for path in &files {
        let label = relative(root, path);
        let json = path.extension().and_then(|ext| ext.to_str()) == Some("json");
        let Some(document) = fs::read_to_string(path)
            .ok()
            .and_then(|content| parse_dictionary(&content, json))
        else {
            errors.push(format!("{label} could not be parsed"));
            continue;
        };

        let dictionary = flatten(&document);
        keys += dictionary.len();
        let (file_errors, file_warnings) = inspect_dictionary(&label, &dictionary);
        errors.extend(file_errors);
        warnings.extend(file_warnings);
    }

    let scope = format!(
        "{} dictionar{} · {keys} key{}",
        files.len(),
        if files.len() == 1 { "y" } else { "ies" },
        if keys == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Translations,
        &scope,
        "every locale is complete",
        errors,
        warnings,
    )
    .with_hint("Complete the dictionaries with the `translation-translate` skill")
}
