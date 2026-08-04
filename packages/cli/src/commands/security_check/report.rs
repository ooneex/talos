// Console report rendering and issue-creation output — split out of the
// parent module to keep it under the file-size budget.

use std::fs;
use std::path::Path;

use console::style;

use super::{Finding, SOURCE, Severity};
use crate::utils::{IssueYaml, error, generate_issue_id, issue_to_yaml, success};

// ---------------------------------------------------------------------------
// Report + issue output
// ---------------------------------------------------------------------------

pub(super) fn print_report(
    findings: &[Finding],
    modules: usize,
    dependencies: usize,
    llm_files: usize,
) {
    let mut scope: Vec<String> = Vec::new();
    if modules > 0 || dependencies > 0 {
        scope.push(format!(
            "{modules} module{}",
            if modules == 1 { "" } else { "s" }
        ));
        scope.push(format!(
            "{dependencies} dependenc{} scanned via {SOURCE}",
            if dependencies == 1 { "y" } else { "ies" }
        ));
    }
    if llm_files > 0 {
        scope.push(format!(
            "{llm_files} assistant file{} scanned",
            if llm_files == 1 { "" } else { "s" }
        ));
    }

    println!(
        "{}{}",
        style("▸ Security audit").magenta().bold(),
        style(format!("  {}", scope.join(" · "))).dim()
    );

    if findings.is_empty() {
        success("No known vulnerabilities found");
        return;
    }

    let mut current_module: Option<&str> = None;
    for finding in findings {
        if current_module != Some(finding.module.as_str()) {
            println!();
            println!("{}", style(&finding.module).bold().underlined());
            current_module = Some(finding.module.as_str());
        }

        let subject = if finding.version.is_empty() {
            finding.subject.clone()
        } else {
            format!("{}@{}", finding.subject, finding.version)
        };
        println!(
            "  {} {}  {}",
            finding.severity.styled(),
            style(subject).bold(),
            truncate(&finding.title, 110)
        );

        if !finding.evidence.is_empty() {
            println!(
                "      {}",
                style(format!("↳ {}", truncate(&finding.evidence, 110))).dim()
            );
        }

        let mut meta: Vec<String> = vec![finding.origin.label(), finding.id.clone()];
        if !finding.aliases.is_empty() {
            meta.push(finding.aliases.clone());
        }
        if !finding.remediation.is_empty() {
            meta.push(if finding.origin.assistant().is_some() {
                truncate(&finding.remediation, 90)
            } else {
                format!("patched {}", finding.remediation)
            });
        }
        meta.push(finding.url.clone());
        println!("      {}", style(meta.join("  ·  ")).dim());
    }

    println!();
    print_summary(findings);
}

pub fn truncate(text: &str, max: usize) -> String {
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

pub(super) fn create_issues(root: &Path, findings: &[Finding]) {
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

pub fn build_issue_title(finding: &Finding) -> String {
    let severity = finding.severity.label().to_ascii_lowercase();

    if let Some(assistant) = finding.origin.assistant() {
        return format!(
            "Fix {severity} {} instruction risk in {} ({})",
            assistant.to_ascii_lowercase(),
            finding.subject,
            finding.id
        );
    }

    let package = if finding.version.is_empty() {
        finding.subject.clone()
    } else {
        format!("{}@{}", finding.subject, finding.version)
    };
    format!(
        "Fix {severity} {} vulnerability in {package} ({})",
        finding.origin.label(),
        finding.id
    )
}

pub fn build_issue_description(finding: &Finding) -> String {
    let mut lines = vec![finding.title.clone(), String::new()];

    if let Some(assistant) = finding.origin.assistant() {
        lines.push("- Source: LLM configuration audit".to_string());
        lines.push(format!("- Assistant: {assistant}"));
        lines.push(format!("- Module: {}", finding.module));
        lines.push(format!("- File: {}", finding.subject));
        lines.push(format!("- Severity: {}", finding.severity.label()));
        lines.push(format!("- Rule: {}", finding.id));
        if !finding.aliases.is_empty() {
            lines.push(format!("- Occurrences: {}", finding.aliases));
        }
        if !finding.evidence.is_empty() {
            lines.push(format!("- Evidence: `{}`", finding.evidence));
        }
        if !finding.remediation.is_empty() {
            lines.push(format!("- Fix: {}", finding.remediation));
        }
        lines.push(format!("- Reference: {}", finding.url));
        return lines.join("\n");
    }

    lines.push(format!("- Ecosystem: {}", finding.origin.label()));
    lines.push(format!("- Source: {SOURCE}"));
    lines.push(format!("- Module: {}", finding.module));
    lines.push(format!("- Package: {}", finding.subject));
    if !finding.version.is_empty() {
        lines.push(format!("- Installed version: {}", finding.version));
    }
    lines.push(format!("- Severity: {}", finding.severity.label()));
    lines.push(format!("- Advisory: {}", finding.id));
    if !finding.aliases.is_empty() {
        lines.push(format!("- Aliases: {}", finding.aliases));
    }
    if !finding.remediation.is_empty() {
        lines.push(format!("- Patched versions: {}", finding.remediation));
    }
    lines.push(format!("- Reference: {}", finding.url));
    lines.join("\n")
}
