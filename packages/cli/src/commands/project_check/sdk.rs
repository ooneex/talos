//! SDK check — the generated client against the controllers it was generated
//! from.
//!
//! An SDK module is a snapshot: `talos sdk:create` reads the target module's
//! controllers once and writes the typed methods. Every route added, renamed or
//! deleted afterwards leaves the snapshot behind, and because the SDK compiles
//! perfectly on its own, the drift only surfaces in the browser.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::modules::{
    TS_EXTENSIONS, WorkspaceModule, collect_files, discover_modules, filter_modules, wanted_names,
};
use super::routes::{self, Route};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// The module an SDK was generated from, declared as `target:` in its manifest.
pub fn target_of(module: &WorkspaceModule) -> Option<String> {
    let content = fs::read_to_string(module.manifest_path()).ok()?;
    content.lines().find_map(|line| {
        let value = line.trim().strip_prefix("target:")?;
        let value = value.split('#').next().unwrap_or(value);
        Some(value.trim().trim_matches(['"', '\'']).to_string())
    })
}

fn key_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r#"key\s*:\s*"([^"]+)""#).expect("the key pattern is valid"))
}

fn endpoint_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r#"endpoint\s*:\s*"([^"]*)""#).expect("the endpoint pattern is valid")
    })
}

/// What an SDK module currently exposes.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SdkSurface {
    /// The route names the SDK carries a method for.
    pub keys: BTreeSet<String>,
    /// The endpoints it will call.
    pub endpoints: BTreeSet<String>,
    /// Methods still carrying the generator's placeholder body.
    pub unimplemented: usize,
}

/// Read an SDK module's source.
pub fn surface(module: &WorkspaceModule) -> SdkSurface {
    let mut surface = SdkSurface::default();

    for path in collect_files(&module.dir.join("src"), TS_EXTENSIONS, 6) {
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        surface.keys.extend(
            key_pattern()
                .captures_iter(&content)
                .filter_map(|captured| captured.get(1))
                .map(|group| group.as_str().to_string()),
        );
        surface.endpoints.extend(
            endpoint_pattern()
                .captures_iter(&content)
                .filter_map(|captured| captured.get(1))
                .map(|group| group.as_str().to_string()),
        );
        surface.unimplemented += content.matches("Not implemented").count();
    }

    surface
}

/// Compare an SDK against the routes it is supposed to cover.
pub fn inspect(
    label: &str,
    target: &str,
    surface: &SdkSurface,
    routes: &[Route],
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let declared: BTreeSet<String> = routes
        .iter()
        .filter_map(|route| route.name.clone())
        .collect();

    for missing in declared.difference(&surface.keys) {
        errors.push(format!(
            "{label}: `{missing}` is declared by {target} but the SDK has no method for it"
        ));
    }
    for stale in surface.keys.difference(&declared) {
        errors.push(format!(
            "{label}: the SDK still exposes `{stale}`, which {target} no longer declares"
        ));
    }

    // The endpoint is what the client actually requests, so a route that moved
    // or was versioned up leaves the SDK calling the old address.
    for route in routes {
        let Some(name) = route.name.as_deref() else {
            continue;
        };
        if !surface.keys.contains(name) {
            continue;
        }
        let suffix = format!("/v{}{}", route.version.unwrap_or(1), route.path);
        if !surface
            .endpoints
            .iter()
            .any(|endpoint| endpoint.ends_with(&suffix))
        {
            errors.push(format!(
                "{label}: `{name}` now answers on `{suffix}`, which no SDK endpoint matches"
            ));
        }
    }

    if surface.unimplemented > 0 {
        warnings.push(format!(
            "{label}: {} generated method{} still throw `Not implemented`",
            surface.unimplemented,
            if surface.unimplemented == 1 { "" } else { "s" }
        ));
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let all = discover_modules(root);
    let sdks = filter_modules(
        all.clone(),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(|module| module.kind.as_deref() == Some("sdk"))
    .collect::<Vec<_>>();

    if sdks.is_empty() {
        return CheckOutcome::new(CheckId::Sdk, CheckStatus::Skipped, "no sdk module found");
    }

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut covered = 0;

    for sdk in &sdks {
        let label = sdk.label();
        let Some(target) = target_of(sdk) else {
            errors.push(format!(
                "{label}: {}.yml declares no `target:` — nothing says which module it wraps",
                sdk.name
            ));
            continue;
        };
        let Some(module) = all.iter().find(|module| module.name == target) else {
            errors.push(format!(
                "{label}: it targets \"{target}\", which is not a module any more"
            ));
            continue;
        };

        let routes = routes::collect(root, std::slice::from_ref(module));
        if routes.is_empty() {
            warnings.push(format!("{label}: \"{target}\" declares no route to wrap"));
            continue;
        }
        covered += routes.len();
        inspect(
            &label,
            &target,
            &surface(sdk),
            &routes,
            &mut errors,
            &mut warnings,
        );
    }

    let scope = format!(
        "{} sdk{} · {covered} route{}",
        sdks.len(),
        if sdks.len() == 1 { "" } else { "s" },
        if covered == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Sdk,
        &scope,
        "every route has a matching client method",
        errors,
        warnings,
    )
    .with_hint(
        "Regenerate with `talos sdk:create --module=<target>`, which merges into the existing file",
    )
}
