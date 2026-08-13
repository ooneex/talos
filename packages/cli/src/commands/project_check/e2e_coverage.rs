//! E2E coverage check — which modules the browser suite actually covers.
//!
//! The `e2e` check runs the suites that exist. This one asks the question
//! before it: a module that renders pages and has no spec at all is not
//! passing its end-to-end tests, it simply has none — and that reads
//! identically in a green CI run. Scoped to the module types a browser can
//! drive; a backend module's testing is its `tests/` suite, not Playwright.

use std::path::Path;

use super::modules::{
    TS_EXTENSIONS, WorkspaceModule, collect_files, discover_modules, filter_modules, wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Module types a browser suite can drive. Backend types (`module`, `api`,
/// `microservice`) render nothing a browser opens — their testing is the
/// unit/integration suite under `tests/`, not Playwright.
const TESTABLE_TYPES: [&str; 4] = ["spa", "admin", "storybook", "swagger"];

/// The directory the generator writes specs into.
const E2E_DIR: &str = "e2e";

/// The config Playwright needs to run a module's suite.
const CONFIG_FILE: &str = "playwright.config.ts";

/// What a module has, end-to-end wise.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Coverage {
    pub specs: usize,
    pub has_config: bool,
    pub has_script: bool,
}

/// Read one module's end-to-end setup.
pub fn coverage(module: &WorkspaceModule) -> Coverage {
    Coverage {
        specs: collect_files(&module.dir.join(E2E_DIR), TS_EXTENSIONS, 4)
            .iter()
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.contains(".spec.") || name.contains(".test."))
            })
            .count(),
        has_config: module.dir.join(CONFIG_FILE).is_file(),
        has_script: module
            .package_json()
            .and_then(|manifest| manifest.pointer("/scripts/e2e").cloned())
            .is_some(),
    }
}

/// What a module actually puts in front of a user, and so what a browser
/// suite would drive.
pub fn serves(kind: Option<&str>) -> Option<String> {
    match kind {
        Some("spa") | Some("admin") => Some("an application".to_string()),
        Some("storybook") => Some("a component gallery".to_string()),
        Some("swagger") => Some("an api explorer".to_string()),
        _ => None,
    }
}

/// Everything incomplete about one module's setup. The three files only work
/// together: a spec nothing runs, a runner with no spec and a suite with no
/// config are each a suite that never executes.
pub fn inspect(
    label: &str,
    kind: Option<&str>,
    coverage: &Coverage,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    if coverage.specs == 0 {
        if let Some(subject) = serves(kind) {
            warnings.push(format!(
                "{label}: serves {subject} and has no end-to-end spec"
            ));
        }
        return;
    }

    if !coverage.has_config {
        errors.push(format!(
            "{label}: {} spec{} but no {CONFIG_FILE} to run them with",
            coverage.specs,
            if coverage.specs == 1 { "" } else { "s" }
        ));
    }
    if !coverage.has_script {
        errors.push(format!(
            "{label}: {} spec{} that no `e2e` script runs — `talos e2e:run` will skip the module",
            coverage.specs,
            if coverage.specs == 1 { "" } else { "s" }
        ));
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<WorkspaceModule> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(|module| {
        module
            .kind
            .as_deref()
            .is_some_and(|kind| TESTABLE_TYPES.contains(&kind))
    })
    .collect();

    if modules.is_empty() {
        return CheckOutcome::new(
            CheckId::E2eCoverage,
            CheckStatus::Skipped,
            "no module a browser suite could drive",
        );
    }

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut covered = 0;
    let mut serving = 0;
    let mut specs = 0;

    for module in &modules {
        let coverage = coverage(module);
        specs += coverage.specs;
        if coverage.specs > 0 {
            covered += 1;
        }
        if serves(module.kind.as_deref()).is_some() {
            serving += 1;
        }
        inspect(
            &module.label(),
            module.kind.as_deref(),
            &coverage,
            &mut errors,
            &mut warnings,
        );
    }

    if serving == 0 {
        return CheckOutcome::new(
            CheckId::E2eCoverage,
            CheckStatus::Skipped,
            "no module serves anything to test yet",
        );
    }

    let scope = format!(
        "{covered}/{serving} module{} · {specs} spec{}",
        if serving == 1 { "" } else { "s" },
        if specs == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::E2eCoverage,
        &scope,
        "every module is covered end to end",
        errors,
        warnings,
    )
    .with_hint("Scaffold one with `talos e2e:create --module=<name>`, then run `talos e2e:run`")
}
