//! Folders check — the directory tree a module is allowed to have.
//!
//! Every layer in this codebase is a folder with a name the framework knows:
//! `@decorator.service()` classes live in `services/`, a TanStack route file
//! only becomes a route because it sits under `routes/`, an icon resolves
//! because it is at `icons/<variant>/<category>/<size>/`. The generators create
//! those folders and nothing else, which means any other folder was invented by
//! hand — `helpers/`, `lib/`, `common/`, `shared/` inside a backend module,
//! `src/components/` in an api. None of them fail a build. They just move code
//! somewhere the conventions do not reach, where the next generator will not
//! find it and the next reader will not look.
//!
//! The rule is deliberately absolute: at every level the layout names, only the
//! folders it names may exist. Below a leaf — inside `controllers/`, inside a
//! design component, inside a feature's `components/` — grouping is free,
//! because organising files of one kind is not inventing a kind.

use std::fs;
use std::path::Path;

use super::modules::{WorkspaceModule, discover_modules, filter_modules, relative, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, EXCLUDED_DIRS, ProjectCheckArgs, static_outcome,
};

/// How deep the walk goes. Deeper than any documented layout, so a folder is
/// reported rather than missed.
const MAX_DEPTH: usize = 12;

/// What a module may hold at its root. `bin/` sits beside `src/` and holds the
/// runnable scripts a module ships — entry points invoked directly rather than
/// bound by the container — and groups them however it likes below.
const MODULE_ROOT: &[&str] = &["src", "bin", "tests", "e2e", "issues"];

/// The same, for a module that ships a browser bundle.
const FRONTEND_ROOT: &[&str] = &["public", "src", "bin", "tests", "e2e", "issues"];

/// The artifact folders of a backend module — one per kind the container
/// binds, plus `exceptions/` and `types/`, which hold plain classes and type
/// definitions rather than DI-bound artifacts.
const BACKEND_SRC: &[&str] = &[
    "ai",
    "analytics",
    "cache",
    "commands",
    "constraints",
    "controllers",
    "crons",
    "databases",
    "entities",
    "events",
    "exceptions",
    "flags",
    "loggers",
    "mailers",
    "middlewares",
    "migrations",
    "permissions",
    "queues",
    "rate-limit",
    "repositories",
    "seeds",
    "services",
    "storage",
    "translations",
    "types",
    "utils",
    "workflows",
];

/// The three kinds of AI artifact, each with its own generator.
const AI_SRC: &[&str] = &["chats", "middlewares", "tools"];

/// A workflow's only subfolder: the steps it runs.
const WORKFLOW_SRC: &[&str] = &["transitions"];

/// A design system is organised by asset kind.
const DESIGN_SRC: &[&str] = &[
    "components",
    "fonts",
    "hooks",
    "icons",
    "inspirations",
    "styles",
    "translations",
    "utils",
];

/// Icons are grouped by variant, then category, then size.
const ICON_VARIANTS: &[&str] = &["fill", "outline"];
const ICON_SIZES: &[&str] = &["lg", "md", "sm"];

/// The one subfolder a stylesheet folder may hold.
const STYLE_SRC: &[&str] = &["themes"];

/// The four halves of a single-page application.
const SPA_SRC: &[&str] = &["bootstrap", "features", "routes", "shared"];

/// The layers a feature slice — and `shared/`, which has the same shape — may
/// hold.
const FEATURE_LAYERS: &[&str] = &[
    "assets",
    "components",
    "hooks",
    "layouts",
    "services",
    "store",
    "styles",
    "translations",
    "types",
    "utils",
];

/// A storybook's `shared/` is the gallery engine, so it holds `story/` on top
/// of the usual layers.
const STORYBOOK_SHARED: &[&str] = &[
    "assets",
    "components",
    "hooks",
    "layouts",
    "services",
    "store",
    "story",
    "styles",
    "translations",
    "types",
    "utils",
];

/// A swagger's `shared/` is the explorer engine, so it holds `route/` — the
/// route model, the registry, the request runner and the OpenAPI export — on
/// top of the usual layers.
const SWAGGER_SHARED: &[&str] = &[
    "assets",
    "components",
    "hooks",
    "layouts",
    "route",
    "services",
    "store",
    "styles",
    "translations",
    "types",
    "utils",
];

/// Nothing at all: the level holds files and no folder.
const NONE: &[&str] = &[];

/// The layout a module's `type:` puts it under.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Layout {
    /// `module`, `api`, `microservice` — everything the container loads.
    Backend,
    Design,
    /// `spa` and `admin`, which share a runtime and a layout.
    Spa,
    Storybook,
    Swagger,
    Sdk,
}

impl Layout {
    /// The layout a module declares, or `None` when its `type:` is one this
    /// check has no layout for.
    pub fn of(kind: Option<&str>) -> Option<Self> {
        match kind {
            // A module with no manifest type is a backend business domain,
            // which is what `module:create` produces.
            None | Some("module") | Some("api") | Some("microservice") => Some(Layout::Backend),
            Some("design") => Some(Layout::Design),
            Some("spa") | Some("admin") => Some(Layout::Spa),
            Some("storybook") => Some(Layout::Storybook),
            Some("swagger") => Some(Layout::Swagger),
            Some("sdk") => Some(Layout::Sdk),
            _ => None,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Layout::Backend => "backend module",
            Layout::Design => "design module",
            Layout::Spa => "spa module",
            Layout::Storybook => "storybook module",
            Layout::Swagger => "swagger module",
            Layout::Sdk => "sdk module",
        }
    }

    fn root(self) -> &'static [&'static str] {
        match self {
            Layout::Backend | Layout::Sdk => MODULE_ROOT,
            Layout::Design | Layout::Spa | Layout::Storybook | Layout::Swagger => FRONTEND_ROOT,
        }
    }
}

/// What the check has to say about one folder.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verdict {
    /// The folder belongs, and the layout still has something to say about what
    /// is inside it.
    Structural,
    /// The folder belongs, and owns whatever it groups below.
    Free,
    /// The folder does not belong. Carries what may sit at that level, which is
    /// what the report line offers instead.
    Unexpected(&'static [&'static str]),
}

/// Whether one folder of a module belongs where it sits.
///
/// `segments` is the path relative to the module directory. The classification
/// is a table rather than a walk on purpose: every level of every layout is one
/// arm, so what is allowed where can be read off in one pass.
pub fn classify(layout: Layout, segments: &[&str]) -> Verdict {
    // `tests/` mirrors `src/`, so it is classified as the `src/` path it
    // shadows rather than as a layout of its own.
    if segments.first() == Some(&"tests") {
        if segments.len() == 1 {
            return Verdict::Structural;
        }
        let mut mirrored = vec!["src"];
        mirrored.extend_from_slice(&segments[1..]);
        return classify(layout, &mirrored);
    }

    match segments {
        [] => Verdict::Structural,

        [root] => match *root {
            "src" => Verdict::Structural,
            other if layout.root().contains(&other) => Verdict::Free,
            _ => Verdict::Unexpected(layout.root()),
        },

        ["src", rest @ ..] => match layout {
            Layout::Backend => backend(rest),
            Layout::Design => design(rest),
            Layout::Spa => spa(rest, FEATURE_LAYERS),
            Layout::Storybook => storybook(rest, STORYBOOK_SHARED),
            Layout::Swagger => storybook(rest, SWAGGER_SHARED),
            // An SDK is one generated file per source module, side by side.
            Layout::Sdk => Verdict::Unexpected(NONE),
        },

        _ => Verdict::Unexpected(layout.root()),
    }
}

fn backend(segments: &[&str]) -> Verdict {
    match segments {
        // `ai/` and `workflows/` are the only artifact folders that group their
        // own kinds below; the rest hold files.
        ["ai"] | ["workflows"] => Verdict::Structural,
        ["ai", kind] if AI_SRC.contains(kind) => Verdict::Free,
        ["ai", _] => Verdict::Unexpected(AI_SRC),
        ["workflows", kind] if WORKFLOW_SRC.contains(kind) => Verdict::Free,
        ["workflows", _] => Verdict::Unexpected(WORKFLOW_SRC),
        [artifact] if BACKEND_SRC.contains(artifact) => Verdict::Free,
        _ => Verdict::Unexpected(BACKEND_SRC),
    }
}

fn design(segments: &[&str]) -> Verdict {
    match segments {
        ["icons"] | ["styles"] => Verdict::Structural,
        ["icons", variant] if ICON_VARIANTS.contains(variant) => Verdict::Structural,
        ["icons", _] => Verdict::Unexpected(ICON_VARIANTS),
        // The category names the icon set and is the project's to choose.
        ["icons", _, _] => Verdict::Structural,
        ["icons", _, _, size] if ICON_SIZES.contains(size) => Verdict::Free,
        ["icons", _, _, _] => Verdict::Unexpected(ICON_SIZES),
        ["styles", folder] if STYLE_SRC.contains(folder) => Verdict::Free,
        ["styles", _] => Verdict::Unexpected(STYLE_SRC),
        [kind] if DESIGN_SRC.contains(kind) => Verdict::Free,
        _ => Verdict::Unexpected(DESIGN_SRC),
    }
}

fn spa(segments: &[&str], shared_layers: &'static [&'static str]) -> Verdict {
    match segments {
        // The entry point is three files and no folder, so the walk descends
        // into it only to say so.
        ["features"] | ["shared"] | ["bootstrap"] => Verdict::Structural,
        ["bootstrap", ..] => Verdict::Unexpected(NONE),
        // File-based routing: the folders under `routes/` are URL segments.
        ["routes", ..] => Verdict::Free,
        // The feature name is the domain's, so only its layers are checked.
        ["features", _] => Verdict::Structural,
        ["features", _, layer] if FEATURE_LAYERS.contains(layer) => Verdict::Free,
        ["features", _, _] => Verdict::Unexpected(FEATURE_LAYERS),
        ["shared", layer] if shared_layers.contains(layer) => Verdict::Free,
        ["shared", _] => Verdict::Unexpected(shared_layers),
        [half] if SPA_SRC.contains(half) => Verdict::Free,
        _ => Verdict::Unexpected(SPA_SRC),
    }
}

/// The layout a storybook and a swagger share: a feature is a flat folder of
/// declaration files — stories for one component, routes for one module — and
/// the engine lives in `shared/`.
fn storybook(segments: &[&str], shared_layers: &'static [&'static str]) -> Verdict {
    match segments {
        ["features", _, ..] => Verdict::Free,
        rest => spa(rest, shared_layers),
    }
}

/// Whether a whole path is allowed, applying `classify` one level at a time the
/// way the walk does.
///
/// The distinction matters: `classify` answers for one level, and the first
/// `Free` it returns ends the question — everything below a leaf belongs to
/// whatever is grouping there.
pub fn accepts(layout: Layout, segments: &[&str]) -> bool {
    for depth in 1..=segments.len() {
        match classify(layout, &segments[..depth]) {
            Verdict::Free => return true,
            Verdict::Structural => {}
            Verdict::Unexpected(_) => return false,
        }
    }
    true
}

/// How a rejected folder is reported.
fn rejection(module: &str, path: &str, layout: Layout, allowed: &[&str]) -> String {
    let level = path
        .rsplit_once('/')
        .map(|(parent, _)| parent.to_string())
        .unwrap_or_else(|| module.to_string());

    if allowed.is_empty() {
        return format!("{path}: {level} holds no folder in a {}", layout.label());
    }
    format!(
        "{path}: not part of a {} — {level} holds only {}",
        layout.label(),
        allowed.join(", ")
    )
}

/// Every folder of one module that does not belong.
///
/// A rejected folder is reported once and not descended into: what a hand-made
/// `src/lib/` holds inside is not a second finding, it is the same one.
pub fn inspect(root: &Path, module: &WorkspaceModule, layout: Layout) -> (Vec<String>, usize) {
    let mut errors = Vec::new();
    let mut counted = 0;
    walk(
        root,
        module,
        layout,
        &module.dir,
        &mut Vec::new(),
        0,
        &mut errors,
        &mut counted,
    );
    errors.sort();
    (errors, counted)
}

#[allow(clippy::too_many_arguments)]
fn walk(
    root: &Path,
    module: &WorkspaceModule,
    layout: Layout,
    dir: &Path,
    segments: &mut Vec<String>,
    depth: usize,
    errors: &mut Vec<String>,
    counted: &mut usize,
) {
    if depth > MAX_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| entry.file_name().to_str().map(str::to_string))
        // Dependencies, build output and tooling caches are nobody's layout.
        .filter(|name| !name.starts_with('.') && !EXCLUDED_DIRS.contains(&name.as_str()))
        .collect();
    names.sort();

    for name in names {
        segments.push(name);
        let borrowed: Vec<&str> = segments.iter().map(String::as_str).collect();
        *counted += 1;

        match classify(layout, &borrowed) {
            Verdict::Free => {}
            Verdict::Structural => {
                let child = dir.join(segments.last().expect("a segment was just pushed"));
                walk(
                    root,
                    module,
                    layout,
                    &child,
                    segments,
                    depth + 1,
                    errors,
                    counted,
                );
            }
            Verdict::Unexpected(allowed) => {
                let path = relative(root, &dir.join(segments.last().expect("just pushed")));
                errors.push(rejection(&module.label(), &path, layout, allowed));
            }
        }

        segments.pop();
    }
}

/// The layout a workspace member is held to.
///
/// Under `modules/` every member is one, and a member with no `type:` is the
/// backend module `module:create` produces. Under `packages/` only a member
/// that declares a type is: a package without a manifest is a plain library,
/// and its layout is its own business.
pub fn layout_for(module: &WorkspaceModule) -> Option<Layout> {
    match (module.group.as_str(), module.kind.as_deref()) {
        ("modules", kind) => Layout::of(kind),
        (_, Some(kind)) => Layout::of(Some(kind)),
        _ => None,
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );

    let mut errors = Vec::new();
    let mut folders = 0;
    let mut checked = 0;

    for module in &modules {
        let Some(layout) = layout_for(module) else {
            continue;
        };
        checked += 1;
        let (found, counted) = inspect(root, module, layout);
        errors.extend(found);
        folders += counted;
    }

    if checked == 0 {
        return CheckOutcome::new(
            CheckId::Folders,
            CheckStatus::Skipped,
            "no module declaring a layout",
        );
    }

    let scope = format!(
        "{checked} module{} · {folders} folder{}",
        if checked == 1 { "" } else { "s" },
        if folders == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Folders,
        &scope,
        "every folder is part of its module's layout",
        errors,
        Vec::new(),
    )
    .with_hint(
        "Move the code into the layer that owns it — the generators create every folder there is",
    )
}
