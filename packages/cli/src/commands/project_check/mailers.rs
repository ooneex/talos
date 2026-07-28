//! Mailers check — a sender and the template it renders.
//!
//! A mailer is two files that only the naming convention holds together: the
//! class that sends and the JSX component it renders. Rename or delete one and
//! the other keeps compiling — the import resolves through a barrel, or the
//! props type drifts from the object the sender passes — until the first
//! message goes out with an empty body.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use super::artifacts::{self, Artifact, Corpus, is_backend};
use super::modules::{TS_EXTENSIONS, WorkspaceModule, collect_files, relative};
use super::modules::{discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// The suffix the generator gives a mailer's component.
const TEMPLATE_SUFFIX: &str = "MailerTemplate";

/// Every `<Name>MailerTemplate` a module exports, with the file declaring it.
pub fn templates(root: &Path, module: &WorkspaceModule) -> BTreeSet<(String, String)> {
    let mut found = BTreeSet::new();

    for path in collect_files(&module.dir.join("src").join("mailers"), TS_EXTENSIONS, 4) {
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let file = relative(root, &path);
        for name in super::graph::exported_names(&content) {
            if name.ends_with(TEMPLATE_SUFFIX) {
                found.insert((name, file.clone()));
            }
        }
    }

    found
}

/// The template a mailer class is expected to render, derived from its name.
pub fn template_of(class: &str) -> String {
    format!(
        "{}{TEMPLATE_SUFFIX}",
        class.strip_suffix("Mailer").unwrap_or(class)
    )
}

/// Everything about one mailer that will send an empty message.
pub fn inspect(
    mailer: &Artifact,
    templates: &BTreeSet<(String, String)>,
    corpus: &Corpus,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let file = &mailer.file;
    let class = &mailer.class;
    let expected = template_of(class);

    match artifacts::method_body(&mailer.content, "send") {
        None => errors.push(format!(
            "{file}: `{class}` declares no `send` — IMailer requires one"
        )),
        Some(body) if artifacts::is_empty_body(body) => {
            warnings.push(format!("{file}: `{class}`.send does nothing yet"))
        }
        Some(_) => {}
    }

    if !templates.iter().any(|(name, _)| name == &expected) {
        errors.push(format!("{file}: `{class}` has no `{expected}` to render"));
    } else if !artifacts::contains_word(&mailer.content, &expected) {
        warnings.push(format!(
            "{file}: `{class}` never references `{expected}` — it renders something else"
        ));
    }

    if !corpus.mentioned_outside(class, &[file.as_str()]) {
        warnings.push(format!("{file}: nothing sends `{class}`"));
    }
}

/// Components sitting in `mailers/` that no sender renders.
pub fn orphan_templates(
    templates: &BTreeSet<(String, String)>,
    mailers: &[Artifact],
) -> Vec<String> {
    let expected: BTreeSet<String> = mailers
        .iter()
        .map(|mailer| template_of(&mailer.class))
        .collect();

    templates
        .iter()
        .filter(|(name, _)| !expected.contains(name))
        .map(|(name, file)| format!("{file}: `{name}` is rendered by no mailer"))
        .collect()
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<_> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(is_backend)
    .collect();

    let mailers = artifacts::collect(root, &modules, &["mailer"]);
    let all_templates: BTreeSet<(String, String)> = modules
        .iter()
        .flat_map(|module| templates(root, module))
        .collect();

    if mailers.is_empty() && all_templates.is_empty() {
        return CheckOutcome::new(CheckId::Mailers, CheckStatus::Skipped, "no mailer found");
    }

    let corpus = Corpus::build(root, &modules);
    let mut errors = Vec::new();
    let mut warnings = orphan_templates(&all_templates, &mailers);

    for mailer in &mailers {
        inspect(mailer, &all_templates, &corpus, &mut errors, &mut warnings);
    }

    let scope = format!(
        "{} mailer{} · {} template{}",
        mailers.len(),
        if mailers.len() == 1 { "" } else { "s" },
        all_templates.len(),
        if all_templates.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Mailers,
        &scope,
        "every mailer renders its template",
        errors,
        warnings,
    )
    .with_hint("Scaffold with `talos mailer:create`, which writes both halves at once")
}
