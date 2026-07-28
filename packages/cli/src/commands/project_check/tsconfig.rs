//! Tsconfig check — the compiler settings every module inherits.
//!
//! One `tsconfig.json` at the root decides how strict the whole workspace is.
//! A module that forgets to extend it, or quietly relaxes a flag to make an
//! error go away, is type-checked under different rules than everything around
//! it — and the difference only shows up when someone else touches the file.

use std::path::Path;

use serde_json::Value;

use super::modules::{
    TS_EXTENSIONS, WorkspaceModule, collect_files, discover_modules, filter_modules, read_json,
    wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Flags that make the compiler catch real bugs. Turning one off is always a
/// deliberate act, and always worth a line in the report.
const STRICTNESS: [&str; 8] = [
    "strict",
    "strictNullChecks",
    "noImplicitAny",
    "noUncheckedIndexedAccess",
    "noImplicitOverride",
    "noUnusedLocals",
    "noUnusedParameters",
    "noFallthroughCasesInSwitch",
];

/// Directories a module must keep out of its program: build output type-checked
/// as source is both slow and full of errors nobody can fix.
const EXCLUDED: [&str; 2] = ["node_modules", "dist"];

/// Whether a module holds TypeScript that a tsconfig would govern.
pub fn has_typescript(dir: &Path) -> bool {
    !collect_files(&dir.join("src"), TS_EXTENSIONS, 8).is_empty()
}

/// Read a boolean compiler option.
pub fn option(tsconfig: &Value, name: &str) -> Option<bool> {
    tsconfig
        .pointer(&format!("/compilerOptions/{name}"))
        .and_then(Value::as_bool)
}

/// The strictness flags the root turns on.
pub fn strict_flags(root_tsconfig: &Value) -> Vec<&'static str> {
    STRICTNESS
        .into_iter()
        .filter(|flag| option(root_tsconfig, flag) == Some(true))
        .collect()
}

/// Compare one module's tsconfig against the root it should inherit from.
pub fn inspect_module(
    module: &WorkspaceModule,
    tsconfig: &Value,
    inherited: &[&'static str],
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let label = module.label();

    match tsconfig.get("extends").and_then(Value::as_str) {
        // The root config is two levels up: `modules/<name>/tsconfig.json`.
        Some(extends)
            if extends
                .trim_end_matches(".json")
                .ends_with("../../tsconfig") => {}
        Some(extends) => warnings.push(format!(
            "{label}: tsconfig.json extends \"{extends}\" rather than the root config"
        )),
        None => errors.push(format!(
            "{label}: tsconfig.json extends nothing — it inherits none of the workspace settings"
        )),
    }

    for flag in inherited {
        if option(tsconfig, flag) == Some(false) {
            errors.push(format!(
                "{label}: tsconfig.json turns `{flag}` off, which the root turns on"
            ));
        }
    }

    let excluded: Vec<String> = tsconfig
        .get("exclude")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();

    for directory in EXCLUDED {
        if module.dir.join(directory).is_dir()
            && !excluded.iter().any(|entry| entry.contains(directory))
        {
            warnings.push(format!(
                "{label}: tsconfig.json does not exclude \"{directory}\""
            ));
        }
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<WorkspaceModule> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(|module| has_typescript(&module.dir))
    .collect();

    if modules.is_empty() {
        return CheckOutcome::new(
            CheckId::Tsconfig,
            CheckStatus::Skipped,
            "no TypeScript module to type-check",
        );
    }

    let Some(root_tsconfig) = read_json(&root.join("tsconfig.json")) else {
        return static_outcome(
            CheckId::Tsconfig,
            "root",
            "",
            vec!["root tsconfig.json is missing or is not valid JSON".to_string()],
            Vec::new(),
        );
    };

    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    let inherited = strict_flags(&root_tsconfig);
    for flag in STRICTNESS {
        if option(&root_tsconfig, flag) == Some(false) {
            warnings.push(format!(
                "root tsconfig.json turns `{flag}` off for the whole workspace"
            ));
        }
    }

    let mut counted = 0;
    for module in &modules {
        let path = module.dir.join("tsconfig.json");
        if !path.is_file() {
            // The structure check already reports the missing file; repeating
            // it here would say the same thing twice in one report.
            continue;
        }
        counted += 1;
        match read_json(&path) {
            None => errors.push(format!(
                "{}: tsconfig.json is not valid JSON",
                module.label()
            )),
            Some(tsconfig) => {
                inspect_module(module, &tsconfig, &inherited, &mut errors, &mut warnings)
            }
        }
    }

    let scope = format!("{counted} tsconfig{}", if counted == 1 { "" } else { "s" });

    static_outcome(
        CheckId::Tsconfig,
        &scope,
        "every module inherits the root settings",
        errors,
        warnings,
    )
    .with_hint("A module tsconfig extends `../../tsconfig.json` and overrides nothing strict")
}
