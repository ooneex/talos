//! Outdated check — how far the declared dependencies have fallen behind.
//!
//! The security check answers "is anything I depend on known to be broken?".
//! This one answers the question that comes before it: a dependency three major
//! versions behind is not a vulnerability yet, but it is the reason the upgrade
//! that fixes one will take a week. It is opt-in because it talks to the public
//! registries.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::sync::Mutex;

use serde_json::Value;

use super::modules::{
    WorkspaceModule, discover_modules, filter_modules, normalize_distribution, wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// How many registry lookups run at once. The registries are fine with far
/// more; this is about not opening a hundred sockets from a CLI.
const WORKERS: usize = 8;

/// Ranges that pin nothing, so there is no version to compare against.
const UNPINNED: [&str; 4] = ["*", "latest", "x", ""];

/// A registry a dependency can come from.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Registry {
    Npm,
    Crates,
    PyPI,
}

impl Registry {
    pub fn label(self) -> &'static str {
        match self {
            Registry::Npm => "npm",
            Registry::Crates => "crates.io",
            Registry::PyPI => "PyPI",
        }
    }

    /// Where the latest published version is read from.
    pub fn url(self, name: &str) -> String {
        match self {
            Registry::Npm => format!("https://registry.npmjs.org/{name}/latest"),
            Registry::Crates => format!("https://crates.io/api/v1/crates/{name}"),
            Registry::PyPI => format!("https://pypi.org/pypi/{name}/json"),
        }
    }

    /// Pull the latest version out of the registry's response.
    pub fn latest(self, response: &Value) -> Option<String> {
        let version = match self {
            Registry::Npm => response.get("version"),
            Registry::Crates => response.pointer("/crate/max_stable_version"),
            Registry::PyPI => response.pointer("/info/version"),
        };
        version.and_then(Value::as_str).map(str::to_string)
    }
}

/// A dependency to look up, and who declares it.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Dependency {
    pub name: String,
    pub registry: Registry,
    /// The lowest version the declared range accepts.
    pub declared: String,
    /// The modules declaring it, for the report line.
    pub owners: BTreeSet<String>,
}

/// The lowest version a range accepts, or `None` when it pins nothing that can
/// be compared — a workspace, path, git or URL dependency.
pub fn floor(range: &str) -> Option<String> {
    let cleaned = range.trim();
    if cleaned.starts_with("workspace:")
        || cleaned.starts_with("file:")
        || cleaned.starts_with("link:")
        || cleaned.starts_with("git")
        || cleaned.contains("://")
    {
        return None;
    }

    // `>=1.2 <2`, `^1.2.3`, `~1.2`, `1.2.*` all start at the same place.
    let first = cleaned
        .split(&['|', ',', ' '][..])
        .find(|part| part.chars().any(|character| character.is_ascii_digit()))?;
    let version: String = first
        .trim_start_matches(['^', '~', '>', '<', '=', 'v', ' '])
        .chars()
        .take_while(|character| character.is_ascii_digit() || *character == '.')
        .collect();

    let version = version.trim_end_matches('.').to_string();
    if version.is_empty() || UNPINNED.contains(&version.as_str()) {
        return None;
    }
    Some(version)
}

/// The numeric parts of a version, missing components read as zero.
pub fn parts(version: &str) -> (u64, u64, u64) {
    let mut numbers = version
        .split('.')
        .map(|part| part.trim().parse::<u64>().unwrap_or(0));
    (
        numbers.next().unwrap_or(0),
        numbers.next().unwrap_or(0),
        numbers.next().unwrap_or(0),
    )
}

/// How many major versions `declared` is behind `latest`. A prerelease or a
/// calendar version compares just as well, because only the leading number is
/// read.
pub fn majors_behind(declared: &str, latest: &str) -> u64 {
    parts(latest).0.saturating_sub(parts(declared).0)
}

/// Whether the declared floor is behind the latest release at all.
pub fn is_behind(declared: &str, latest: &str) -> bool {
    parts(declared) < parts(latest)
}

/// Every third-party dependency the workspace declares, merged across manifests.
pub fn collect(modules: &[WorkspaceModule], root: &Path) -> Vec<Dependency> {
    let mut merged: BTreeMap<(Registry, String), Dependency> = BTreeMap::new();

    let mut record = |registry: Registry, name: &str, range: &str, owner: &str| {
        let Some(declared) = floor(range) else {
            return;
        };
        let entry = merged
            .entry((registry, name.to_string()))
            .or_insert_with(|| Dependency {
                name: name.to_string(),
                registry,
                declared: declared.clone(),
                owners: BTreeSet::new(),
            });
        entry.owners.insert(owner.to_string());
        // The oldest floor in the workspace is the one holding an upgrade back.
        if parts(&declared) < parts(&entry.declared) {
            entry.declared = declared;
        }
    };

    for (manifest, owner) in npm_manifests(modules, root) {
        for field in ["dependencies", "devDependencies"] {
            let Some(entries) = manifest.get(field).and_then(Value::as_object) else {
                continue;
            };
            for (name, range) in entries {
                let Some(range) = range.as_str() else {
                    continue;
                };
                record(Registry::Npm, name, range, &owner);
            }
        }
    }

    for module in modules {
        let owner = module.label();
        if let Some(cargo) = module.cargo_toml() {
            for (name, requirement) in &cargo.dependencies {
                record(Registry::Crates, name, requirement, &owner);
            }
        }
        if let Some(python) = module.pyproject() {
            for (name, specifier) in &python.dependencies {
                record(
                    Registry::PyPI,
                    &normalize_distribution(name),
                    specifier,
                    &owner,
                );
            }
        }
    }

    merged.into_values().collect()
}

/// The `package.json` of the root and of every module, with the label each one
/// is reported under.
fn npm_manifests(modules: &[WorkspaceModule], root: &Path) -> Vec<(Value, String)> {
    super::modules::read_json(&root.join("package.json"))
        .map(|manifest| (manifest, "root".to_string()))
        .into_iter()
        .chain(
            modules
                .iter()
                .filter_map(|module| Some((module.package_json()?, module.label()))),
        )
        .collect()
}

fn agent() -> ureq::Agent {
    // The same platform-verifier configuration the security audit uses, so a
    // corporate TLS proxy does not break one check and not the other.
    ureq::Agent::config_builder()
        .tls_config(
            ureq::tls::TlsConfig::builder()
                .root_certs(ureq::tls::RootCerts::PlatformVerifier)
                .build(),
        )
        .build()
        .into()
}

/// Ask a registry for the latest published version.
pub fn fetch_latest(agent: &ureq::Agent, dependency: &Dependency) -> Option<String> {
    let response: Value = agent
        .get(&dependency.registry.url(&dependency.name))
        // crates.io rejects a request that does not identify itself.
        .header("User-Agent", "talos-cli (project:check)")
        .call()
        .ok()?
        .into_body()
        .read_json()
        .ok()?;
    dependency.registry.latest(&response)
}

/// Look every dependency up, a few at a time.
pub fn fetch_all(dependencies: &[Dependency]) -> BTreeMap<(Registry, String), Option<String>> {
    let agent = agent();
    let next = std::sync::atomic::AtomicUsize::new(0);
    let found = Mutex::new(BTreeMap::new());

    std::thread::scope(|scope| {
        for _ in 0..WORKERS.min(dependencies.len().max(1)) {
            scope.spawn(|| {
                loop {
                    let index = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    let Some(dependency) = dependencies.get(index) else {
                        return;
                    };
                    let latest = fetch_latest(&agent, dependency);
                    if let Ok(mut found) = found.lock() {
                        found.insert((dependency.registry, dependency.name.clone()), latest);
                    }
                }
            });
        }
    });

    found.into_inner().unwrap_or_default()
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );
    let dependencies = collect(&modules, root);

    if dependencies.is_empty() {
        return CheckOutcome::new(
            CheckId::Outdated,
            CheckStatus::Skipped,
            "no pinned dependency to compare",
        );
    }

    let latest = fetch_all(&dependencies);
    if latest.values().all(Option::is_none) {
        return CheckOutcome::new(
            CheckId::Outdated,
            CheckStatus::Skipped,
            "the registries could not be reached",
        )
        .with_hint("The check needs network access to npm, crates.io and PyPI");
    }

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut behind = 0;

    for dependency in &dependencies {
        let owners = dependency
            .owners
            .iter()
            .cloned()
            .collect::<Vec<_>>()
            .join(", ");
        match latest.get(&(dependency.registry, dependency.name.clone())) {
            // Unreachable one at a time means the package is gone from the
            // registry, which is a supply-chain problem rather than a slow day.
            Some(None) => errors.push(format!(
                "{} `{}` is not published on {} any more ({owners})",
                dependency.registry.label(),
                dependency.name,
                dependency.registry.label()
            )),
            Some(Some(published)) if is_behind(&dependency.declared, published) => {
                behind += 1;
                let majors = majors_behind(&dependency.declared, published);
                // A minor or patch behind is the normal state of a healthy
                // project; only a major is worth anyone's attention.
                if majors == 0 {
                    continue;
                }
                warnings.push(format!(
                    "`{}` is on {} but {published} is out — {majors} major version{} behind ({owners})",
                    dependency.name,
                    dependency.declared,
                    if majors == 1 { "" } else { "s" }
                ));
            }
            _ => {}
        }
    }

    let scope = format!(
        "{} dependenc{} · {behind} behind",
        dependencies.len(),
        if dependencies.len() == 1 { "y" } else { "ies" }
    );

    static_outcome(
        CheckId::Outdated,
        &scope,
        "every dependency is on a current major",
        errors,
        warnings,
    )
    .with_hint("Upgrade one major at a time, then re-run `talos project:check`")
}
