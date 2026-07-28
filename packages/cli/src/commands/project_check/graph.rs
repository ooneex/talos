//! The import graph shared by the checks that reason about how files reference
//! each other.
//!
//! Three checks need the same expensive thing: every TypeScript file in the
//! workspace, the specifiers it imports, and the file each specifier resolves
//! to. `imports` walks it to find cycles and layering violations, `orphans`
//! walks it backwards to find what nothing reaches, and `registration` uses it
//! to tell a class that is wired into a module from one that only looks like it
//! is. Building it once here keeps the rules small and testable.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use regex::Regex;
use serde_json::Value;

use super::modules::{
    TS_EXTENSIONS, WorkspaceModule, collect_files, read_json, relative as relative_path,
};

/// How deep a module's `src/` is walked. Deeper than any generated layout.
const MAX_SOURCE_DEPTH: usize = 10;

/// Extensions a specifier can resolve to, in resolution order.
const RESOLVED_EXTENSIONS: [&str; 6] = ["ts", "tsx", "mts", "cts", "js", "jsx"];

/// Extensions a bundler loads as an asset rather than as a module. They are
/// real imports — `import dict from "./translations.json"` is how a dictionary
/// is loaded — but they resolve to a file no source index holds.
const ASSET_EXTENSIONS: [&str; 22] = [
    "css", "scss", "sass", "less", "json", "yml", "yaml", "svg", "png", "jpg", "jpeg", "webp",
    "avif", "woff", "woff2", "ttf", "txt", "md", "html", "sql", "graphql", "wasm",
];

/// The architectural layer a file belongs to, read from the folder it lives in
/// under `src/`. The generators put every artifact in its own folder, so the
/// folder *is* the layer.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Layer {
    Controller,
    Service,
    Repository,
    Entity,
    Migration,
    Seed,
    Middleware,
    Command,
    Cron,
    Event,
    Queue,
    Workflow,
    Route,
    Feature,
    Component,
    Other,
}

impl Layer {
    /// The folder under `src/` a layer is generated into.
    pub fn from_dir(dir: &str) -> Self {
        match dir {
            "controllers" => Layer::Controller,
            "services" => Layer::Service,
            "repositories" => Layer::Repository,
            "entities" => Layer::Entity,
            "migrations" => Layer::Migration,
            "seeds" => Layer::Seed,
            "middlewares" => Layer::Middleware,
            "commands" => Layer::Command,
            "crons" | "cron-jobs" | "cronJobs" => Layer::Cron,
            "events" => Layer::Event,
            "queues" => Layer::Queue,
            "workflows" => Layer::Workflow,
            "routes" => Layer::Route,
            "features" => Layer::Feature,
            "components" => Layer::Component,
            _ => Layer::Other,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Layer::Controller => "controller",
            Layer::Service => "service",
            Layer::Repository => "repository",
            Layer::Entity => "entity",
            Layer::Migration => "migration",
            Layer::Seed => "seed",
            Layer::Middleware => "middleware",
            Layer::Command => "command",
            Layer::Cron => "cron job",
            Layer::Event => "event",
            Layer::Queue => "queue",
            Layer::Workflow => "workflow",
            Layer::Route => "route",
            Layer::Feature => "feature",
            Layer::Component => "component",
            Layer::Other => "file",
        }
    }
}

/// One import statement, resolved as far as it can be.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Import {
    /// The specifier exactly as written.
    pub specifier: String,
    /// The file it resolves to, when it points inside the workspace.
    pub resolved: Option<PathBuf>,
    /// The workspace module it reaches, when the specifier crosses a boundary.
    pub module: Option<String>,
    /// The names it pulls in, empty for a side-effect or namespace import.
    pub names: BTreeSet<String>,
    /// Whether the whole statement is `import type` / `export type`, which the
    /// compiler erases — so it loads nothing at runtime.
    pub type_only: bool,
}

impl Import {
    /// Whether the specifier addresses a file rather than a published package.
    pub fn is_local(&self) -> bool {
        self.specifier.starts_with('.') || self.module.is_some()
    }

    /// Whether the specifier loads an asset — a stylesheet, a dictionary, an
    /// icon — which the bundler resolves and the source index does not hold.
    pub fn is_asset(&self) -> bool {
        is_asset(&self.specifier)
    }
}

/// Whether a specifier names a file a bundler loads as an asset.
pub fn is_asset(specifier: &str) -> bool {
    let extension = specifier
        .rsplit('/')
        .next()
        .and_then(|name| name.rsplit_once('.'))
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .unwrap_or_default();
    ASSET_EXTENSIONS.contains(&extension.as_str())
}

/// One indexed TypeScript source file.
#[derive(Clone, Debug)]
pub struct IndexedFile {
    pub path: PathBuf,
    /// Path relative to the project root, which is how it is reported.
    pub label: String,
    /// The module that owns the file.
    pub module: String,
    pub group: String,
    /// The module `type:`, when its manifest declares one.
    pub kind: Option<String>,
    pub layer: Layer,
    pub imports: Vec<Import>,
    /// Names the file exports, `default` included.
    pub exports: BTreeSet<String>,
    /// Whether the file re-exports another one through `export * from`.
    pub reexports: bool,
    pub lines: usize,
}

impl IndexedFile {
    pub fn stem(&self) -> String {
        self.path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or_default()
            .to_string()
    }

    /// A barrel: a file whose only job is to re-export its siblings.
    pub fn is_barrel(&self) -> bool {
        self.reexports || matches!(self.stem().as_str(), "index" | "types")
    }
}

/// Every TypeScript source file of the selected modules, with its imports
/// resolved against the workspace path aliases.
#[derive(Clone, Debug, Default)]
pub struct SourceIndex {
    pub files: Vec<IndexedFile>,
    /// Path alias prefix → the directory it maps to, read from the root
    /// `tsconfig.json`.
    pub aliases: BTreeMap<String, PathBuf>,
}

impl SourceIndex {
    /// Build the index for `modules`, reading every source file once.
    pub fn build(root: &Path, modules: &[WorkspaceModule]) -> Self {
        let aliases = read_aliases(root);
        let mut files = Vec::new();

        for module in modules {
            let src = module.dir.join("src");
            for path in collect_files(&src, TS_EXTENSIONS, MAX_SOURCE_DEPTH) {
                let Ok(content) = fs::read_to_string(&path) else {
                    continue;
                };
                files.push(IndexedFile {
                    label: relative_path(root, &path),
                    module: module.name.clone(),
                    group: module.group.clone(),
                    kind: module.kind.clone(),
                    layer: layer_of(&src, &path),
                    // Specifiers are pointed at their file in a second pass,
                    // once every file the index knows about has been read.
                    imports: parse_imports(&content),
                    exports: exported_names(&content),
                    reexports: content.contains("export *"),
                    lines: content.lines().count(),
                    path,
                });
            }
        }

        let mut index = Self { files, aliases };
        index.resolve(root);
        index
    }

    /// Point every local import at the file it loads.
    fn resolve(&mut self, root: &Path) {
        let known: BTreeSet<PathBuf> = self.files.iter().map(|file| file.path.clone()).collect();
        let aliases = self.aliases.clone();

        for index in 0..self.files.len() {
            let dir = self.files[index]
                .path
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| root.to_path_buf());

            for import in &mut self.files[index].imports {
                let base = if import.specifier.starts_with('.') {
                    Some(dir.join(&import.specifier))
                } else {
                    expand_alias(&aliases, &import.specifier)
                };
                let Some(base) = base else {
                    continue;
                };
                let base = normalize(&base);
                import.resolved = resolve_file(&base, &known);
                import.module = module_of(root, import.resolved.as_deref().unwrap_or(&base));
            }
        }
    }

    pub fn file(&self, path: &Path) -> Option<&IndexedFile> {
        self.files.iter().find(|file| file.path == path)
    }

    /// Files owned by one module.
    pub fn module_files(&self, module: &str) -> impl Iterator<Item = &IndexedFile> {
        self.files.iter().filter(move |file| file.module == module)
    }
}

/// The `@module/<name>/*` style aliases declared by the root `tsconfig.json`.
pub fn read_aliases(root: &Path) -> BTreeMap<String, PathBuf> {
    let Some(paths) = read_json(&root.join("tsconfig.json"))
        .as_ref()
        .and_then(|tsconfig| tsconfig.pointer("/compilerOptions/paths").cloned())
    else {
        return BTreeMap::new();
    };
    let Some(entries) = paths.as_object() else {
        return BTreeMap::new();
    };

    entries
        .iter()
        .filter_map(|(alias, targets)| {
            let target = targets.as_array()?.iter().find_map(Value::as_str)?;
            let prefix = alias.trim_end_matches('*').to_string();
            let directory = target.trim_start_matches("./").trim_end_matches('*');
            Some((prefix, root.join(directory)))
        })
        .collect()
}

/// Rewrite an aliased specifier into the path it addresses.
pub fn expand_alias(aliases: &BTreeMap<String, PathBuf>, specifier: &str) -> Option<PathBuf> {
    // The longest prefix wins, so `@module/user/` beats a bare `@/`.
    aliases
        .iter()
        .filter(|(prefix, _)| specifier.starts_with(prefix.as_str()))
        .max_by_key(|(prefix, _)| prefix.len())
        .map(|(prefix, directory)| directory.join(&specifier[prefix.len()..]))
}

/// Resolve `.` and `..` away without touching the filesystem, so a specifier
/// written as `./../routes/index` matches the indexed `routes/index.tsx`. It is
/// done lexically on purpose: `canonicalize` would fail on the paths that do
/// not exist, which are exactly the ones worth reporting.
pub fn normalize(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                // A `..` that cannot climb any further is kept, so the path
                // stays wrong rather than silently becoming a different one.
                if !normalized.pop() {
                    normalized.push("..");
                }
            }
            other => normalized.push(other),
        }
    }

    normalized
}

/// The file a resolved path loads: the path itself, the same path with a
/// TypeScript extension, or the directory's index.
pub fn resolve_file(base: &Path, known: &BTreeSet<PathBuf>) -> Option<PathBuf> {
    if known.contains(base) {
        return Some(base.to_path_buf());
    }
    // `allowImportingTsExtensions` lets a specifier carry `.ts` already.
    for extension in RESOLVED_EXTENSIONS {
        let candidate = with_extension(base, extension);
        if known.contains(&candidate) {
            return Some(candidate);
        }
    }
    for extension in RESOLVED_EXTENSIONS {
        let candidate = base.join(format!("index.{extension}"));
        if known.contains(&candidate) {
            return Some(candidate);
        }
    }
    None
}

/// Append an extension without eating an existing one: `Button.stories` keeps
/// its suffix and becomes `Button.stories.tsx`.
fn with_extension(base: &Path, extension: &str) -> PathBuf {
    let Some(name) = base.file_name().and_then(|name| name.to_str()) else {
        return base.to_path_buf();
    };
    base.with_file_name(format!("{name}.{extension}"))
}

/// Whether the path lands inside a workspace module, and which one.
pub fn module_of(root: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let mut segments = relative.components();
    let group = segments.next()?.as_os_str().to_str()?;
    if group != "modules" && group != "packages" {
        return None;
    }
    Some(segments.next()?.as_os_str().to_str()?.to_string())
}

/// The layer of a file, read from the first folder under the module's `src/`.
pub fn layer_of(src: &Path, path: &Path) -> Layer {
    path.strip_prefix(src)
        .ok()
        .and_then(|relative| relative.components().next())
        .and_then(|segment| segment.as_os_str().to_str())
        // A file sitting directly in `src/` has no folder and no layer.
        .filter(|segment| !segment.ends_with(".ts") && !segment.ends_with(".tsx"))
        .map(Layer::from_dir)
        .unwrap_or(Layer::Other)
}

fn import_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // The clause before `from` is captured so the imported names can be
        // read out of it; a bare `import "./x"` has none.
        Regex::new(
            r#"(?m)^\s*import\s+(?:(type\s+)?([^"';]*?)\s+from\s+)?["']([^"'\n]+)["']|(?:\brequire\s*\(|\bimport\s*\()\s*["']([^"'\n]+)["']"#,
        )
        .expect("the import pattern is valid")
    })
}

fn reexport_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // `export * from "./x"` and `export { A } from "./x"` load `./x` just
        // as an import does — which is exactly how every barrel reaches the
        // files it publishes.
        Regex::new(r#"(?m)^\s*export\s+(type\s+)?(\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*["']([^"'\n]+)["']"#)
            .expect("the re-export pattern is valid")
    })
}

fn export_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(
            r"(?m)^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z0-9_$]+)",
        )
        .expect("the export pattern is valid")
    })
}

fn export_list_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"(?m)^\s*export\s+(?:type\s+)?\{([^}]*)\}").expect("the export list is valid")
    })
}

/// Every import of a file, with the names each one pulls in.
pub fn parse_imports(content: &str) -> Vec<Import> {
    let mut imports = Vec::new();

    for captured in import_pattern().captures_iter(content) {
        let specifier = captured
            .get(3)
            .or_else(|| captured.get(4))
            .map(|group| group.as_str().trim().to_string())
            .unwrap_or_default();
        if specifier.is_empty() {
            continue;
        }
        let names = captured
            .get(2)
            .map(|group| imported_names(group.as_str()))
            .unwrap_or_default();
        imports.push(Import {
            specifier,
            resolved: None,
            module: None,
            names,
            type_only: captured.get(1).is_some(),
        });
    }

    for captured in reexport_pattern().captures_iter(content) {
        let (Some(clause), Some(specifier)) = (captured.get(2), captured.get(3)) else {
            continue;
        };
        imports.push(Import {
            specifier: specifier.as_str().trim().to_string(),
            resolved: None,
            module: None,
            names: imported_names(clause.as_str()),
            type_only: captured.get(1).is_some(),
        });
    }

    imports
}

/// The bindings an import clause introduces: `A`, `{ b, c as d }` and
/// `* as ns` all name what the file actually consumes.
pub fn imported_names(clause: &str) -> BTreeSet<String> {
    let mut names = BTreeSet::new();

    let (default_part, named_part) = match clause.find('{') {
        Some(open) => {
            let close = clause[open..].find('}').map(|end| open + end);
            (
                &clause[..open],
                close.map(|close| &clause[open + 1..close]).unwrap_or(""),
            )
        }
        None => (clause, ""),
    };

    for part in default_part.split(',') {
        let part = part.trim().trim_end_matches(',').trim();
        // `* as ns` consumes the whole module rather than a named export.
        if part.is_empty() || part.starts_with('*') || part == "type" {
            continue;
        }
        names.insert(part.to_string());
    }

    for entry in named_part.split(',') {
        // `a as b` imports `a`; the local alias is not the export's name.
        let name = entry
            .trim()
            .trim_start_matches("type ")
            .split(" as ")
            .next()
            .unwrap_or_default()
            .trim();
        if !name.is_empty() {
            names.insert(name.to_string());
        }
    }

    names
}

/// Every name a file exports.
pub fn exported_names(content: &str) -> BTreeSet<String> {
    let mut names: BTreeSet<String> = export_pattern()
        .captures_iter(content)
        .filter_map(|captured| captured.get(1))
        .map(|group| group.as_str().to_string())
        .collect();

    for captured in export_list_pattern().captures_iter(content) {
        let Some(list) = captured.get(1) else {
            continue;
        };
        for entry in list.as_str().split(',') {
            // `a as b` publishes `b`, which is the name importers write.
            let name = entry
                .trim()
                .trim_start_matches("type ")
                .rsplit(" as ")
                .next()
                .unwrap_or_default()
                .trim();
            if !name.is_empty() {
                names.insert(name.to_string());
            }
        }
    }

    if content.contains("export default") {
        names.insert("default".to_string());
    }

    names
}
