//! Queues check — whether a job can be added, processed and, when it fails,
//! noticed.
//!
//! A queue is a name shared between a producer and a worker. Two classes taking
//! the same name quietly split the same stream of jobs between two different
//! handlers, and a worker with no failure hook drops a job after its last retry
//! with nothing written anywhere. Both are invisible right up to the day the
//! job matters.

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::artifacts::{self, Artifact, Corpus, is_backend};
use super::modules::{discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

fn name_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // The generated class holds the queue's name in a field, which is what
        // both the `BullQueue` and the `Worker` are constructed with.
        Regex::new(r#"(?m)^\s*(?:private|protected|public)?\s*(?:readonly\s+)?name\s*(?::[^=]+)?=\s*["'`]([^"'`]+)["'`]"#)
            .expect("the queue name pattern is valid")
    })
}

/// One queue class, reduced to what makes it work.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QueueDefinition {
    pub class: String,
    /// The name the producer and the worker share.
    pub name: Option<String>,
    pub handles: bool,
    /// Whether the class implements the hook that runs when a job gives up.
    pub reports_failures: bool,
    pub file: String,
}

/// Read a queue class.
pub fn parse(queue: &Artifact) -> QueueDefinition {
    QueueDefinition {
        class: queue.class.clone(),
        name: name_pattern()
            .captures(&queue.content)
            .and_then(|captured| captured.get(1))
            .map(|group| group.as_str().to_string()),
        handles: artifacts::method_body(&queue.content, "handler")
            .map(|body| !artifacts::is_empty_body(body))
            .unwrap_or(false),
        reports_failures: artifacts::method_body(&queue.content, "onFailed")
            .map(|body| !artifacts::is_empty_body(body))
            .unwrap_or(false),
        file: queue.file.clone(),
    }
}

/// Everything about a set of queues that reads like an oversight.
pub fn inspect(queues: &[QueueDefinition], errors: &mut Vec<String>, warnings: &mut Vec<String>) {
    let mut names: BTreeMap<&str, &str> = BTreeMap::new();

    for queue in queues {
        let file = &queue.file;

        match queue.name.as_deref() {
            None => errors.push(format!(
                "{file}: `{}` names no queue — the worker cannot bind to one",
                queue.class
            )),
            Some(name) => match names.get(name) {
                Some(owner) => errors.push(format!(
                    "{file}: the queue \"{name}\" is already served by {owner} — jobs will split between them"
                )),
                None => {
                    names.insert(name, file);
                }
            },
        }

        if !queue.handles {
            warnings.push(format!(
                "{file}: `{}`.handler still returns the job untouched",
                queue.class
            ));
        }
        if !queue.reports_failures {
            warnings.push(format!(
                "{file}: `{}` has no onFailed — an exhausted job disappears silently",
                queue.class
            ));
        }
    }
}

/// Queues nothing ever adds a job to.
pub fn unused(queues: &[Artifact], corpus: &Corpus, registries: &[String]) -> Vec<String> {
    let ignored: Vec<&str> = registries.iter().map(String::as_str).collect();

    queues
        .iter()
        .filter(|queue| {
            let mut ignored = ignored.clone();
            ignored.push(queue.file.as_str());
            !corpus.mentioned_outside(&queue.class, &ignored)
        })
        .map(|queue| {
            format!(
                "{}: nothing enqueues to `{}` — the worker idles forever",
                queue.file, queue.class
            )
        })
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

    let queues = artifacts::collect(root, &modules, &["queue"]);
    if queues.is_empty() {
        return CheckOutcome::new(CheckId::Queues, CheckStatus::Skipped, "no queue found");
    }

    let corpus = Corpus::build(root, &modules);
    let registries: Vec<String> = modules
        .iter()
        .map(|module| artifacts::registry_label(root, module))
        .collect();

    let definitions: Vec<QueueDefinition> = queues.iter().map(parse).collect();
    let mut errors = Vec::new();
    let mut warnings = unused(&queues, &corpus, &registries);
    inspect(&definitions, &mut errors, &mut warnings);

    let scope = format!(
        "{} queue{}",
        queues.len(),
        if queues.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Queues,
        &scope,
        "every queue is named, served and monitored",
        errors,
        warnings,
    )
    .with_hint("Scaffold with `talos queue:create`, which wires the worker and its hooks")
}
