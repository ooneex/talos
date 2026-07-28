//! Registration check — the classes a module actually loads.
//!
//! A controller, entity, middleware, cron job or event only exists at runtime
//! once its class is listed in the module's `<Name>Module.ts`. Writing the file
//! is not enough, and nothing complains: the route just 404s, the table is
//! absent from the schema, the job never fires. The generators keep the list in
//! sync; a hand-written class or a rename is what drifts.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::graph::SourceIndex;
use super::modules::{WorkspaceModule, discover_modules, filter_modules, relative, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};
use crate::utils::to_pascal_case;

/// The `ModuleType` field each kind of class is registered in.
const REGISTRIES: [(&str, &str); 5] = [
    ("controller", "controllers"),
    ("entity", "entities"),
    ("middleware", "middlewares"),
    ("cron", "cronJobs"),
    ("event", "events"),
];

/// A class that has to be registered, and the field it belongs in.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Registrable {
    pub name: String,
    /// The `ModuleType` field, e.g. `controllers`.
    pub field: &'static str,
    pub file: String,
}

fn class_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"(?m)^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)")
            .expect("the class pattern is valid")
    })
}

/// The registry a decorated class belongs to, read from the decorator sitting
/// above it.
pub fn registry_of(decorators: &str) -> Option<&'static str> {
    if decorators.contains("@Route.") {
        return Some("controllers");
    }
    if decorators.contains("@Entity(") {
        return Some("entities");
    }
    REGISTRIES
        .iter()
        .find(|(kind, _)| decorators.contains(&format!("@decorator.{kind}(")))
        .map(|(_, field)| *field)
}

/// The registrable classes a source file declares.
///
/// A decorator always sits directly above the class it applies to, so the text
/// between the previous class and this one is what decorates it.
pub fn registrables(content: &str, file: &str) -> Vec<Registrable> {
    let mut found = Vec::new();
    let mut previous_end = 0;

    for captured in class_pattern().captures_iter(content) {
        let (Some(whole), Some(name)) = (captured.get(0), captured.get(1)) else {
            continue;
        };
        let decorators = &content[previous_end..whole.start()];
        previous_end = whole.end();

        let Some(field) = registry_of(decorators) else {
            continue;
        };
        found.push(Registrable {
            name: name.as_str().to_string(),
            field,
            file: file.to_string(),
        });
    }

    found
}

/// The class names listed in one `ModuleType` field.
///
/// A spread such as `...SharedModule.controllers` pulls in another module's
/// list wholesale and names nothing of its own, so it is skipped.
pub fn registered(content: &str, field: &str) -> BTreeSet<String> {
    let Ok(pattern) = Regex::new(&format!(r"(?s){field}\s*:\s*\[([^\]]*)\]")) else {
        return BTreeSet::new();
    };
    let Some(body) = pattern
        .captures(content)
        .and_then(|captured| captured.get(1))
        .map(|group| group.as_str())
    else {
        return BTreeSet::new();
    };

    body.split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty() && !entry.starts_with("..."))
        .map(str::to_string)
        .collect()
}

/// The module registry file of a module, e.g. `src/UserModule.ts`.
pub fn registry_path(module: &WorkspaceModule) -> std::path::PathBuf {
    module
        .dir
        .join("src")
        .join(format!("{}Module.ts", to_pascal_case(&module.name)))
}

/// Compare what a module declares against what it registers.
pub fn inspect_module(
    root: &Path,
    module: &WorkspaceModule,
    declared: &[Registrable],
    errors: &mut Vec<String>,
) {
    let label = module.label();
    let path = registry_path(module);

    let Ok(content) = fs::read_to_string(&path) else {
        if !declared.is_empty() {
            errors.push(format!(
                "{label}: {} is missing — {} class{} cannot be registered",
                relative(root, &path),
                declared.len(),
                if declared.len() == 1 { "" } else { "es" }
            ));
        }
        return;
    };

    let mut by_field: BTreeMap<&str, BTreeSet<String>> = BTreeMap::new();
    for entry in declared {
        by_field
            .entry(entry.field)
            .or_default()
            .insert(entry.name.clone());
    }

    for (_, field) in REGISTRIES {
        let listed = registered(&content, field);
        let existing = by_field.remove(field).unwrap_or_default();

        for missing in existing.difference(&listed) {
            let file = declared
                .iter()
                .find(|entry| &entry.name == missing)
                .map(|entry| entry.file.clone())
                .unwrap_or_default();
            errors.push(format!(
                "{label}: `{missing}` ({file}) is not listed in {field} — it is never loaded"
            ));
        }
        for stale in listed.difference(&existing) {
            errors.push(format!(
                "{label}: {field} lists `{stale}`, which no class declares any more"
            ));
        }
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    // Only a backend module carries a container; a front-end one has no
    // `ModuleType` to register anything in.
    .filter(|module| module.group == "modules")
    .filter(|module| {
        !matches!(
            module.kind.as_deref(),
            Some("spa" | "admin" | "design" | "storybook" | "sdk" | "swagger")
        )
    })
    .collect::<Vec<_>>();

    if modules.is_empty() {
        return CheckOutcome::new(
            CheckId::Registration,
            CheckStatus::Skipped,
            "no backend module to inspect",
        );
    }

    let index = SourceIndex::build(root, &modules);
    let mut errors = Vec::new();
    let mut counted = 0;

    for module in &modules {
        let declared: Vec<Registrable> = index
            .module_files(&module.name)
            // The registry file lists the classes; it never declares them.
            .filter(|file| file.path != registry_path(module))
            .filter_map(|file| {
                let content = fs::read_to_string(&file.path).ok()?;
                Some(registrables(&content, &file.label))
            })
            .flatten()
            .collect();

        counted += declared.len();
        inspect_module(root, module, &declared, &mut errors);
    }

    if counted == 0 && errors.is_empty() {
        return CheckOutcome::new(
            CheckId::Registration,
            CheckStatus::Skipped,
            "no registrable class found",
        );
    }

    let scope = format!("{counted} class{}", if counted == 1 { "" } else { "es" });

    static_outcome(
        CheckId::Registration,
        &scope,
        "every class is registered in its module",
        errors,
        Vec::new(),
    )
    .with_hint("The `*-create` generators keep `<Name>Module.ts` in sync")
}
