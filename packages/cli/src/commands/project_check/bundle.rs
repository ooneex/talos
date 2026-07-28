//! Bundle check — what the front-end modules actually ship.
//!
//! Nothing in a build fails because it produced a four-megabyte chunk, an image
//! straight off a designer's desktop, or a source map that hands the whole
//! codebase to anyone who opens dev tools. The numbers only exist in `dist/`,
//! which is why they are read from there rather than guessed at from the source.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use super::modules::{
    TS_EXTENSIONS, WorkspaceModule, collect_files, discover_modules, filter_modules, relative,
    wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Module types that build a browser bundle.
const BUNDLED_TYPES: [&str; 4] = ["spa", "admin", "storybook", "design"];

/// Total a module's build output may weigh.
const MAX_BUNDLE_BYTES: u64 = 5 * 1024 * 1024;

/// Weight of a single script a browser has to parse before it can render.
const MAX_CHUNK_BYTES: u64 = 1024 * 1024;

/// Weight of an image that has clearly never been through an optimiser.
const MAX_IMAGE_BYTES: u64 = 500 * 1024;

/// Extensions treated as an image asset.
const IMAGE_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "gif", "bmp", "tiff"];

/// One file inside a build.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Asset {
    pub path: PathBuf,
    pub bytes: u64,
}

/// Every file in a directory tree, with its size. `dist/` is walked directly
/// rather than through the shared helper: the point is to see the large files
/// the helper is built to skip.
pub fn assets(dir: &Path) -> Vec<Asset> {
    let mut assets = Vec::new();
    walk(dir, &mut assets);
    assets.sort_by_key(|asset| std::cmp::Reverse(asset.bytes));
    assets
}

fn walk(dir: &Path, assets: &mut Vec<Asset>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk(&path, assets);
            continue;
        }
        let bytes = entry.metadata().map(|meta| meta.len()).unwrap_or(0);
        assets.push(Asset { path, bytes });
    }
}

/// Human-readable size, matching the git check's rendering.
pub fn human_size(bytes: u64) -> String {
    if bytes >= 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{} KB", bytes / 1024)
    }
}

fn extension(path: &Path) -> String {
    path.extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

/// The newest modification time in a tree, which is when it was last built or
/// last edited.
pub fn newest(dir: &Path) -> Option<SystemTime> {
    assets(dir)
        .iter()
        .filter_map(|asset| fs::metadata(&asset.path).ok()?.modified().ok())
        .max()
}

/// Inspect one module's build output.
pub fn inspect(
    root: &Path,
    module: &WorkspaceModule,
    assets: &[Asset],
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let label = module.label();
    let total: u64 = assets.iter().map(|asset| asset.bytes).sum();

    if total > MAX_BUNDLE_BYTES {
        warnings.push(format!(
            "{label}: the build weighs {}, over the {} budget",
            human_size(total),
            human_size(MAX_BUNDLE_BYTES)
        ));
    }

    for asset in assets {
        let file = relative(root, &asset.path);
        match extension(&asset.path).as_str() {
            // A published source map is the whole codebase, readable, in the
            // browser of anyone who opens the network tab.
            "map" => errors.push(format!(
                "{file}: a source map is shipped in the build output"
            )),
            "js" | "mjs" | "cjs" | "css" if asset.bytes > MAX_CHUNK_BYTES => {
                warnings.push(format!(
                    "{file}: {} in a single chunk — split the route or lazy-load it",
                    human_size(asset.bytes)
                ));
            }
            image if IMAGE_EXTENSIONS.contains(&image) && asset.bytes > MAX_IMAGE_BYTES => {
                warnings.push(format!(
                    "{file}: {} — compress it or serve it as WebP/AVIF",
                    human_size(asset.bytes)
                ));
            }
            _ => {}
        }
    }

    // A build older than the source it came from is what a stale preview and a
    // "works on my machine" deploy are both made of.
    let source = module.dir.join("src");
    if let (Some(built), Some(edited)) = (newest(&module.dir.join("dist")), newest(&source))
        && edited > built
        && !collect_files(&source, TS_EXTENSIONS, 8).is_empty()
    {
        warnings.push(format!(
            "{label}: dist/ is older than src/ — the build does not include the current source"
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
            .is_some_and(|kind| BUNDLED_TYPES.contains(&kind))
    })
    .filter(|module| module.dir.join("dist").is_dir())
    .collect();

    if modules.is_empty() {
        return CheckOutcome::new(
            CheckId::Bundle,
            CheckStatus::Skipped,
            "no built front-end module — run `talos build` first",
        );
    }

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut total = 0;

    for module in &modules {
        let assets = assets(&module.dir.join("dist"));
        total += assets.iter().map(|asset| asset.bytes).sum::<u64>();
        inspect(root, module, &assets, &mut errors, &mut warnings);
    }

    let scope = format!(
        "{} bundle{} · {}",
        modules.len(),
        if modules.len() == 1 { "" } else { "s" },
        human_size(total)
    );

    static_outcome(
        CheckId::Bundle,
        &scope,
        "every bundle is within budget",
        errors,
        warnings,
    )
    .with_hint("The budgets are per build: 5 MB total, 1 MB per chunk, 500 KB per image")
}
