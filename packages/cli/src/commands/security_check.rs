use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use clap::Args;
use console::style;
use serde_json::{Value, json};

use crate::utils::{
    IssueYaml, Spinner, current_dir, error, generate_issue_id, issue_to_yaml, strip_jsonc, success,
    warn,
};

/// Universal, always-online vulnerability database. A single API covers every
/// ecosystem (npm/react/typescript/node, PyPI, crates.io, Go, RubyGems, …), so
/// no per-language audit binary has to be installed locally.
const OSV_QUERY_BATCH_URL: &str = "https://api.osv.dev/v1/querybatch";
const OSV_VULN_URL: &str = "https://api.osv.dev/v1/vulns";
const OSV_BATCH_SIZE: usize = 1000;
const SOURCE: &str = "OSV.dev";

/// Directories that are never descended into while collecting dependencies.
/// Their contents are still covered because every installed dependency (even
/// those under `node_modules`) is pinned in the lockfile at the module root.
const EXCLUDED_DIRS: &[&str] = &[
    "node_modules",
    "dist",
    "build",
    "target",
    "var",
    "coverage",
    ".git",
    ".temp",
    ".turbo",
    ".cache",
    "vendor",
    ".venv",
    "venv",
    "__pycache__",
];

const MAX_DEPTH: usize = 6;

#[derive(Args, Debug)]
pub struct SecurityCheckArgs {
    /// Create a YAML issue per vulnerability instead of printing the report.
    #[arg(long, default_value_t = false)]
    pub issues: bool,

    /// Only audit modules whose directory name matches (comma-separated).
    #[arg(long)]
    pub modules: Option<String>,

    /// Alias for --modules (comma-separated).
    #[arg(long)]
    pub packages: Option<String>,

    /// Minimum severity to report (low, moderate, high, critical).
    #[arg(long = "audit-level")]
    pub audit_level: Option<String>,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Severity {
    Unknown,
    Low,
    Moderate,
    High,
    Critical,
}

impl Severity {
    fn from_label(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "critical" => Severity::Critical,
            "high" => Severity::High,
            "moderate" | "medium" => Severity::Moderate,
            "low" => Severity::Low,
            _ => Severity::Unknown,
        }
    }

    fn from_cvss(score: f64) -> Self {
        if score >= 9.0 {
            Severity::Critical
        } else if score >= 7.0 {
            Severity::High
        } else if score >= 4.0 {
            Severity::Moderate
        } else if score > 0.0 {
            Severity::Low
        } else {
            Severity::Unknown
        }
    }

    fn label(&self) -> &'static str {
        match self {
            Severity::Critical => "CRITICAL",
            Severity::High => "HIGH",
            Severity::Moderate => "MODERATE",
            Severity::Low => "LOW",
            Severity::Unknown => "UNKNOWN",
        }
    }

    fn styled(&self) -> String {
        let label = format!(" {} ", self.label());
        match self {
            Severity::Critical => style(label).white().on_red().bold().to_string(),
            Severity::High => style(label).red().bold().to_string(),
            Severity::Moderate => style(label).yellow().bold().to_string(),
            Severity::Low => style(label).cyan().to_string(),
            Severity::Unknown => style(label).dim().to_string(),
        }
    }

    fn priority(&self) -> &'static str {
        match self {
            Severity::Critical | Severity::High => "Urgent",
            Severity::Moderate => "High",
            Severity::Low | Severity::Unknown => "Medium",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Ecosystem {
    Npm,
    PyPI,
    Crates,
    Go,
    RubyGems,
    Packagist,
}

impl Ecosystem {
    /// The exact ecosystem string OSV expects.
    fn osv(&self) -> &'static str {
        match self {
            Ecosystem::Npm => "npm",
            Ecosystem::PyPI => "PyPI",
            Ecosystem::Crates => "crates.io",
            Ecosystem::Go => "Go",
            Ecosystem::RubyGems => "RubyGems",
            Ecosystem::Packagist => "Packagist",
        }
    }

    /// Human-friendly label shown in the report.
    fn label(&self) -> &'static str {
        match self {
            Ecosystem::Npm => "npm",
            Ecosystem::PyPI => "pypi",
            Ecosystem::Crates => "crates.io",
            Ecosystem::Go => "go",
            Ecosystem::RubyGems => "rubygems",
            Ecosystem::Packagist => "packagist",
        }
    }
}

#[derive(Clone, PartialEq, Eq, Hash)]
struct PackageKey {
    ecosystem: Ecosystem,
    name: String,
    version: String,
}

struct ModuleReport {
    name: String,
    dir: PathBuf,
    packages: Vec<PackageKey>,
}

struct Finding {
    module: String,
    module_dir: PathBuf,
    ecosystem: Ecosystem,
    package: String,
    version: String,
    severity: Severity,
    id: String,
    title: String,
    url: String,
    aliases: String,
    patched: String,
}

/// A vulnerability exposed to other commands, free of the private types the
/// audit uses internally.
#[derive(Clone, Debug)]
pub struct SecurityFinding {
    pub module: String,
    pub ecosystem: String,
    pub package: String,
    pub version: String,
    pub severity: &'static str,
    pub id: String,
    pub title: String,
    pub url: String,
    pub patched: String,
}

/// Outcome of an audit, kept free of process exits and printing so it can be
/// embedded in aggregated reports such as `project:check`.
#[derive(Clone, Debug, Default)]
pub struct SecurityAudit {
    pub findings: Vec<SecurityFinding>,
    pub modules: usize,
    pub dependencies: usize,
}

impl SecurityAudit {
    /// Number of findings carrying the given severity label (`CRITICAL`, …).
    pub fn count(&self, severity: &str) -> usize {
        self.findings
            .iter()
            .filter(|finding| finding.severity == severity)
            .count()
    }
}

/// Run the audit and return its findings instead of printing them.
pub fn audit(
    root: &Path,
    modules: Option<&str>,
    packages: Option<&str>,
    audit_level: Option<&str>,
) -> Result<SecurityAudit, String> {
    let filter = build_filter(modules, packages);
    let min_severity = audit_level
        .map(Severity::from_label)
        .unwrap_or(Severity::Unknown);
    let (findings, modules, dependencies) = collect_findings(root, filter.as_ref(), min_severity)?;

    Ok(SecurityAudit {
        findings: findings
            .into_iter()
            .map(|finding| SecurityFinding {
                module: finding.module,
                ecosystem: finding.ecosystem.label().to_string(),
                package: finding.package,
                version: finding.version,
                severity: finding.severity.label(),
                id: finding.id,
                title: finding.title,
                url: finding.url,
                patched: finding.patched,
            })
            .collect(),
        modules,
        dependencies,
    })
}

pub fn run(args: &SecurityCheckArgs) {
    let root = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);

    let filter = build_filter(args.modules.as_deref(), args.packages.as_deref());
    let min_severity = args
        .audit_level
        .as_deref()
        .map(Severity::from_label)
        .unwrap_or(Severity::Unknown);

    let (findings, modules, total_deps) =
        match collect_findings(&root, filter.as_ref(), min_severity) {
            Ok(outcome) => outcome,
            Err(message) => {
                if message.is_empty() {
                    warn("No npm, python, rust, go, ruby or php modules found to audit");
                } else {
                    error(message);
                }
                return;
            }
        };

    if args.issues {
        create_issues(&root, &findings);
    } else {
        print_report(&findings, modules, total_deps);
    }
}

/// Resolve every vulnerability in the workspace. Returns the findings plus the
/// number of audited modules and dependencies. An empty error message means
/// "nothing to audit".
fn collect_findings(
    root: &Path,
    filter: Option<&BTreeSet<String>>,
    min_severity: Severity,
) -> Result<(Vec<Finding>, usize, usize), String> {
    let spinner = Spinner::start("Collecting dependencies");
    let mut modules = collect_modules(root);
    spinner.stop();

    if let Some(filter) = filter {
        modules.retain(|m| filter.contains(m.name.as_str()));
    }

    if modules.is_empty() {
        return Err(String::new());
    }

    let total_deps: usize = modules.iter().map(|m| m.packages.len()).sum();

    // De-duplicate every (ecosystem, name, version) tuple across all modules so
    // a package shared by several modules is queried online only once.
    let mut unique: Vec<PackageKey> = Vec::new();
    let mut index: HashMap<PackageKey, usize> = HashMap::new();
    for module in &modules {
        for package in &module.packages {
            index.entry(package.clone()).or_insert_with(|| {
                unique.push(package.clone());
                unique.len() - 1
            });
        }
    }

    let spinner = Spinner::start(format!(
        "Querying {SOURCE} for {} package{}",
        unique.len(),
        if unique.len() == 1 { "" } else { "s" }
    ));
    let vuln_ids = match osv_query_batch(&unique) {
        Some(ids) => ids,
        None => {
            spinner.stop();
            return Err(format!(
                "Could not reach {SOURCE} — check your network connection and try again"
            ));
        }
    };
    spinner.stop();

    // Resolve advisory details once per unique id.
    let mut all_ids: BTreeSet<String> = BTreeSet::new();
    for ids in &vuln_ids {
        for id in ids {
            all_ids.insert(id.clone());
        }
    }

    let records = if all_ids.is_empty() {
        HashMap::new()
    } else {
        let spinner = Spinner::start(format!(
            "Fetching {} advisor{} from {SOURCE}",
            all_ids.len(),
            if all_ids.len() == 1 { "y" } else { "ies" }
        ));
        let records = fetch_records(&all_ids);
        spinner.stop();
        records
    };

    let mut findings: Vec<Finding> = Vec::new();
    for module in &modules {
        let mut seen: HashSet<(String, String)> = HashSet::new();
        for package in &module.packages {
            let Some(&query_index) = index.get(package) else {
                continue;
            };
            for id in &vuln_ids[query_index] {
                if !seen.insert((package.name.clone(), id.clone())) {
                    continue;
                }
                let record = records.get(id);
                findings.push(build_finding(module, package, id, record));
            }
        }
    }

    findings.retain(|f| f.severity >= min_severity);
    findings.sort_by(|a, b| {
        a.module
            .cmp(&b.module)
            .then_with(|| b.severity.cmp(&a.severity))
            .then_with(|| a.package.cmp(&b.package))
            .then_with(|| a.id.cmp(&b.id))
    });

    Ok((findings, modules.len(), total_deps))
}

fn build_filter(modules: Option<&str>, packages: Option<&str>) -> Option<BTreeSet<String>> {
    let mut set = BTreeSet::new();
    for value in [modules, packages].into_iter().flatten() {
        for name in value.split(',').map(str::trim).filter(|s| !s.is_empty()) {
            set.insert(name.to_string());
        }
    }
    if set.is_empty() { None } else { Some(set) }
}

// ---------------------------------------------------------------------------
// Module + dependency discovery
// ---------------------------------------------------------------------------

fn collect_modules(root: &Path) -> Vec<ModuleReport> {
    let mut modules = Vec::new();
    walk(root, root, 0, &mut modules);
    modules.sort_by(|a, b| a.name.cmp(&b.name));
    modules
}

fn walk(root: &Path, dir: &Path, depth: usize, modules: &mut Vec<ModuleReport>) {
    let mut packages = collect_packages(dir);
    if !packages.is_empty() {
        packages.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.version.cmp(&b.version)));
        packages.dedup_by(|a, b| {
            a.ecosystem == b.ecosystem && a.name == b.name && a.version == b.version
        });
        modules.push(ModuleReport {
            name: target_name(root, dir),
            dir: dir.to_path_buf(),
            packages,
        });
    }

    if depth >= MAX_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.starts_with('.') || EXCLUDED_DIRS.contains(&name) {
            continue;
        }
        walk(root, &path, depth + 1, modules);
    }
}

fn collect_packages(dir: &Path) -> Vec<PackageKey> {
    let mut packages = Vec::new();
    packages.extend(parse_bun_lock(dir));
    packages.extend(parse_package_lock(dir));
    packages.extend(parse_cargo_lock(dir));
    packages.extend(parse_requirements_txt(dir));
    packages.extend(parse_pipfile_lock(dir));
    packages.extend(parse_poetry_lock(dir));
    packages.extend(parse_go_sum(dir));
    packages.extend(parse_gemfile_lock(dir));
    packages.extend(parse_composer_lock(dir));
    packages
}

fn target_name(root: &Path, dir: &Path) -> String {
    let Ok(rel) = dir.strip_prefix(root) else {
        return dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("root")
            .to_string();
    };
    let components: Vec<String> = rel
        .components()
        .filter_map(|c| c.as_os_str().to_str().map(str::to_string))
        .collect();
    if components.is_empty() {
        return root_package_name(root);
    }
    if components.len() >= 2 && (components[0] == "modules" || components[0] == "packages") {
        return components[1].clone();
    }
    components
        .last()
        .cloned()
        .unwrap_or_else(|| root_package_name(root))
}

fn root_package_name(root: &Path) -> String {
    fs::read_to_string(root.join("package.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|value| {
            value
                .get("name")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            root.file_name()
                .and_then(|name| name.to_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "root".to_string())
}

// ---------------------------------------------------------------------------
// Lockfile parsers — each returns the resolved (name, version) it can extract
// ---------------------------------------------------------------------------

fn read(dir: &Path, file: &str) -> Option<String> {
    fs::read_to_string(dir.join(file)).ok()
}

fn npm(name: &str, version: &str) -> PackageKey {
    PackageKey {
        ecosystem: Ecosystem::Npm,
        name: name.to_string(),
        version: version.to_string(),
    }
}

/// `bun.lock` (text lockfile). Its `packages` map holds one `name@version`
/// string per resolved dependency, covering the full transitive npm tree.
fn parse_bun_lock(dir: &Path) -> Vec<PackageKey> {
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
fn parse_package_lock(dir: &Path) -> Vec<PackageKey> {
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

/// `Cargo.lock` — TOML with `[[package]]` blocks, each carrying `name`/`version`.
fn parse_cargo_lock(dir: &Path) -> Vec<PackageKey> {
    let Some(raw) = read(dir, "Cargo.lock") else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let mut name: Option<String> = None;
    for line in raw.lines() {
        let line = line.trim();
        if line == "[[package]]" {
            name = None;
        } else if let Some(value) = line.strip_prefix("name = ") {
            name = Some(unquote(value));
        } else if let Some(value) = line.strip_prefix("version = ")
            && let Some(name) = name.take()
        {
            out.push(PackageKey {
                ecosystem: Ecosystem::Crates,
                name,
                version: unquote(value),
            });
        }
    }
    out
}

/// `requirements.txt` — only fully pinned `name==version` lines are auditable.
fn parse_requirements_txt(dir: &Path) -> Vec<PackageKey> {
    let Some(raw) = read(dir, "requirements.txt") else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for line in raw.lines() {
        let line = line.split('#').next().unwrap_or("").trim();
        if line.is_empty() || line.starts_with('-') {
            continue;
        }
        let Some((name, rest)) = line.split_once("==") else {
            continue;
        };
        let version = rest
            .split([';', ' ', '\t'])
            .next()
            .unwrap_or("")
            .trim()
            .trim_end_matches('\\');
        let name = name.split('[').next().unwrap_or("").trim();
        if !name.is_empty() && !version.is_empty() {
            out.push(PackageKey {
                ecosystem: Ecosystem::PyPI,
                name: name.to_string(),
                version: version.to_string(),
            });
        }
    }
    out
}

/// `Pipfile.lock` — JSON with `default`/`develop` maps of `name -> { version }`.
fn parse_pipfile_lock(dir: &Path) -> Vec<PackageKey> {
    let Some(raw) = read(dir, "Pipfile.lock") else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&raw) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for section in ["default", "develop"] {
        let Some(map) = value.get(section).and_then(Value::as_object) else {
            continue;
        };
        for (name, meta) in map {
            if let Some(version) = meta.get("version").and_then(Value::as_str) {
                let version = version.trim_start_matches("==").trim();
                if !version.is_empty() {
                    out.push(PackageKey {
                        ecosystem: Ecosystem::PyPI,
                        name: name.clone(),
                        version: version.to_string(),
                    });
                }
            }
        }
    }
    out
}

/// `poetry.lock` — TOML with `[[package]]` blocks (`name`/`version`).
fn parse_poetry_lock(dir: &Path) -> Vec<PackageKey> {
    let Some(raw) = read(dir, "poetry.lock") else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let mut name: Option<String> = None;
    let mut in_package = false;
    for line in raw.lines() {
        let line = line.trim();
        if line == "[[package]]" {
            in_package = true;
            name = None;
        } else if line.starts_with('[') && line != "[[package]]" {
            in_package = false;
        } else if in_package {
            if let Some(value) = line.strip_prefix("name = ") {
                name = Some(unquote(value));
            } else if let Some(value) = line.strip_prefix("version = ")
                && let Some(name) = name.take()
            {
                out.push(PackageKey {
                    ecosystem: Ecosystem::PyPI,
                    name,
                    version: unquote(value),
                });
            }
        }
    }
    out
}

/// `go.sum` — lines `module version[/go.mod] hash`.
fn parse_go_sum(dir: &Path) -> Vec<PackageKey> {
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
fn parse_gemfile_lock(dir: &Path) -> Vec<PackageKey> {
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
        if in_specs {
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
            if let Some((name, rest)) = trimmed.split_once(" (") {
                let version = rest.trim_end_matches(')');
                if !version.is_empty() && version.chars().next().is_some_and(|c| c.is_ascii_digit())
                {
                    out.push(PackageKey {
                        ecosystem: Ecosystem::RubyGems,
                        name: name.to_string(),
                        version: version.to_string(),
                    });
                }
            }
        }
    }
    out
}

/// `composer.lock` — JSON with `packages`/`packages-dev` arrays of `{name,version}`.
fn parse_composer_lock(dir: &Path) -> Vec<PackageKey> {
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

fn split_name_version(descriptor: &str) -> Option<(String, String)> {
    let at = descriptor.rfind('@').filter(|&i| i > 0)?;
    Some((
        descriptor[..at].to_string(),
        descriptor[at + 1..].to_string(),
    ))
}

fn unquote(value: &str) -> String {
    value.trim().trim_matches('"').to_string()
}

// ---------------------------------------------------------------------------
// OSV.dev online client
// ---------------------------------------------------------------------------

fn osv_agent() -> ureq::Agent {
    // Trust the operating-system certificate store (macOS keychain, Windows
    // cert store, Linux CA bundle) rather than ureq's bundled Mozilla roots, so
    // the client works behind corporate TLS-inspecting proxies too.
    let config = ureq::Agent::config_builder()
        .tls_config(
            ureq::tls::TlsConfig::builder()
                .root_certs(ureq::tls::RootCerts::PlatformVerifier)
                .build(),
        )
        .build();
    config.into()
}

fn osv_query_batch(packages: &[PackageKey]) -> Option<Vec<Vec<String>>> {
    let agent = osv_agent();
    let mut results: Vec<Vec<String>> = Vec::with_capacity(packages.len());
    for chunk in packages.chunks(OSV_BATCH_SIZE) {
        let queries: Vec<Value> = chunk
            .iter()
            .map(|package| {
                json!({
                    "package": { "name": package.name, "ecosystem": package.ecosystem.osv() },
                    "version": package.version,
                })
            })
            .collect();
        let response: Value = agent
            .post(OSV_QUERY_BATCH_URL)
            .header("Content-Type", "application/json")
            .send_json(json!({ "queries": queries }))
            .ok()?
            .into_body()
            .read_json()
            .ok()?;
        let entries = response.get("results").and_then(Value::as_array)?;
        for entry in entries {
            let ids = entry
                .get("vulns")
                .and_then(Value::as_array)
                .map(|vulns| {
                    vulns
                        .iter()
                        .filter_map(|vuln| vuln.get("id").and_then(Value::as_str))
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default();
            results.push(ids);
        }
    }
    // Guard against a short/misaligned response.
    while results.len() < packages.len() {
        results.push(Vec::new());
    }
    Some(results)
}

fn fetch_records(ids: &BTreeSet<String>) -> HashMap<String, Value> {
    let agent = osv_agent();
    let mut records = HashMap::new();
    for id in ids {
        if let Some(record) = fetch_record(&agent, id) {
            records.insert(id.clone(), record);
        }
    }
    records
}

fn fetch_record(agent: &ureq::Agent, id: &str) -> Option<Value> {
    agent
        .get(format!("{OSV_VULN_URL}/{id}"))
        .call()
        .ok()?
        .into_body()
        .read_json()
        .ok()
}

fn build_finding(
    module: &ModuleReport,
    package: &PackageKey,
    id: &str,
    record: Option<&Value>,
) -> Finding {
    let severity = record
        .map(severity_from_record)
        .unwrap_or(Severity::Unknown);
    let title = record
        .and_then(|r| {
            r.get("summary")
                .and_then(Value::as_str)
                .or_else(|| r.get("details").and_then(Value::as_str))
        })
        .map(str::to_string)
        .unwrap_or_else(|| format!("Known vulnerability in {}", package.name));
    let aliases = record
        .and_then(|r| r.get("aliases").and_then(Value::as_array))
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .filter(|alias| alias.starts_with("CVE"))
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();
    let patched = record
        .map(|r| fixed_versions(r, package))
        .unwrap_or_default();

    Finding {
        module: module.name.clone(),
        module_dir: module.dir.clone(),
        ecosystem: package.ecosystem,
        package: package.name.clone(),
        version: package.version.clone(),
        severity,
        id: id.to_string(),
        title,
        url: format!("https://osv.dev/vulnerability/{id}"),
        aliases,
        patched,
    }
}

fn severity_from_record(record: &Value) -> Severity {
    if let Some(label) = record
        .get("database_specific")
        .and_then(|d| d.get("severity"))
        .and_then(Value::as_str)
    {
        let severity = Severity::from_label(label);
        if severity != Severity::Unknown {
            return severity;
        }
    }

    let mut best = Severity::Unknown;
    if let Some(entries) = record.get("severity").and_then(Value::as_array) {
        for entry in entries {
            let Some(score) = entry.get("score").and_then(Value::as_str) else {
                continue;
            };
            let severity = if let Ok(numeric) = score.parse::<f64>() {
                Severity::from_cvss(numeric)
            } else if let Some(numeric) = cvss3_base_score(score) {
                Severity::from_cvss(numeric)
            } else {
                Severity::Unknown
            };
            if severity > best {
                best = severity;
            }
        }
    }
    best
}

fn fixed_versions(record: &Value, package: &PackageKey) -> String {
    let mut fixed: Vec<String> = Vec::new();
    let Some(affected) = record.get("affected").and_then(Value::as_array) else {
        return String::new();
    };
    for entry in affected {
        let name = entry
            .get("package")
            .and_then(|p| p.get("name"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        let ecosystem = entry
            .get("package")
            .and_then(|p| p.get("ecosystem"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        if name != package.name || !ecosystem.starts_with(package.ecosystem.osv()) {
            continue;
        }
        if let Some(ranges) = entry.get("ranges").and_then(Value::as_array) {
            for range in ranges {
                if let Some(events) = range.get("events").and_then(Value::as_array) {
                    for event in events {
                        if let Some(version) = event.get("fixed").and_then(Value::as_str) {
                            fixed.push(version.to_string());
                        }
                    }
                }
            }
        }
    }
    fixed.sort();
    fixed.dedup();
    fixed.join(", ")
}

/// Compute a CVSS v3.x base score from its vector string. Returns `None` for a
/// malformed vector or a non-v3 (e.g. CVSS v2/v4) string.
fn cvss3_base_score(vector: &str) -> Option<f64> {
    if !vector.starts_with("CVSS:3") {
        return None;
    }
    let mut metrics: HashMap<&str, &str> = HashMap::new();
    for part in vector.split('/') {
        if let Some((key, value)) = part.split_once(':') {
            metrics.insert(key, value);
        }
    }
    let scope_changed = metrics.get("S") == Some(&"C");

    let av = match *metrics.get("AV")? {
        "N" => 0.85,
        "A" => 0.62,
        "L" => 0.55,
        "P" => 0.2,
        _ => return None,
    };
    let ac = match *metrics.get("AC")? {
        "L" => 0.77,
        "H" => 0.44,
        _ => return None,
    };
    let ui = match *metrics.get("UI")? {
        "N" => 0.85,
        "R" => 0.62,
        _ => return None,
    };
    let pr = match *metrics.get("PR")? {
        "N" => 0.85,
        "L" if scope_changed => 0.68,
        "L" => 0.62,
        "H" if scope_changed => 0.5,
        "H" => 0.27,
        _ => return None,
    };
    let impact_of = |value: &str| -> f64 {
        match value {
            "N" => 0.0,
            "L" => 0.22,
            "H" => 0.56,
            _ => 0.0,
        }
    };
    let confidentiality = impact_of(metrics.get("C")?);
    let integrity = impact_of(metrics.get("I")?);
    let availability = impact_of(metrics.get("A")?);

    let iss = 1.0 - ((1.0 - confidentiality) * (1.0 - integrity) * (1.0 - availability));
    let impact = if scope_changed {
        7.52 * (iss - 0.029) - 3.25 * (iss - 0.02).powf(15.0)
    } else {
        6.42 * iss
    };
    if impact <= 0.0 {
        return Some(0.0);
    }
    let exploitability = 8.22 * av * ac * pr * ui;
    let raw = if scope_changed {
        (1.08 * (impact + exploitability)).min(10.0)
    } else {
        (impact + exploitability).min(10.0)
    };
    Some((raw * 10.0).ceil() / 10.0)
}

// ---------------------------------------------------------------------------
// Report + issue output
// ---------------------------------------------------------------------------

fn print_report(findings: &[Finding], modules: usize, dependencies: usize) {
    println!(
        "{}{}",
        style("▸ Security audit").magenta().bold(),
        style(format!(
            "  {modules} module{} · {dependencies} dependenc{} scanned via {SOURCE}",
            if modules == 1 { "" } else { "s" },
            if dependencies == 1 { "y" } else { "ies" },
        ))
        .dim()
    );

    if findings.is_empty() {
        success("No known vulnerabilities found");
        return;
    }

    let mut current_module: Option<&str> = None;
    for finding in findings {
        if current_module != Some(finding.module.as_str()) {
            println!();
            println!(
                "{}  {}",
                style(&finding.module).bold().underlined(),
                style(format!("({})", finding.ecosystem.label())).dim()
            );
            current_module = Some(finding.module.as_str());
        }

        let package = if finding.version.is_empty() {
            finding.package.clone()
        } else {
            format!("{}@{}", finding.package, finding.version)
        };
        println!(
            "  {} {}  {}",
            finding.severity.styled(),
            style(package).bold(),
            truncate(&finding.title, 110)
        );

        let mut meta: Vec<String> = vec![finding.id.clone()];
        if !finding.aliases.is_empty() {
            meta.push(finding.aliases.clone());
        }
        if !finding.patched.is_empty() {
            meta.push(format!("patched {}", finding.patched));
        }
        meta.push(finding.url.clone());
        println!("      {}", style(meta.join("  ·  ")).dim());
    }

    println!();
    print_summary(findings);
}

fn truncate(text: &str, max: usize) -> String {
    let text = text.replace('\n', " ");
    if text.chars().count() <= max {
        return text;
    }
    let truncated: String = text.chars().take(max.saturating_sub(1)).collect();
    format!("{}…", truncated.trim_end())
}

fn print_summary(findings: &[Finding]) {
    let count = |severity: Severity| findings.iter().filter(|f| f.severity == severity).count();
    let mut parts = Vec::new();
    for (severity, label) in [
        (Severity::Critical, "critical"),
        (Severity::High, "high"),
        (Severity::Moderate, "moderate"),
        (Severity::Low, "low"),
        (Severity::Unknown, "unknown"),
    ] {
        let n = count(severity);
        if n > 0 {
            parts.push(format!("{n} {label}"));
        }
    }

    let total = findings.len();
    println!(
        "{} {}",
        style("✖").red().bold(),
        style(format!(
            "{total} vulnerabilit{} ({})",
            if total == 1 { "y" } else { "ies" },
            parts.join(", ")
        ))
        .red()
    );
}

fn create_issues(root: &Path, findings: &[Finding]) {
    if findings.is_empty() {
        success("No known vulnerabilities found — no issues created");
        return;
    }

    let mut created = 0usize;
    for finding in findings {
        let is_root = finding.module_dir == root;
        let module_name = if is_root {
            "shared".to_string()
        } else {
            finding.module.clone()
        };
        let issues_dir = if is_root {
            root.join("modules").join("shared").join("issues")
        } else {
            finding.module_dir.join("issues")
        };
        if let Err(err) = fs::create_dir_all(&issues_dir) {
            error(format!("Failed to create {}: {err}", issues_dir.display()));
            continue;
        }

        let id = generate_issue_id(Some(&issues_dir));
        let yaml = issue_to_yaml(&IssueYaml {
            id: Some(id.clone()),
            module: Some(module_name),
            title: Some(build_issue_title(finding)),
            state: Some("Todo".to_string()),
            priority: Some(finding.severity.priority().to_string()),
            description: Some(build_issue_description(finding)),
            labels: Some(vec!["Security".to_string()]),
        });

        let file_path = issues_dir.join(format!("{id}.yml"));
        if let Err(err) = fs::write(&file_path, yaml) {
            error(format!("Failed to write {}: {err}", file_path.display()));
            continue;
        }
        created += 1;
        success(format!("{} created", file_path.display()));
    }

    println!();
    success(format!(
        "{created} security issue{} created",
        if created == 1 { "" } else { "s" }
    ));
}

fn build_issue_title(finding: &Finding) -> String {
    let package = if finding.version.is_empty() {
        finding.package.clone()
    } else {
        format!("{}@{}", finding.package, finding.version)
    };
    let severity = finding.severity.label().to_ascii_lowercase();
    format!(
        "Fix {severity} {} vulnerability in {package} ({})",
        finding.ecosystem.label(),
        finding.id
    )
}

fn build_issue_description(finding: &Finding) -> String {
    let mut lines = vec![finding.title.clone(), String::new()];
    lines.push(format!("- Ecosystem: {}", finding.ecosystem.label()));
    lines.push(format!("- Source: {SOURCE}"));
    lines.push(format!("- Module: {}", finding.module));
    lines.push(format!("- Package: {}", finding.package));
    if !finding.version.is_empty() {
        lines.push(format!("- Installed version: {}", finding.version));
    }
    lines.push(format!("- Severity: {}", finding.severity.label()));
    lines.push(format!("- Advisory: {}", finding.id));
    if !finding.aliases.is_empty() {
        lines.push(format!("- Aliases: {}", finding.aliases));
    }
    if !finding.patched.is_empty() {
        lines.push(format!("- Patched versions: {}", finding.patched));
    }
    lines.push(format!("- Reference: {}", finding.url));
    lines.join("\n")
}
