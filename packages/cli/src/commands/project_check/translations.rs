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

/// The suffixes `trans()` appends itself when it pluralizes, so a key that is
/// only ever reached through a `count` still counts as used.
const PLURAL_SUFFIXES: [&str; 6] = ["_plural", "_zero", "_one", "_two", "_few", "_many"];

fn usage_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // Both shapes go through the same two functions: the `trans()` helper a
        // hook wraps, and the `trans()` method the injected Translation class
        // exposes. `has()` looks a key up just as much as `trans()` does.
        Regex::new(r#"\b(?:trans|has)\(\s*["'`]([A-Za-z0-9_.\-]+)["'`]"#)
            .expect("the translation usage pattern is valid")
    })
}

/// The translation keys a source file looks up.
pub fn used_keys(content: &str) -> BTreeSet<String> {
    usage_pattern()
        .captures_iter(content)
        .filter_map(|captured| captured.get(1))
        .map(|group| group.as_str().to_string())
        // A single segment is almost always a variable name caught by accident;
        // every generated key is namespaced.
        .filter(|key| key.contains('.') || key.len() > 3)
        .collect()
}

/// The base key a pluralized entry belongs to.
pub fn plural_base(key: &str) -> Option<&str> {
    PLURAL_SUFFIXES
        .iter()
        .find_map(|suffix| key.strip_suffix(suffix))
}

/// Every key looked up under a directory, which is the scope a dictionary
/// serves: the generators put `translations.json` next to the hook that reads
/// it, and the module dictionary next to the class that injects it.
pub fn keys_used_under(dir: &Path) -> BTreeSet<String> {
    collect_files(dir, &["ts", "tsx"], 8)
        .into_iter()
        .filter_map(|path| fs::read_to_string(path).ok())
        .flat_map(|content| used_keys(&content))
        .collect()
}

/// Keys the code looks up that nothing defines. `trans()` falls back to
/// printing the key itself, so these ship as raw `user.profile.title` text.
pub fn missing_keys(used: &BTreeSet<String>, defined: &BTreeSet<String>) -> Vec<String> {
    used.difference(defined).cloned().collect()
}

/// Keys a dictionary defines that nothing looks up.
pub fn unused_keys(dictionary: &Dictionary, used: &BTreeSet<String>) -> Vec<String> {
    dictionary
        .keys()
        .filter(|key| {
            let base = plural_base(key).unwrap_or(key);
            !used.contains(*key) && !used.contains(base)
        })
        .cloned()
        .collect()
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
    let mut defined: BTreeSet<String> = BTreeSet::new();
    let mut parsed = Vec::new();

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
        defined.extend(dictionary.keys().cloned());
        let (file_errors, file_warnings) = inspect_dictionary(&label, &dictionary);
        errors.extend(file_errors);
        warnings.extend(file_warnings);
        parsed.push((label, dictionary));
    }

    // Usage is resolved across the whole selection rather than per dictionary: a
    // hook in one feature legitimately looks up a key the dictionary next door
    // defines, and only a key nothing anywhere defines is really missing.
    let mut used: BTreeSet<String> = BTreeSet::new();
    let mut sources = 0;
    for module in &modules {
        let src = module.dir.join("src");
        sources += collect_files(&src, &["ts", "tsx"], 8).len();
        used.extend(keys_used_under(&src));
    }

    // With nothing to read the dictionaries from — a translations-only package,
    // or a module whose UI is not written yet — every key would look unused.
    if sources > 0 {
        for key in missing_keys(&used, &defined) {
            errors.push(format!("`{key}` is looked up but no dictionary defines it"));
        }
        for (label, dictionary) in &parsed {
            for key in unused_keys(dictionary, &used) {
                warnings.push(format!("{label}: `{key}` is defined but never looked up"));
            }
        }
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
