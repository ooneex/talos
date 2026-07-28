//! Restricted check — packages imported where they do not belong.
//!
//! Two kinds of import are wrong regardless of what the code does with them. A
//! server runtime pulled into a browser module breaks the build at best and
//! leaks at worst, and a package the ecosystem already replaces means two
//! answers to the same question live in the codebase at once. Both read as
//! perfectly ordinary import lines.

use std::path::Path;

use super::graph::{Layer, SourceIndex};
use super::modules::{discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Module types whose code ends up in a browser bundle.
const BROWSER_TYPES: [&str; 4] = ["spa", "admin", "design", "storybook"];

/// Runtime prefixes that only exist on a server.
const SERVER_RUNTIMES: [&str; 3] = ["node:", "bun:", "bun/"];

/// Packages the ecosystem already answers, and what to reach for instead.
const REPLACED: [(&str, &str); 6] = [
    ("moment", "@talosjs/hour-utils"),
    ("lodash", "@talosjs/utils"),
    ("lodash-es", "@talosjs/utils"),
    ("axios", "@talosjs/fetcher"),
    ("dotenv", "the injected AppEnv from @talosjs/app-env"),
    ("uuid", "`random.id()` from @talosjs/utils/random"),
];

/// Packages that belong to one layer only, with the folders allowed to import
/// them. Reaching for the ORM from a controller is how business logic ends up
/// in the transport layer.
const CONFINED: [(&str, &[Layer]); 1] = [(
    "typeorm",
    &[
        Layer::Entity,
        Layer::Repository,
        Layer::Migration,
        Layer::Seed,
        Layer::Other,
    ],
)];

/// Whether a module ships to a browser.
pub fn is_browser(kind: Option<&str>) -> bool {
    kind.is_some_and(|kind| BROWSER_TYPES.contains(&kind))
}

/// The server runtime a specifier reaches for, if any.
pub fn server_runtime(specifier: &str) -> Option<&'static str> {
    SERVER_RUNTIMES
        .into_iter()
        .find(|prefix| specifier.starts_with(prefix))
}

/// The package a specifier belongs to, ignoring any subpath.
fn package_of(specifier: &str) -> String {
    let mut segments = specifier.split('/');
    let first = segments.next().unwrap_or_default();
    match (first.starts_with('@'), segments.next()) {
        (true, Some(second)) => format!("{first}/{second}"),
        _ => first.to_string(),
    }
}

/// Every restricted import in the workspace.
pub fn inspect(index: &SourceIndex) -> (Vec<String>, Vec<String>) {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    for file in &index.files {
        for import in &file.imports {
            let specifier = import.specifier.as_str();
            if import.is_local() {
                continue;
            }

            if is_browser(file.kind.as_deref())
                && let Some(runtime) = server_runtime(specifier)
            {
                errors.push(format!(
                    "{}: imports `{specifier}` — `{runtime}` does not exist in a browser",
                    file.label
                ));
            }

            let package = package_of(specifier);
            if let Some((_, replacement)) = REPLACED
                .iter()
                .find(|(replaced, _)| *replaced == package.as_str())
            {
                warnings.push(format!(
                    "{}: imports `{package}` — this workspace uses {replacement}",
                    file.label
                ));
            }

            if let Some((_, allowed)) = CONFINED
                .iter()
                .find(|(confined, _)| *confined == package.as_str())
                && !allowed.contains(&file.layer)
            {
                warnings.push(format!(
                    "{}: a {} imports `{package}` — the ORM belongs to the repository layer",
                    file.label,
                    file.layer.label()
                ));
            }
        }
    }

    (errors, warnings)
}

/// A browser module that declares a server-only package as a dependency ships
/// it whether or not a file imports it yet.
pub fn manifest_findings(modules: &[super::modules::WorkspaceModule]) -> Vec<String> {
    modules
        .iter()
        .filter(|module| is_browser(module.kind.as_deref()))
        .filter_map(|module| {
            let manifest = module.package_json()?;
            let declared = manifest.get("dependencies")?.as_object()?;
            let found: Vec<String> = declared
                .keys()
                .filter(|name| {
                    REPLACED
                        .iter()
                        .any(|(replaced, _)| replaced == &name.as_str())
                })
                .cloned()
                .collect();
            (!found.is_empty()).then(|| {
                format!(
                    "{}: package.json declares {}",
                    module.label(),
                    found
                        .iter()
                        .map(|name| format!("`{name}`"))
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            })
        })
        .collect()
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );
    let index = SourceIndex::build(root, &modules);

    if index.files.is_empty() {
        return CheckOutcome::new(
            CheckId::Restricted,
            CheckStatus::Skipped,
            "no TypeScript source to inspect",
        );
    }

    let (errors, mut warnings) = inspect(&index);
    warnings.extend(manifest_findings(&modules));

    let imports: usize = index.files.iter().map(|file| file.imports.len()).sum();
    let scope = format!("{imports} import{}", if imports == 1 { "" } else { "s" });

    static_outcome(
        CheckId::Restricted,
        &scope,
        "every package is imported where it belongs",
        errors,
        warnings,
    )
    .with_hint("`talos-packages` lists the @talosjs package that answers each need")
}
