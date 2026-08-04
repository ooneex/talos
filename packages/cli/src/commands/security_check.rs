use std::path::{Path, PathBuf};

use clap::Args;
use console::style;

use crate::utils::{Spinner, current_dir, error, warn};

#[path = "security_check/llm.rs"]
pub mod llm;

/// Universal, always-online vulnerability database. A single API covers every
/// ecosystem (npm/react/typescript/node, PyPI, crates.io, Go, RubyGems, …), so
/// no per-language audit binary has to be installed locally.
pub(super) const OSV_QUERY_BATCH_URL: &str = "https://api.osv.dev/v1/querybatch";
pub(super) const OSV_VULN_URL: &str = "https://api.osv.dev/v1/vulns";
pub(super) const OSV_BATCH_SIZE: usize = 1000;
pub(super) const SOURCE: &str = "OSV.dev";

/// Directories that are never descended into while collecting dependencies.
/// Their contents are still covered because every installed dependency (even
/// those under `node_modules`) is pinned in the lockfile at the module root.
pub(super) const EXCLUDED_DIRS: &[&str] = &[
    "node_modules",
    "dist",
    "build",
    "target",
    "var",
    "coverage",
    "__pycache__",
    "site-packages",
    "venv",
    ".git",
    ".temp",
    ".turbo",
    ".cache",
    "vendor",
    ".venv",
    ".tox",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "venv",
    "__pycache__",
];

pub(super) const MAX_DEPTH: usize = 6;

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

    /// Skip the assistant configuration audit (agents, skills, rules, MCP).
    #[arg(long = "skip-llm", default_value_t = false)]
    pub skip_llm: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Severity {
    Unknown,
    Low,
    Moderate,
    High,
    Critical,
}

impl Severity {
    pub fn from_label(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "critical" => Severity::Critical,
            "high" => Severity::High,
            "moderate" | "medium" => Severity::Moderate,
            "low" => Severity::Low,
            _ => Severity::Unknown,
        }
    }

    pub fn from_cvss(score: f64) -> Self {
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

    pub fn label(&self) -> &'static str {
        match self {
            Severity::Critical => "CRITICAL",
            Severity::High => "HIGH",
            Severity::Moderate => "MODERATE",
            Severity::Low => "LOW",
            Severity::Unknown => "UNKNOWN",
        }
    }

    pub fn styled(&self) -> String {
        let label = format!(" {} ", self.label());
        match self {
            Severity::Critical => style(label).white().on_red().bold().to_string(),
            Severity::High => style(label).red().bold().to_string(),
            Severity::Moderate => style(label).yellow().bold().to_string(),
            Severity::Low => style(label).cyan().to_string(),
            Severity::Unknown => style(label).dim().to_string(),
        }
    }

    pub fn priority(&self) -> &'static str {
        match self {
            Severity::Critical | Severity::High => "Urgent",
            Severity::Moderate => "High",
            Severity::Low | Severity::Unknown => "Medium",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Ecosystem {
    Npm,
    PyPI,
    Crates,
    Go,
    RubyGems,
    Packagist,
}

impl Ecosystem {
    /// The exact ecosystem string OSV expects.
    pub fn osv(&self) -> &'static str {
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
    pub fn label(&self) -> &'static str {
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

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct PackageKey {
    pub ecosystem: Ecosystem,
    pub name: String,
    pub version: String,
}

/// Where a finding comes from: a resolved dependency, or the configuration a
/// coding assistant executes as instructions.
#[derive(Clone, Debug)]
pub enum Origin {
    Dependency(Ecosystem),
    Assistant(String),
}

impl Origin {
    /// Lower-case label shown in the report (`npm`, `claude`, …).
    pub fn label(&self) -> String {
        match self {
            Origin::Dependency(ecosystem) => ecosystem.label().to_string(),
            Origin::Assistant(assistant) => assistant.to_ascii_lowercase(),
        }
    }

    /// The assistant display name, when the finding comes from one.
    pub fn assistant(&self) -> Option<&str> {
        match self {
            Origin::Dependency(_) => None,
            Origin::Assistant(assistant) => Some(assistant),
        }
    }
}

pub struct ModuleReport {
    pub name: String,
    pub dir: PathBuf,
    pub packages: Vec<PackageKey>,
}

pub struct Finding {
    pub module: String,
    pub module_dir: PathBuf,
    pub origin: Origin,
    /// The vulnerable package, or the `file:line` holding the risky instruction.
    pub subject: String,
    pub version: String,
    pub severity: Severity,
    pub id: String,
    pub title: String,
    pub url: String,
    pub aliases: String,
    /// Patched versions for a dependency, remediation advice for an assistant.
    pub remediation: String,
    /// The offending line, for assistant findings.
    pub evidence: String,
}

/// A vulnerability exposed to other commands, free of the private types the
/// audit uses internally.
#[derive(Clone, Debug)]
pub struct SecurityFinding {
    pub module: String,
    /// `npm`, `pypi`, … for a dependency, or the assistant name for an
    /// instruction finding.
    pub source: String,
    /// The package name, or the `file:line` holding the risky instruction.
    pub subject: String,
    pub version: String,
    pub severity: &'static str,
    pub id: String,
    pub title: String,
    pub url: String,
    /// Patched versions for a dependency, remediation advice for an assistant.
    pub remediation: String,
}

/// Outcome of an audit, kept free of process exits and printing so it can be
/// embedded in aggregated reports such as `project:check`.
#[derive(Clone, Debug, Default)]
pub struct SecurityAudit {
    pub findings: Vec<SecurityFinding>,
    pub modules: usize,
    pub dependencies: usize,
    /// Assistant agent, skill, rule and MCP files scanned.
    pub llm_files: usize,
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
    audit_at(root, modules, packages, audit_level, None)
}

/// The same audit against another OSV host — a mirror, or a stub standing in
/// for the public API.
pub fn audit_at(
    root: &Path,
    modules: Option<&str>,
    packages: Option<&str>,
    audit_level: Option<&str>,
    base: Option<&str>,
) -> Result<SecurityAudit, String> {
    let filter = build_filter(modules, packages);
    let min_severity = audit_level
        .map(Severity::from_label)
        .unwrap_or(Severity::Unknown);
    let (llm_findings, llm_files) = collect_llm_findings(root, filter.as_ref(), min_severity);
    let (mut findings, modules, dependencies) =
        match collect_findings(root, filter.as_ref(), min_severity, base) {
            Ok(outcome) => outcome,
            // A missing lockfile must not hide the assistant configuration
            // findings, which need neither a lockfile nor the network.
            Err(message) if message.is_empty() && llm_files > 0 => (Vec::new(), 0, 0),
            Err(message) => return Err(message),
        };
    findings.extend(llm_findings);
    sort_findings(&mut findings);

    Ok(SecurityAudit {
        findings: findings
            .into_iter()
            .map(|finding| SecurityFinding {
                module: finding.module,
                source: finding.origin.label(),
                subject: finding.subject,
                version: finding.version,
                severity: finding.severity.label(),
                id: finding.id,
                title: finding.title,
                url: finding.url,
                remediation: finding.remediation,
            })
            .collect(),
        modules,
        dependencies,
        llm_files,
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

    let (llm_findings, llm_files) = if args.skip_llm {
        (Vec::new(), 0)
    } else {
        let spinner = Spinner::start("Scanning assistant agents and skills");
        let outcome = collect_llm_findings(&root, filter.as_ref(), min_severity);
        spinner.stop();
        outcome
    };

    let (mut findings, modules, total_deps) =
        match collect_findings(&root, filter.as_ref(), min_severity, None) {
            Ok(outcome) => outcome,
            Err(message) => {
                if llm_files == 0 {
                    if message.is_empty() {
                        warn("No npm, python, rust, go, ruby or php modules found to audit");
                    } else {
                        error(message);
                    }
                    return;
                }
                if message.is_empty() {
                    warn("No lockfile found — auditing assistant configuration only");
                } else {
                    warn(format!("{message} — auditing assistant configuration only"));
                }
                (Vec::new(), 0, 0)
            }
        };

    findings.extend(llm_findings);
    sort_findings(&mut findings);

    if args.issues {
        create_issues(&root, &findings);
    } else {
        print_report(&findings, modules, total_deps, llm_files);
    }
}

#[path = "security_check/discovery.rs"]
mod discovery;
pub use discovery::{collect_modules, collect_packages, root_package_name, target_name, walk};

#[path = "security_check/findings.rs"]
mod findings;
pub use findings::{build_filter, sort_findings};
use findings::{collect_findings, collect_llm_findings};

#[path = "security_check/lockfiles.rs"]
mod lockfiles;
pub use lockfiles::{
    npm, parse_bun_lock, parse_cargo_lock, parse_composer_lock, parse_gemfile_lock, parse_go_sum,
    parse_package_lock, parse_pep_lock, parse_pipfile_lock, parse_poetry_lock,
    parse_requirements_txt, parse_uv_lock, split_name_version, unquote,
};

#[path = "security_check/osv.rs"]
mod osv;
pub use osv::{build_finding, cvss3_base_score, fixed_versions, severity_from_record};

#[path = "security_check/report.rs"]
mod report;
pub use report::{build_issue_description, build_issue_title, truncate};
use report::{create_issues, print_report};
