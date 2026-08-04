// The translations check's entry point: discovers dictionaries, parses them,
// scans module sources for usage, and compares the two.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use super::{
    Dictionary, Usage, dictionary_scope, discover_dictionaries, flatten, inspect_dictionary,
    missing_keys, owning_scope, parse_dictionary, scan_usage, unused_keys,
};
use crate::commands::project_check::modules::{
    WorkspaceModule, collect_files, discover_modules, filter_modules, relative, wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

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
    let (keys, defined, parsed) = parse_dictionaries(root, &files, &mut errors, &mut warnings);

    // Each file is read against the dictionary that actually serves it — the
    // nearest scope enclosing it — because that is the only dictionary the hook
    // or the injected class it calls has bound. Resolving against the union
    // instead would let a key defined in one feature excuse a lookup in the
    // next, which is exactly the case that throws at runtime.
    let (selection, scoped, sources) = scan_module_usage(&modules, &parsed);

    // With nothing to read the dictionaries from — a translations-only package,
    // or a module whose UI is not written yet — every key would look unused.
    if sources > 0 {
        check_usage(
            &selection,
            &scoped,
            &parsed,
            &defined,
            &mut errors,
            &mut warnings,
        );
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

/// Parses every discovered dictionary file, flattening each into its keys and
/// accumulating the errors/warnings surfaced while doing so. Returns the total
/// key count, the union of all defined keys, and the parsed dictionaries
/// (label, owning scope, flattened content).
fn parse_dictionaries(
    root: &Path,
    files: &[PathBuf],
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> (
    usize,
    BTreeSet<String>,
    Vec<(String, Option<PathBuf>, Dictionary)>,
) {
    let mut keys = 0;
    let mut defined: BTreeSet<String> = BTreeSet::new();
    let mut parsed: Vec<(String, Option<PathBuf>, Dictionary)> = Vec::new();

    for path in files {
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
        parsed.push((label, dictionary_scope(path), dictionary));
    }

    (keys, defined, parsed)
}

/// Scans every module's TypeScript sources for translation lookups, returning
/// the overall usage, the usage scoped to each parsed dictionary, and the
/// number of source files that were actually read.
fn scan_module_usage(
    modules: &[WorkspaceModule],
    parsed: &[(String, Option<PathBuf>, Dictionary)],
) -> (Usage, Vec<Usage>, usize) {
    let mut selection = Usage::default();
    let mut scoped: Vec<Usage> = vec![Usage::default(); parsed.len()];
    let mut sources = 0;
    for module in modules {
        let src = module.dir.join("src");
        for path in collect_files(&src, &["ts", "tsx"], 8) {
            sources += 1;
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            let usage = scan_usage(&content);
            selection.absorb(&usage);
            if let Some(index) = owning_scope(parsed, &path) {
                scoped[index].absorb(&usage);
            }
        }
    }

    (selection, scoped, sources)
}

/// Compares the collected usage against the dictionaries: flags lookups with
/// no definition anywhere, lookups resolved only by a sibling dictionary, and
/// keys defined but never looked up.
fn check_usage(
    selection: &Usage,
    scoped: &[Usage],
    parsed: &[(String, Option<PathBuf>, Dictionary)],
    defined: &BTreeSet<String>,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let reached = selection.reached();
    for key in missing_keys(&selection.lookups, defined) {
        errors.push(format!("`{key}` is looked up but no dictionary defines it"));
    }

    for (index, (label, _, dictionary)) in parsed.iter().enumerate() {
        let usage = &scoped[index];
        let own: BTreeSet<String> = dictionary.keys().cloned().collect();

        // Defined somewhere, but not here: the lookup resolves only if the
        // file imported another feature's hook, so it warns rather than
        // fails.
        for key in missing_keys(&usage.lookups, &own)
            .into_iter()
            .filter(|key| reached.contains(key) && defined.contains(key))
        {
            warnings.push(format!(
                "{label}: `{key}` is looked up in its scope but only another dictionary defines it"
            ));
        }

        if usage.dynamic {
            warnings.push(format!(
                "{label}: unused keys not checked — a `trans()` call in its scope builds the key at runtime"
            ));
            continue;
        }

        for key in unused_keys(dictionary, &reached) {
            warnings.push(format!("{label}: `{key}` is defined but never looked up"));
        }
    }
}
