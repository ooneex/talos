//! Events check — the two halves of a publish/subscribe pair.
//!
//! An event is only a channel name and a handler, and nothing ties the two ends
//! together at compile time. Two classes can claim the same channel, in which
//! case both handlers fire on every message. A class can subscribe to a channel
//! nothing ever publishes to, in which case the handler is dead code that looks
//! alive. Neither shows up until production traffic does.

use std::collections::BTreeMap;
use std::path::Path;

use super::artifacts::{self, Artifact, Corpus, is_backend};
use super::modules::{discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// One event class, reduced to the channel it binds to.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Subscription {
    pub class: String,
    pub channel: Option<String>,
    /// Whether `handler` does anything beyond the generated placeholder.
    pub handles: bool,
    pub file: String,
}

/// Read an event class.
pub fn parse(event: &Artifact) -> Subscription {
    Subscription {
        class: event.class.clone(),
        channel: artifacts::returned_string(&event.content, "getChannel"),
        handles: artifacts::method_body(&event.content, "handler")
            .map(|body| !artifacts::is_empty_body(body))
            .unwrap_or(false),
        file: event.file.clone(),
    }
}

/// Channels claimed twice, and handlers that never do anything.
pub fn inspect(
    subscriptions: &[Subscription],
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let mut channels: BTreeMap<&str, &str> = BTreeMap::new();

    for subscription in subscriptions {
        let file = &subscription.file;

        let Some(channel) = subscription.channel.as_deref() else {
            errors.push(format!(
                "{file}: `{}` declares no channel in getChannel()",
                subscription.class
            ));
            continue;
        };

        if channel.is_empty() {
            errors.push(format!(
                "{file}: `{}` subscribes to an empty channel",
                subscription.class
            ));
            continue;
        }

        match channels.get(channel) {
            Some(owner) => errors.push(format!(
                "{file}: the channel \"{channel}\" is already claimed by {owner} — both handlers will fire"
            )),
            None => {
                channels.insert(channel, file);
            }
        }

        if !subscription.handles {
            warnings.push(format!(
                "{file}: `{}` subscribes to \"{channel}\" and its handler does nothing",
                subscription.class
            ));
        }
    }
}

/// Events nothing in the workspace publishes to.
///
/// Publishing goes through the class — it is injected and `publish` is called
/// on it — so a class no other file so much as names has no producer. The
/// module registry is ignored on purpose: being listed there is what subscribes
/// the handler, not what feeds it.
pub fn unpublished(events: &[Artifact], corpus: &Corpus, registries: &[String]) -> Vec<String> {
    let ignored: Vec<&str> = registries.iter().map(String::as_str).collect();

    events
        .iter()
        .filter(|event| {
            let mut ignored = ignored.clone();
            ignored.push(event.file.as_str());
            !corpus.mentioned_outside(&event.class, &ignored)
        })
        .map(|event| {
            format!(
                "{}: nothing publishes to `{}` — the handler never runs",
                event.file, event.class
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

    let events = artifacts::collect(root, &modules, &["event"]);
    if events.is_empty() {
        return CheckOutcome::new(CheckId::Events, CheckStatus::Skipped, "no event found");
    }

    let corpus = Corpus::build(root, &modules);
    let registries: Vec<String> = modules
        .iter()
        .map(|module| artifacts::registry_label(root, module))
        .collect();

    let subscriptions: Vec<Subscription> = events.iter().map(parse).collect();
    let mut errors = Vec::new();
    let mut warnings = unpublished(&events, &corpus, &registries);
    inspect(&subscriptions, &mut errors, &mut warnings);

    let scope = format!(
        "{} event{}",
        events.len(),
        if events.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Events,
        &scope,
        "every channel has one subscriber and a producer",
        errors,
        warnings,
    )
    .with_hint("Scaffold with `talos event:create --channel=<name>`")
}
