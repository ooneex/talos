// Translations check — locale parity inside every dictionary.
//
// `trans()` falls back to `en` and returns the key itself when a locale is
// missing, so an incomplete dictionary ships silently. Comparing every leaf
// against the locales the file already uses catches it before release.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use regex::Regex;
use serde_json::Value;

use super::modules::{WorkspaceModule, collect_files};

/// The locale every dictionary must define, because `trans()` falls back to it.
pub const FALLBACK_LOCALE: &str = "en";

/// File names the translation generators produce.
const DICTIONARY_NAMES: [&str; 3] = ["translations.yml", "translations.yaml", "translations.json"];

/// Directory names holding fixture or test data, where a `translations.yml`
/// is an example dictionary rather than one the application ships.
const FIXTURE_DIR_HINTS: [&str; 5] = ["tests", "test", "fixtures", "mocks", "__mocks__"];

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

/// The sibling keys `trans()` selects itself from a `count`, so an entry that
/// is only ever reached through its base key still counts as used. These are
/// the only two suffixes `select()` resolves — any other is dead weight.
const PLURAL_SUFFIXES: [&str; 2] = ["_plural", "_zero"];

/// The module that owns the raw `trans(dict, key)` / `has(dict, key)` helpers.
/// A file importing them is the plumbing a hook or a `Translation` class is
/// built from, not a consumer, and its calls name a dictionary rather than a
/// key — so scanning it would only ever produce noise.
const PLUMBING_IMPORT: &str = "@talosjs/utils/trans";

fn usage_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // Both shapes go through the same two functions: the `trans()` helper a
        // hook wraps, and the `trans()` method the injected Translation class
        // exposes. Which of the two was called decides the severity, so the
        // name is captured alongside the key.
        Regex::new(r#"\b(trans|has)\(\s*["'`]([A-Za-z0-9_.\-]+)["'`]\s*[,)]"#)
            .expect("the translation usage pattern is valid")
    })
}

fn dynamic_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // A key assembled at runtime — `trans(key)`, `trans(`nav.${id}`)`. No
        // static pass can tell which entries it reaches.
        Regex::new(r#"\b(?:trans|has)\(\s*(?:[A-Za-z_$][A-Za-z0-9_$.\[\]]*\s*[,)]|`[^`]*\$\{)"#)
            .expect("the dynamic translation usage pattern is valid")
    })
}

/// What a body of source asks of the dictionary that serves it.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Usage {
    /// Keys resolved through `trans()`. A miss throws, or ships the raw key.
    pub lookups: BTreeSet<String>,
    /// Keys probed through `has()`. A miss is the answer, not a defect, so
    /// these only ever prove a key is reachable.
    pub probes: BTreeSet<String>,
    /// Whether a key is built at runtime, which makes "never looked up"
    /// unprovable for every dictionary the code can reach.
    pub dynamic: bool,
}

impl Usage {
    /// Every key named literally, whichever function named it.
    pub fn reached(&self) -> BTreeSet<String> {
        self.lookups.union(&self.probes).cloned().collect()
    }

    fn absorb(&mut self, other: &Usage) {
        self.lookups.extend(other.lookups.iter().cloned());
        self.probes.extend(other.probes.iter().cloned());
        self.dynamic |= other.dynamic;
    }
}

/// The keys a source file names, split by the call that named them.
pub fn scan_usage(content: &str) -> Usage {
    if content.contains(PLUMBING_IMPORT) {
        return Usage::default();
    }

    let mut usage = Usage {
        dynamic: dynamic_pattern().is_match(content),
        ..Usage::default()
    };

    for captured in usage_pattern().captures_iter(content) {
        let (Some(function), Some(key)) = (captured.get(1), captured.get(2)) else {
            continue;
        };
        let key = key.as_str();
        // A single short segment is almost always a variable name caught by
        // accident; every generated key is namespaced.
        if !key.contains('.') && key.len() <= 3 {
            continue;
        }
        let bucket = if function.as_str() == "trans" {
            &mut usage.lookups
        } else {
            &mut usage.probes
        };
        bucket.insert(key.to_string());
    }

    usage
}

/// The translation keys a source file names.
pub fn used_keys(content: &str) -> BTreeSet<String> {
    scan_usage(content).reached()
}

/// The base key a pluralized entry belongs to.
pub fn plural_base(key: &str) -> Option<&str> {
    PLURAL_SUFFIXES
        .iter()
        .find_map(|suffix| key.strip_suffix(suffix))
}

/// The directory a dictionary serves. The generators put the module dictionary
/// at `src/translations.yml`, next to the class that injects it, and a spa
/// feature's `translations/translations.json` next to the hook that reads it —
/// so the folder holding the dictionary is the scope, unless that folder is the
/// `translations/` box itself, in which case the feature around it is.
pub fn dictionary_scope(path: &Path) -> Option<PathBuf> {
    let parent = path.parent()?;
    if parent.file_name().and_then(|name| name.to_str()) == Some("translations") {
        return parent.parent().map(Path::to_path_buf);
    }
    Some(parent.to_path_buf())
}

/// Everything named under a directory, which is how a scope is read as a whole.
pub fn usage_under(dir: &Path) -> Usage {
    let mut usage = Usage::default();
    for path in collect_files(dir, &["ts", "tsx"], 8) {
        let Ok(content) = fs::read_to_string(path) else {
            continue;
        };
        usage.absorb(&scan_usage(&content));
    }
    usage
}

/// Every key looked up under a directory.
pub fn keys_used_under(dir: &Path) -> BTreeSet<String> {
    usage_under(dir).reached()
}

/// Keys the code looks up that nothing defines. `trans()` throws on those, and
/// the spa hook ships them as raw `user.profile.title` text.
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

/// The dictionary serving a source file: the deepest scope enclosing it, so a
/// spa feature's own `translations.json` wins over the module dictionary above
/// it. `None` when no dictionary covers the file at all.
pub(super) fn owning_scope(
    parsed: &[(String, Option<PathBuf>, Dictionary)],
    path: &Path,
) -> Option<usize> {
    parsed
        .iter()
        .enumerate()
        .filter_map(|(index, (_, scope, _))| {
            let scope = scope.as_ref()?;
            path.starts_with(scope)
                .then(|| (scope.components().count(), index))
        })
        .max()
        .map(|(_, index)| index)
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
        // A dictionary under a fixture-style directory (tests, mocks, templates)
        // is example or test data, not a real dictionary an application ships —
        // its keys are exercised by the test itself, not by `keys_used_under`.
        .filter(|path| {
            !path.components().any(|component| {
                component.as_os_str().to_str().is_some_and(|name| {
                    FIXTURE_DIR_HINTS.contains(&name.to_ascii_lowercase().as_str())
                })
            })
        })
        .collect();
    files.sort();
    files.dedup();
    files
}

#[path = "translations/check.rs"]
mod check;

pub use check::run;
