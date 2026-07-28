//! Contrast check — the WCAG ratio of every foreground token against the
//! surface it sits on.
//!
//! Biome's a11y rules can tell that an element has no label; they cannot tell
//! that `--muted-foreground` on `--muted` comes out at 3.1:1, because that
//! needs the colours actually computed. The design system names the pairs for
//! us — `--X-foreground` is the text drawn on `--X` — so each theme block can
//! be resolved and measured.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::modules::{
    WorkspaceModule, collect_files, discover_modules, filter_modules, relative, wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// WCAG AA for body text.
const AA_TEXT: f64 = 4.5;

/// WCAG AA for large text, and the floor below which a pair is reported as an
/// error rather than a warning: under this, nothing on the surface is legible.
const AA_LARGE: f64 = 3.0;

/// The suffix that names a foreground token after the surface it sits on.
const FOREGROUND_SUFFIX: &str = "-foreground";

/// A colour in linear-light sRGB, which is what a contrast ratio is computed
/// from.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rgb {
    pub red: f64,
    pub green: f64,
    pub blue: f64,
}

fn declaration_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"(?m)^\s*(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);")
            .expect("the declaration pattern is valid")
    })
}

fn oklch_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"oklch\(\s*([0-9.]+%?)\s+([0-9.]+)\s+([0-9.]+)")
            .expect("the oklch pattern is valid")
    })
}

fn var_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"var\(\s*(--[A-Za-z0-9_-]+)").expect("the var pattern is valid")
    })
}

/// Every custom property declared in a stylesheet, in source order so a later
/// declaration wins the way the cascade makes it win.
pub fn declarations(css: &str) -> BTreeMap<String, String> {
    declaration_pattern()
        .captures_iter(css)
        .filter_map(|captured| {
            Some((
                captured.get(1)?.as_str().to_string(),
                captured.get(2)?.as_str().trim().to_string(),
            ))
        })
        .collect()
}

/// Follow `var(--other)` indirection to the value that actually paints.
pub fn resolve<'a>(tokens: &'a BTreeMap<String, String>, name: &str) -> Option<&'a str> {
    let mut current = name.to_string();
    // The theme files alias heavily (`--card-foreground: var(--foreground)`),
    // and a bounded walk cannot be trapped by an accidental loop.
    for _ in 0..8 {
        let value = tokens.get(&current)?.as_str();
        match var_pattern().captures(value) {
            Some(captured) => current = captured.get(1)?.as_str().to_string(),
            None => return Some(value),
        }
    }
    None
}

/// Parse a colour. `oklch()` is what the themes are written in; the hex forms
/// are accepted because a hand-added token is usually written that way.
pub fn parse_color(value: &str) -> Option<Rgb> {
    if let Some(captured) = oklch_pattern().captures(value) {
        let lightness = captured.get(1)?.as_str();
        let lightness = match lightness.strip_suffix('%') {
            Some(percent) => percent.parse::<f64>().ok()? / 100.0,
            None => lightness.parse::<f64>().ok()?,
        };
        return Some(oklch_to_linear(
            lightness,
            captured.get(2)?.as_str().parse().ok()?,
            captured.get(3)?.as_str().parse().ok()?,
        ));
    }

    let hex = value.trim().strip_prefix('#')?;
    let expand = |slice: &str| {
        u8::from_str_radix(slice, 16)
            .ok()
            .map(|byte| byte as f64 / 255.0)
    };
    let (red, green, blue) = match hex.len() {
        3 => (
            expand(&hex[0..1].repeat(2))?,
            expand(&hex[1..2].repeat(2))?,
            expand(&hex[2..3].repeat(2))?,
        ),
        6 | 8 => (
            expand(&hex[0..2])?,
            expand(&hex[2..4])?,
            expand(&hex[4..6])?,
        ),
        _ => return None,
    };

    Some(Rgb {
        red: to_linear(red),
        green: to_linear(green),
        blue: to_linear(blue),
    })
}

/// The sRGB transfer function, inverted: WCAG measures light, not the encoded
/// byte.
fn to_linear(channel: f64) -> f64 {
    if channel <= 0.040_45 {
        channel / 12.92
    } else {
        ((channel + 0.055) / 1.055).powf(2.4)
    }
}

/// Convert `oklch(L C H)` to linear-light sRGB, through OKLab.
pub fn oklch_to_linear(lightness: f64, chroma: f64, hue: f64) -> Rgb {
    let hue = hue.to_radians();
    let a = chroma * hue.cos();
    let b = chroma * hue.sin();

    let long = (lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b).powi(3);
    let medium = (lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b).powi(3);
    let short = (lightness - 0.089_484_177_5 * a - 1.291_485_548 * b).powi(3);

    Rgb {
        red: 4.076_741_662_1 * long - 3.307_711_591_3 * medium + 0.230_969_929_2 * short,
        green: -1.268_438_004_6 * long + 2.609_757_401_1 * medium - 0.341_319_396_5 * short,
        blue: -0.004_196_086_3 * long - 0.703_418_614_7 * medium + 1.707_614_701 * short,
    }
}

/// Relative luminance, as WCAG defines it.
pub fn luminance(color: Rgb) -> f64 {
    let clamp = |channel: f64| channel.clamp(0.0, 1.0);
    0.2126 * clamp(color.red) + 0.7152 * clamp(color.green) + 0.0722 * clamp(color.blue)
}

/// The contrast ratio between two colours, from 1:1 to 21:1.
pub fn ratio(foreground: Rgb, background: Rgb) -> f64 {
    let (first, second) = (luminance(foreground), luminance(background));
    let (lighter, darker) = if first > second {
        (first, second)
    } else {
        (second, first)
    };
    (lighter + 0.05) / (darker + 0.05)
}

/// The surface a foreground token is drawn on.
///
/// `--primary-foreground` sits on `--primary`, and the bare `--foreground` sits
/// on `--background`.
pub fn surface_of(token: &str) -> Option<String> {
    let base = token.strip_suffix(FOREGROUND_SUFFIX)?;
    if base == "-" {
        return Some("--background".to_string());
    }
    Some(base.to_string())
}

/// Measure every foreground/surface pair a stylesheet defines.
pub fn inspect(label: &str, tokens: &BTreeMap<String, String>) -> (Vec<String>, Vec<String>) {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    for token in tokens.keys() {
        let Some(surface) = surface_of(token) else {
            continue;
        };
        let (Some(foreground), Some(background)) = (
            resolve(tokens, token).and_then(parse_color),
            resolve(tokens, &surface).and_then(parse_color),
        ) else {
            continue;
        };

        let measured = ratio(foreground, background);
        if measured >= AA_TEXT {
            continue;
        }

        let line = format!(
            "{label}: `{token}` on `{surface}` is {measured:.1}:1, under the {AA_TEXT}:1 WCAG AA floor"
        );
        // Below the large-text floor nothing on the surface is legible; between
        // the two, headings and icons still pass.
        if measured < AA_LARGE {
            errors.push(line);
        } else {
            warnings.push(line);
        }
    }

    (errors, warnings)
}

/// The stylesheets of a design module, each read on its own so a light and a
/// dark theme are measured separately.
pub fn stylesheets(module: &WorkspaceModule) -> Vec<std::path::PathBuf> {
    collect_files(&module.dir.join("src").join("styles"), &["css"], 4)
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<WorkspaceModule> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(|module| module.kind.as_deref() == Some("design"))
    .collect();

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut pairs = 0;

    for module in &modules {
        // The palette a theme aliases lives in a sibling file, so every
        // stylesheet of the module is read before any pair is resolved, and
        // each theme is then measured against that shared palette.
        let shared: BTreeMap<String, String> = stylesheets(module)
            .iter()
            .filter_map(|path| fs::read_to_string(path).ok())
            .flat_map(|css| declarations(&css))
            .collect();

        for path in stylesheets(module) {
            let Ok(css) = fs::read_to_string(&path) else {
                continue;
            };
            let mut tokens = shared.clone();
            // The file's own declarations win, which is what makes the dark
            // theme measure its own colours rather than the light ones.
            tokens.extend(declarations(&css));

            let local = declarations(&css);
            let theme: BTreeMap<String, String> = tokens
                .iter()
                .filter(|(token, _)| local.contains_key(*token) || !is_foreground(token))
                .map(|(token, value)| (token.clone(), value.clone()))
                .collect();
            pairs += theme.keys().filter(|token| is_foreground(token)).count();

            let (file_errors, file_warnings) = inspect(&relative(root, &path), &theme);
            errors.extend(file_errors);
            warnings.extend(file_warnings);
        }
    }

    if pairs == 0 {
        return CheckOutcome::new(
            CheckId::Contrast,
            CheckStatus::Skipped,
            "no design tokens to measure",
        );
    }

    errors.sort();
    errors.dedup();
    warnings.sort();
    warnings.dedup();

    let scope = format!("{pairs} pair{}", if pairs == 1 { "" } else { "s" });

    static_outcome(
        CheckId::Contrast,
        &scope,
        "every pair clears WCAG AA",
        errors,
        warnings,
    )
    .with_hint("Darken the foreground or lighten the surface until the pair reaches 4.5:1")
}

fn is_foreground(token: &str) -> bool {
    token.ends_with(FOREGROUND_SUFFIX)
}
