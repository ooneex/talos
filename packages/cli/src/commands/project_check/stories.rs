// Stories check — the design system against the gallery that documents it.
//
// A storybook module is how a component is reviewed, shared and kept honest.
// A component with no story is invisible to everyone who is not reading the
// source, and a story left behind by a deleted or renamed component breaks the
// gallery for every other component in its group.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use super::graph::SourceIndex;
use super::modules::{
    TS_EXTENSIONS, WorkspaceModule, collect_files, discover_modules, filter_modules, relative,
    wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// The suffix a story file carries.
const STORY_SUFFIX: &str = ".stories";

/// The folder of a design module whose exports are worth a story. Icons are
/// deliberately left out: they are documented as a gallery, and a story per
/// icon would bury every component the gallery exists to show.
const DOCUMENTED_DIRS: [&str; 1] = ["components"];

/// A component a design module publishes.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Component {
    pub name: String,
    pub module: String,
    pub file: String,
}

/// Whether a file is a story.
pub fn is_story(path: &Path) -> bool {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .is_some_and(|stem| stem.ends_with(STORY_SUFFIX))
}

/// The component a story documents, read from its file name.
pub fn documented(path: &Path) -> Option<String> {
    let stem = path.file_stem()?.to_str()?;
    Some(stem.strip_suffix(STORY_SUFFIX)?.to_string())
}

/// Every component a design module publishes.
///
/// Only a name that looks like a component counts: a design module's folders
/// also hold hooks, variants and helper types, and none of those belong in the
/// gallery.
pub fn components(index: &SourceIndex, module: &WorkspaceModule) -> Vec<Component> {
    let mut found = Vec::new();

    for file in index.module_files(&module.name) {
        let inside = DOCUMENTED_DIRS
            .iter()
            .any(|dir| file.label.contains(&format!("/src/{dir}/")));
        if !inside || file.is_barrel() {
            continue;
        }
        for name in &file.exports {
            if !is_component_name(name) {
                continue;
            }
            found.push(Component {
                name: name.clone(),
                module: module.name.clone(),
                file: file.label.clone(),
            });
        }
    }

    found.sort();
    found.dedup();
    found
}

/// `Button` and `AvatarGroup` are components; `buttonVariants`, `ButtonProps`
/// and `useButton` are not.
pub fn is_component_name(name: &str) -> bool {
    name.starts_with(|character: char| character.is_ascii_uppercase())
        && !name.ends_with("Props")
        && !name.ends_with("Type")
        && !name.ends_with("Context")
        && !name.ends_with("Provider")
        && !name.ends_with("Variants")
}

/// The design modules a storybook previews, read from the aliases its stories
/// import through.
pub fn previewed(index: &SourceIndex, storybook: &str) -> BTreeSet<String> {
    index
        .module_files(storybook)
        .filter(|file| is_story(&file.path))
        .flat_map(|file| file.imports.iter())
        .filter_map(|import| import.module.clone())
        .filter(|module| module != storybook)
        .collect()
}

/// The names a storybook's stories import out of the modules they preview.
///
/// Coverage is read from the imports rather than from the file names, because a
/// compound component is documented by a main story plus one story per part:
/// `Typography.stories.tsx` names a group, not an export.
pub fn told(index: &SourceIndex, storybook: &str, sources: &BTreeSet<String>) -> BTreeSet<String> {
    index
        .module_files(storybook)
        .filter(|file| is_story(&file.path))
        .flat_map(|file| file.imports.iter())
        .filter(|import| {
            import
                .module
                .as_ref()
                .is_some_and(|module| sources.contains(module))
        })
        .flat_map(|import| import.names.iter().cloned())
        .collect()
}

/// Whether a component is covered by the stories that exist.
///
/// A compound component is documented as a whole: `AccordionItem`,
/// `AccordionTrigger` and `AccordionContent` are all shown by the `Accordion`
/// story, and only ever make sense inside it. So a part counts as documented
/// once the component it is part of has a story.
pub fn is_documented(name: &str, told: &BTreeSet<String>) -> bool {
    told.iter()
        .any(|documented| name == documented || name.starts_with(documented.as_str()))
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let all = discover_modules(root);
    let selected = filter_modules(
        all.clone(),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );

    let storybooks: Vec<&WorkspaceModule> = selected
        .iter()
        .filter(|module| module.kind.as_deref() == Some("storybook"))
        .collect();

    if storybooks.is_empty() {
        return CheckOutcome::new(
            CheckId::Stories,
            CheckStatus::Skipped,
            "no storybook module found",
        );
    }

    // The design modules are indexed too, even when the run is filtered down to
    // one storybook: without them there is nothing to compare the stories to.
    let index = SourceIndex::build(root, &all);

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut counted = 0;
    let mut documented_names = 0;

    for storybook in storybooks {
        let (stories, documented) =
            check_storybook(root, &index, &all, storybook, &mut errors, &mut warnings);
        counted += stories;
        documented_names += documented;
    }

    if counted == 0 && documented_names == 0 {
        return CheckOutcome::new(
            CheckId::Stories,
            CheckStatus::Skipped,
            "no story and no design component found",
        );
    }

    let scope = format!(
        "{counted} stor{} · {documented_names} component{}",
        if counted == 1 { "y" } else { "ies" },
        if documented_names == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Stories,
        &scope,
        "every component is documented",
        errors,
        warnings,
    )
    .with_hint("Write the missing ones with the `storybook-story-create` skill")
}

/// Checks one storybook module's stories against the design modules it
/// previews. Returns the number of stories found and the number of
/// published components considered documented-or-not.
fn check_storybook(
    root: &Path,
    index: &SourceIndex,
    all: &[WorkspaceModule],
    storybook: &WorkspaceModule,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> (usize, usize) {
    let label = storybook.label();
    let stories: Vec<_> = collect_files(&storybook.dir.join("src"), TS_EXTENSIONS, 8)
        .into_iter()
        .filter(|path| is_story(path))
        .collect();
    let story_count = stories.len();

    let sources: Vec<&WorkspaceModule> = previewed(index, &storybook.name)
        .into_iter()
        .filter_map(|name| all.iter().find(|module| module.name == name))
        .filter(|module| module.kind.as_deref() == Some("design"))
        .collect();
    let names: BTreeSet<String> = sources.iter().map(|module| module.name.clone()).collect();

    if sources.is_empty() {
        warnings.push(format!(
            "{label}: no story imports a design module — the gallery documents nothing"
        ));
        return (story_count, 0);
    }

    let published: BTreeMap<String, Component> = sources
        .iter()
        .flat_map(|module| components(index, module))
        .map(|component| (component.name.clone(), component))
        .collect();
    let documented_count = published.len();

    let told = told(index, &storybook.name, &names);

    for path in &stories {
        check_story_file(root, index, path, &names, errors);
    }

    for (name, component) in &published {
        if !is_documented(name, &told) {
            warnings.push(format!(
                "{label}: `{name}` ({}) has no story",
                component.file
            ));
        }
    }

    (story_count, documented_count)
}

/// Checks a single story file: it must export a `meta` and import from the
/// design module it documents.
fn check_story_file(
    root: &Path,
    index: &SourceIndex,
    path: &Path,
    names: &BTreeSet<String>,
    errors: &mut Vec<String>,
) {
    let file = relative(root, path);
    let Ok(content) = fs::read_to_string(path) else {
        return;
    };
    // The gallery reads `meta` to build the sidebar entry, the controls
    // and the usage text; a story without one renders as an empty page.
    if !content.contains("export const meta") {
        errors.push(format!("{file}: the story exports no `meta`"));
    }
    if let Some(file_index) = index.file(path)
        && !file_index.imports.iter().any(|import| {
            import
                .module
                .as_ref()
                .is_some_and(|module| names.contains(module))
        })
    {
        errors.push(format!(
            "{file}: the story imports nothing from the design module it documents"
        ));
    }
}
