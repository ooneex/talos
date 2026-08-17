//! Assets check — the files a front-end module ships to the browser.
//!
//! Everything under `public/` is copied into the bundle whether or not anything
//! references it, so a logo replaced six months ago is still downloaded by the
//! CDN and still counted in the transfer budget. The opposite problem costs
//! more: an `<img>` with no intrinsic size reserves no space, and the page
//! reflows around it the moment it loads — a layout shift no test catches and
//! every user sees.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::artifacts::{self, is_frontend};
use super::modules::{
    WorkspaceModule, collect_files, discover_modules, filter_modules, relative, wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Extensions that count as a shipped asset.
const ASSET_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "woff", "woff2", "ttf", "otf",
    "eot", "mp4", "webm", "mp3", "wav", "pdf",
];

/// Extensions that can reference one.
const REFERRING_EXTENSIONS: &[&str] = &[
    "ts",
    "tsx",
    "js",
    "jsx",
    "css",
    "scss",
    "html",
    "json",
    "webmanifest",
    "md",
];

/// Assets the platform loads by name, without anything in the source pointing
/// at them.
const CONVENTIONAL_NAMES: [&str; 6] = [
    "favicon",
    "robots",
    "sitemap",
    "manifest",
    "apple-touch-icon",
    "browserconfig",
];

/// What a single asset may weigh before it is worth a second look.
const IMAGE_BUDGET: u64 = 300 * 1024;
const FONT_BUDGET: u64 = 200 * 1024;
const MEDIA_BUDGET: u64 = 2 * 1024 * 1024;

fn image_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r"<img\b[^>]*>").expect("the image pattern is valid"))
}

/// The budget an asset is measured against, from its extension.
pub fn budget(extension: &str) -> u64 {
    match extension {
        "woff" | "woff2" | "ttf" | "otf" | "eot" => FONT_BUDGET,
        "mp4" | "webm" | "mp3" | "wav" | "pdf" => MEDIA_BUDGET,
        _ => IMAGE_BUDGET,
    }
}

/// Render a byte count the way a report line reads best.
pub fn human_size(bytes: u64) -> String {
    if bytes >= 1024 * 1024 {
        return format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0));
    }
    format!("{} KB", bytes / 1024)
}

/// Source folders holding reference material rather than shipped assets. The
/// inspirations catalogue is browsed by designers and never reaches the bundle,
/// so nothing in the source points at it — by design.
const REFERENCE_DIRS: &[&str] = &["inspirations"];

/// Whether the path sits inside a reference folder.
fn is_reference(path: &Path) -> bool {
    path.components().any(|component| {
        component
            .as_os_str()
            .to_str()
            .is_some_and(|name| REFERENCE_DIRS.contains(&name))
    })
}

/// Every asset a module ships, from `public/` and from its sources.
pub fn collect(module: &WorkspaceModule) -> Vec<std::path::PathBuf> {
    let mut assets = collect_files(&module.dir.join("public"), ASSET_EXTENSIONS, 6);
    assets.extend(collect_files(&module.dir.join("src"), ASSET_EXTENSIONS, 10));
    assets.retain(|path| !is_reference(path));
    assets.sort();
    assets.dedup();
    assets
}

/// Everything in the workspace that could point at an asset, concatenated.
pub fn referring_text(modules: &[WorkspaceModule]) -> String {
    let mut text = String::new();

    for module in modules {
        for directory in ["src", "public"] {
            for path in collect_files(&module.dir.join(directory), REFERRING_EXTENSIONS, 10) {
                if let Ok(content) = fs::read_to_string(&path) {
                    text.push_str(&content);
                    text.push('\n');
                }
            }
        }
    }

    text
}

/// Whether the platform loads the asset without being told to.
pub fn is_conventional(stem: &str) -> bool {
    CONVENTIONAL_NAMES
        .iter()
        .any(|name| stem == *name || stem.starts_with(&format!("{name}-")))
}

/// Assets nothing points at, and assets heavier than their budget.
pub fn inspect(
    root: &Path,
    assets: &[std::path::PathBuf],
    references: &str,
    warnings: &mut Vec<String>,
) {
    for path in assets {
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let stem = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or_default();
        let extension = path
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or_default();
        let file = relative(root, path);

        if !is_conventional(stem) && !references.contains(name) {
            warnings.push(format!("{file}: nothing references it — it ships unused"));
        }

        let size = fs::metadata(path).map(|meta| meta.len()).unwrap_or(0);
        let budget = budget(extension);
        if size > budget {
            warnings.push(format!(
                "{file}: {} exceeds the {} budget for a {extension}",
                human_size(size),
                human_size(budget)
            ));
        }
    }
}

/// Images rendered without an intrinsic size, which is what makes a page jump.
pub fn unsized_images(content: &str, file: &str, warnings: &mut Vec<String>) {
    for found in image_pattern().find_iter(content) {
        let tag = found.as_str();
        if tag.contains("width") && tag.contains("height") {
            continue;
        }
        // A fill layout is sized by its container on purpose.
        if tag.contains("aspect-") || tag.contains("absolute") {
            continue;
        }
        warnings.push(format!(
            "{file}:{}: the image declares no width and height — the page reflows when it loads",
            artifacts::line_of(content, found.start())
        ));
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<_> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(is_frontend)
    .collect();

    if modules.is_empty() {
        return CheckOutcome::new(
            CheckId::Assets,
            CheckStatus::Skipped,
            "no front-end module to inspect",
        );
    }

    let assets: Vec<std::path::PathBuf> = modules.iter().flat_map(collect).collect();
    let references = referring_text(&modules);

    let mut warnings = Vec::new();
    inspect(root, &assets, &references, &mut warnings);

    let mut seen: BTreeSet<String> = BTreeSet::new();
    for module in &modules {
        for path in collect_files(&module.dir.join("src"), &["tsx", "jsx", "html"], 10) {
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            let file = relative(root, &path);
            if seen.insert(file.clone()) {
                unsized_images(&content, &file, &mut warnings);
            }
        }
    }

    if assets.is_empty() && warnings.is_empty() {
        return CheckOutcome::new(CheckId::Assets, CheckStatus::Skipped, "no asset found");
    }

    let scope = format!(
        "{} asset{}",
        assets.len(),
        if assets.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Assets,
        &scope,
        "every asset is referenced and within budget",
        Vec::new(),
        warnings,
    )
    .with_hint("Delete what nothing references, and give every `<img>` a width and a height")
}
