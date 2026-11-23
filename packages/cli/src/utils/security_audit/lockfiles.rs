// Lockfile parsers — each returns the resolved (name, version) pairs it
// can extract from one ecosystem's lockfile format. Split out of the
// parent module to keep it under the file-size budget.

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use serde_json::Value;

use super::{Ecosystem, PackageKey};
use crate::utils::strip_jsonc;

fn read(dir: &Path, file: &str) -> Option<String> {
    fs::read_to_string(dir.join(file)).ok()
}

pub fn npm(name: &str, version: &str) -> PackageKey {
    PackageKey {
        ecosystem: Ecosystem::Npm,
        name: name.to_string(),
        version: version.to_string(),
    }
}

/// `bun.lock` (text lockfile). Its `packages` map holds one `name@version`
/// string per resolved dependency, covering the full transitive npm tree.
pub fn parse_bun_lock(dir: &Path) -> Vec<PackageKey> {
    let Some(raw) = read(dir, "bun.lock") else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&strip_jsonc(&raw)) else {
        return Vec::new();
    };
    let Some(packages) = value.get("packages").and_then(Value::as_object) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in packages.values() {
        if let Some(descriptor) = entry.get(0).and_then(Value::as_str)
            && let Some((name, version)) = split_name_version(descriptor)
        {
            out.push(npm(&name, &version));
        }
    }
    out
}

/// `package-lock.json` v2/v3 — the `packages` map keys are install paths
/// (`node_modules/<name>`) and each value carries the resolved `version`.
pub fn parse_package_lock(dir: &Path) -> Vec<PackageKey> {
    let Some(raw) = read(dir, "package-lock.json") else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&raw) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    if let Some(packages) = value.get("packages").and_then(Value::as_object) {
        for (path, meta) in packages {
            if path.is_empty() {
                continue;
            }
            let Some(name) = path.rsplit("node_modules/").next() else {
                continue;
            };
            if let Some(version) = meta.get("version").and_then(Value::as_str) {
                out.push(npm(name, version));
            }
        }
    }
    out
}

/// `go.sum` — lines `module version[/go.mod] hash`.
pub fn parse_go_sum(dir: &Path) -> Vec<PackageKey> {
    let Some(raw) = read(dir, "go.sum") else {
        return Vec::new();
    };
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for line in raw.lines() {
        let mut parts = line.split_whitespace();
        let (Some(module), Some(version)) = (parts.next(), parts.next()) else {
            continue;
        };
        let version = version.trim_end_matches("/go.mod");
        if seen.insert((module.to_string(), version.to_string())) {
            out.push(PackageKey {
                ecosystem: Ecosystem::Go,
                name: module.to_string(),
                version: version.to_string(),
            });
        }
    }
    out
}

/// `Gemfile.lock` — the `GEM` section lists `  name (version)` specs.
pub fn parse_gemfile_lock(dir: &Path) -> Vec<PackageKey> {
    let Some(raw) = read(dir, "Gemfile.lock") else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let mut in_specs = false;
    for line in raw.lines() {
        if line.trim_end() == "  specs:" {
            in_specs = true;
            continue;
        }
        if !in_specs {
            continue;
        }
        let indent = line.len() - line.trim_start().len();
        let trimmed = line.trim();
        if trimmed.is_empty() {
            in_specs = false;
            continue;
        }
        // Direct specs are indented by exactly 4 spaces; deeper indent is a
        // transitive dependency constraint without a pinned version.
        if indent != 4 {
            continue;
        }
        if let Some(key) = gemfile_lock_spec(trimmed) {
            out.push(key);
        }
    }
    out
}

/// Parses a single 4-space-indented Gemfile.lock spec line (`name (version)`)
/// into a `PackageKey`, when its version starts with a digit.
fn gemfile_lock_spec(trimmed: &str) -> Option<PackageKey> {
    let (name, rest) = trimmed.split_once(" (")?;
    let version = rest.trim_end_matches(')');
    if version.is_empty() || !version.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(PackageKey {
        ecosystem: Ecosystem::RubyGems,
        name: name.to_string(),
        version: version.to_string(),
    })
}

/// `composer.lock` — JSON with `packages`/`packages-dev` arrays of `{name,version}`.
pub fn parse_composer_lock(dir: &Path) -> Vec<PackageKey> {
    let Some(raw) = read(dir, "composer.lock") else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&raw) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for section in ["packages", "packages-dev"] {
        let Some(list) = value.get(section).and_then(Value::as_array) else {
            continue;
        };
        for entry in list {
            let name = entry.get("name").and_then(Value::as_str);
            let version = entry.get("version").and_then(Value::as_str);
            if let (Some(name), Some(version)) = (name, version) {
                out.push(PackageKey {
                    ecosystem: Ecosystem::Packagist,
                    name: name.to_string(),
                    version: version.trim_start_matches('v').to_string(),
                });
            }
        }
    }
    out
}

pub fn split_name_version(descriptor: &str) -> Option<(String, String)> {
    let at = descriptor.rfind('@').filter(|&i| i > 0)?;
    Some((
        descriptor[..at].to_string(),
        descriptor[at + 1..].to_string(),
    ))
}

pub fn unquote(value: &str) -> String {
    value.trim().trim_matches('"').to_string()
}
