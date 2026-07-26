use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use clap::Args;
use console::style;
use serde_json::Value;

use crate::utils::{
    IssueYaml, Spinner, current_dir, error, generate_issue_id, issue_to_yaml, success, warn,
};

/// Directories that are never descended into while discovering audit targets.
/// Their contents are still covered by the ecosystem audit tools through the
/// lockfiles at the target root (e.g. `bun audit` scans every installed
/// dependency listed in `bun.lock`, including those under `node_modules`).
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
            Severity::Low => "Medium",
            Severity::Unknown => "Medium",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Ecosystem {
    Bun,
    Rust,
    Python,
}

impl Ecosystem {
    fn label(&self) -> &'static str {
        match self {
            Ecosystem::Bun => "bun",
            Ecosystem::Rust => "rust",
            Ecosystem::Python => "python",
        }
    }

    fn tool(&self) -> &'static str {
        match self {
            Ecosystem::Bun => "bun",
            Ecosystem::Rust => "cargo-audit",
            Ecosystem::Python => "pip-audit",
        }
    }
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
    affected: String,
    patched: String,
}

struct Target {
    /// Display name of the audited module/package (the folder name under
    /// `modules/` or `packages/`, or the root package name for the workspace root).
    module: String,
    dir: PathBuf,
    ecosystem: Ecosystem,
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

    let spinner = Spinner::start("Discovering audit targets");
    let mut targets = discover_targets(&root);
    spinner.stop();

    if let Some(filter) = &filter {
        targets.retain(|t| filter.contains(t.module.as_str()));
    }

    if targets.is_empty() {
        warn("No bun, rust or python modules found to audit");
        return;
    }

    let mut findings: Vec<Finding> = Vec::new();
    let mut missing_tools: BTreeSet<&'static str> = BTreeSet::new();
    let mut scanned = 0usize;

    for target in &targets {
        let spinner = Spinner::start(format!(
            "Auditing {} ({})",
            target.module,
            target.ecosystem.label()
        ));
        let outcome = audit_target(target);
        spinner.stop();

        match outcome {
            AuditOutcome::Ok(mut found) => {
                scanned += 1;
                findings.append(&mut found);
            }
            AuditOutcome::ToolMissing(tool) => {
                missing_tools.insert(tool);
            }
            AuditOutcome::Skipped => {
                scanned += 1;
            }
        }
    }

    findings.retain(|f| f.severity >= min_severity);
    findings.sort_by(|a, b| {
        a.module
            .cmp(&b.module)
            .then_with(|| b.severity.cmp(&a.severity))
            .then_with(|| a.package.cmp(&b.package))
    });

    for tool in &missing_tools {
        warn(format!(
            "\"{tool}\" is not installed — related modules were skipped"
        ));
    }

    if args.issues {
        create_issues(&root, &findings);
    } else {
        print_report(&findings, scanned);
    }
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

fn discover_targets(root: &Path) -> Vec<Target> {
    let mut targets = Vec::new();
    walk(root, root, 0, &mut targets);
    targets.sort_by(|a, b| a.module.cmp(&b.module));
    targets
}

fn walk(root: &Path, dir: &Path, depth: usize, targets: &mut Vec<Target>) {
    let module = target_name(root, dir);

    if dir.join("bun.lock").is_file() || dir.join("bun.lockb").is_file() {
        targets.push(Target {
            module: module.clone(),
            dir: dir.to_path_buf(),
            ecosystem: Ecosystem::Bun,
        });
    }
    if dir.join("Cargo.toml").is_file() {
        targets.push(Target {
            module: module.clone(),
            dir: dir.to_path_buf(),
            ecosystem: Ecosystem::Rust,
        });
    }
    if dir.join("requirements.txt").is_file()
        || dir.join("pyproject.toml").is_file()
        || dir.join("Pipfile").is_file()
    {
        targets.push(Target {
            module,
            dir: dir.to_path_buf(),
            ecosystem: Ecosystem::Python,
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
        if name.starts_with('.') && name != "." || EXCLUDED_DIRS.contains(&name) {
            continue;
        }
        walk(root, &path, depth + 1, targets);
    }
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

enum AuditOutcome {
    Ok(Vec<Finding>),
    ToolMissing(&'static str),
    Skipped,
}

fn audit_target(target: &Target) -> AuditOutcome {
    match target.ecosystem {
        Ecosystem::Bun => audit_bun(target),
        Ecosystem::Rust => audit_rust(target),
        Ecosystem::Python => audit_python(target),
    }
}

fn tool_available(program: &str, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn run_json(dir: &Path, program: &str, args: &[&str]) -> Result<Option<Value>, std::io::Error> {
    let output = Command::new(program).args(args).current_dir(dir).output()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let start = trimmed.find(['{', '[']);
    let Some(start) = start else {
        return Ok(None);
    };
    Ok(serde_json::from_str::<Value>(&trimmed[start..]).ok())
}

fn audit_bun(target: &Target) -> AuditOutcome {
    let value = match run_json(&target.dir, "bun", &["audit", "--json"]) {
        Ok(Some(value)) => value,
        Ok(None) => return AuditOutcome::Skipped,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return AuditOutcome::ToolMissing("bun");
        }
        Err(_) => return AuditOutcome::Skipped,
    };

    let Some(map) = value.as_object() else {
        return AuditOutcome::Skipped;
    };

    let mut findings = Vec::new();
    for (package, advisories) in map {
        let Some(list) = advisories.as_array() else {
            continue;
        };
        for advisory in list {
            let severity = advisory
                .get("severity")
                .and_then(Value::as_str)
                .map(Severity::from_label)
                .unwrap_or(Severity::Unknown);
            let id = advisory.get("id").map(value_to_string).unwrap_or_default();
            findings.push(Finding {
                module: target.module.clone(),
                module_dir: target.dir.clone(),
                ecosystem: Ecosystem::Bun,
                package: package.clone(),
                version: String::new(),
                severity,
                id,
                title: string_field(advisory, "title"),
                url: string_field(advisory, "url"),
                affected: string_field(advisory, "vulnerable_versions"),
                patched: String::new(),
            });
        }
    }
    AuditOutcome::Ok(findings)
}

fn audit_rust(target: &Target) -> AuditOutcome {
    if !tool_available("cargo", &["audit", "--version"]) {
        return AuditOutcome::ToolMissing("cargo-audit");
    }
    let value = match run_json(&target.dir, "cargo", &["audit", "--json"]) {
        Ok(Some(value)) => value,
        Ok(None) => return AuditOutcome::Skipped,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return AuditOutcome::ToolMissing("cargo-audit");
        }
        Err(_) => return AuditOutcome::Skipped,
    };

    if is_cargo_audit_missing(&value) {
        return AuditOutcome::ToolMissing("cargo-audit");
    }

    let list = value
        .get("vulnerabilities")
        .and_then(|v| v.get("list"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut findings = Vec::new();
    for item in &list {
        let advisory = item.get("advisory").cloned().unwrap_or(Value::Null);
        let package = item.get("package").cloned().unwrap_or(Value::Null);
        let severity = advisory
            .get("cvss")
            .and_then(Value::as_str)
            .and_then(parse_cvss_score)
            .map(Severity::from_cvss)
            .unwrap_or(Severity::Unknown);
        let patched = item
            .get("versions")
            .and_then(|v| v.get("patched"))
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_default();
        findings.push(Finding {
            module: target.module.clone(),
            module_dir: target.dir.clone(),
            ecosystem: Ecosystem::Rust,
            package: string_field(&package, "name"),
            version: string_field(&package, "version"),
            severity,
            id: string_field(&advisory, "id"),
            title: string_field(&advisory, "title"),
            url: string_field(&advisory, "url"),
            affected: String::new(),
            patched,
        });
    }
    AuditOutcome::Ok(findings)
}

fn audit_python(target: &Target) -> AuditOutcome {
    if !tool_available("pip-audit", &["--version"]) {
        return AuditOutcome::ToolMissing("pip-audit");
    }
    let mut args = vec!["--format", "json", "--progress-spinner", "off"];
    let requirements = target.dir.join("requirements.txt");
    if requirements.is_file() {
        args.push("-r");
        args.push("requirements.txt");
    }

    let value = match run_json(&target.dir, "pip-audit", &args) {
        Ok(Some(value)) => value,
        Ok(None) => return AuditOutcome::Skipped,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return AuditOutcome::ToolMissing("pip-audit");
        }
        Err(_) => return AuditOutcome::Skipped,
    };

    let dependencies = value
        .get("dependencies")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut findings = Vec::new();
    for dependency in &dependencies {
        let name = string_field(dependency, "name");
        let version = string_field(dependency, "version");
        let Some(vulns) = dependency.get("vulns").and_then(Value::as_array) else {
            continue;
        };
        for vuln in vulns {
            let aliases = vuln
                .get("aliases")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            let id = string_field(vuln, "id");
            let url = if id.starts_with("GHSA") {
                format!("https://github.com/advisories/{id}")
            } else if id.starts_with("CVE") {
                format!("https://nvd.nist.gov/vuln/detail/{id}")
            } else {
                format!("https://osv.dev/vulnerability/{id}")
            };
            let patched = vuln
                .get("fix_versions")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            let severity = vuln
                .get("severity")
                .and_then(Value::as_str)
                .map(Severity::from_label)
                .unwrap_or(Severity::Unknown);
            let title = string_field(vuln, "description");
            let title = if title.is_empty() {
                if aliases.is_empty() {
                    format!("Known vulnerability in {name}")
                } else {
                    aliases.clone()
                }
            } else {
                title
            };
            findings.push(Finding {
                module: target.module.clone(),
                module_dir: target.dir.clone(),
                ecosystem: Ecosystem::Python,
                package: name.clone(),
                version: version.clone(),
                severity,
                id,
                title,
                url,
                affected: String::new(),
                patched,
            });
        }
    }
    AuditOutcome::Ok(findings)
}

fn is_cargo_audit_missing(value: &Value) -> bool {
    value
        .get("error")
        .and_then(Value::as_str)
        .map(|e| e.contains("no such subcommand"))
        .unwrap_or(false)
}

fn parse_cvss_score(vector: &str) -> Option<f64> {
    vector.trim().parse::<f64>().ok()
}

fn string_field(value: &Value, key: &str) -> String {
    value.get(key).map(value_to_string).unwrap_or_default()
}

fn value_to_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn print_report(findings: &[Finding], scanned: usize) {
    println!(
        "{}{}",
        style("▸ Security audit").magenta().bold(),
        style(format!(
            "  {scanned} module{} scanned",
            if scanned == 1 { "" } else { "s" }
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
            truncate(&finding.title, 120)
        );

        let mut meta: Vec<String> = Vec::new();
        if !finding.id.is_empty() {
            meta.push(finding.id.clone());
        }
        if !finding.affected.is_empty() {
            meta.push(format!("affected {}", finding.affected));
        }
        if !finding.patched.is_empty() {
            meta.push(format!("patched {}", finding.patched));
        }
        if !finding.url.is_empty() {
            meta.push(finding.url.clone());
        }
        if !meta.is_empty() {
            println!("      {}", style(meta.join("  ·  ")).dim());
        }
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
    let critical = count(Severity::Critical);
    let high = count(Severity::High);
    let moderate = count(Severity::Moderate);
    let low = count(Severity::Low);
    let unknown = count(Severity::Unknown);

    let mut parts = Vec::new();
    for (n, label) in [
        (critical, "critical"),
        (high, "high"),
        (moderate, "moderate"),
        (low, "low"),
        (unknown, "unknown"),
    ] {
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
        let title = build_issue_title(finding);
        let description = build_issue_description(finding);
        let yaml = issue_to_yaml(&IssueYaml {
            id: Some(id.clone()),
            module: Some(module_name),
            title: Some(title),
            state: Some("Todo".to_string()),
            priority: Some(finding.severity.priority().to_string()),
            description: Some(description),
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
    if finding.id.is_empty() {
        format!(
            "Fix {severity} {} vulnerability in {package}",
            finding.ecosystem.label()
        )
    } else {
        format!(
            "Fix {severity} {} vulnerability in {package} ({})",
            finding.ecosystem.label(),
            finding.id
        )
    }
}

fn build_issue_description(finding: &Finding) -> String {
    let mut lines = Vec::new();
    lines.push(finding.title.clone());
    lines.push(String::new());
    lines.push(format!("- Ecosystem: {}", finding.ecosystem.label()));
    lines.push(format!("- Tool: {}", finding.ecosystem.tool()));
    lines.push(format!("- Module: {}", finding.module));
    lines.push(format!("- Package: {}", finding.package));
    if !finding.version.is_empty() {
        lines.push(format!("- Installed version: {}", finding.version));
    }
    lines.push(format!("- Severity: {}", finding.severity.label()));
    if !finding.id.is_empty() {
        lines.push(format!("- Advisory: {}", finding.id));
    }
    if !finding.affected.is_empty() {
        lines.push(format!("- Affected versions: {}", finding.affected));
    }
    if !finding.patched.is_empty() {
        lines.push(format!("- Patched versions: {}", finding.patched));
    }
    if !finding.url.is_empty() {
        lines.push(format!("- Reference: {}", finding.url));
    }
    lines.join("\n")
}
