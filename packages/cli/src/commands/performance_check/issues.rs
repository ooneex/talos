//! Turning the modules that miss the threshold into `Todo`/`Performance`
//! issue YAML files, one per module, each naming the symbols to look at and
//! what each of them costs.

use std::fs;

use crate::commands::coverage::trim_percent;
use crate::utils::{IssueYaml, error, generate_issue_id, issue_to_yaml, success};

use super::report::group;
use super::rules::Severity;
use super::{MAX_HOTSPOTS, ModulePerformance, PerformanceAudit};

pub(super) fn create_issues(audit: &PerformanceAudit) {
    let targets = audit.under();

    if targets.is_empty() {
        success(format!(
            "Every module clears {} — no issues created",
            trim_percent(audit.threshold)
        ));
        return;
    }

    let mut created = 0usize;
    for module in targets {
        let issues_dir = module.dir.join("issues");
        if let Err(err) = fs::create_dir_all(&issues_dir) {
            error(format!("Failed to create {}: {err}", issues_dir.display()));
            continue;
        }

        let id = generate_issue_id(Some(&issues_dir));
        let yaml = issue_to_yaml(&IssueYaml {
            id: Some(id.clone()),
            module: Some(module.name.clone()),
            title: Some(build_issue_title(module, audit.threshold)),
            state: Some("Todo".to_string()),
            priority: Some(priority(module).to_string()),
            description: Some(build_issue_description(module, audit.threshold)),
            labels: Some(vec!["Performance".to_string()]),
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
        "{created} performance issue{} created",
        if created == 1 { "" } else { "s" }
    ));
}

/// How urgent the work is: the worst thing the module trips decides, because
/// a query in a loop is a different kind of problem from a long function.
pub fn priority(module: &ModulePerformance) -> &'static str {
    module
        .leaves()
        .flat_map(|symbol| symbol.findings.iter())
        .map(|finding| finding.rule.severity)
        .max()
        .map(Severity::priority)
        .unwrap_or("Medium")
}

pub fn build_issue_title(module: &ModulePerformance, threshold: f64) -> String {
    let hotspots = module.hotspots(threshold).len();
    format!(
        "Fix {hotspots} performance hotspot{} in {} (scores {}, under {})",
        if hotspots == 1 { "" } else { "s" },
        module.name,
        trim_percent(module.score()),
        trim_percent(threshold)
    )
}

pub fn build_issue_description(module: &ModulePerformance, threshold: f64) -> String {
    let hotspots = module.hotspots(threshold);
    let mut lines = vec![
        format!(
            "{} scores {} out of 100 against the performance rules, under the {} threshold.",
            module.label,
            trim_percent(module.score()),
            trim_percent(threshold)
        ),
        String::new(),
        format!("- Module: {}", module.label),
        format!("- Score: {}", trim_percent(module.score())),
        format!("- Threshold: {}", trim_percent(threshold)),
        format!(
            "- Symbols scored: {} ({} file{})",
            module.leaves().count(),
            module.files,
            if module.files == 1 { "" } else { "s" }
        ),
        format!("- Findings: {}", module.findings()),
        format!(
            "- Command: `talos performance:check --modules={} --logs`",
            module.name
        ),
    ];

    if hotspots.is_empty() {
        return lines.join("\n");
    }

    lines.push(String::new());
    lines.push("Slowest symbols:".to_string());
    for symbol in hotspots.iter().take(MAX_HOTSPOTS) {
        lines.push(format!(
            "- `{}` — {} in `{}:{}`",
            symbol.name,
            trim_percent(symbol.score),
            symbol.file,
            symbol.line
        ));
        for (rule, at) in group(&symbol.findings) {
            lines.push(format!(
                "  - `{}` ({}) — {} on line{} {}. {}",
                rule.id,
                rule.severity.label(),
                rule.cost,
                if at.len() == 1 { "" } else { "s" },
                at.iter()
                    .map(usize::to_string)
                    .collect::<Vec<String>>()
                    .join(", "),
                rule.hint
            ));
        }
    }

    let remaining = hotspots.len().saturating_sub(MAX_HOTSPOTS);
    if remaining > 0 {
        lines.push(format!(
            "- +{remaining} more symbol{} under the threshold",
            if remaining == 1 { "" } else { "s" }
        ));
    }

    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::super::rules::{Finding, RULES};
    use super::super::symbols::SymbolKind;
    use super::super::{ScanStatus, SymbolPerformance};
    use super::*;
    use std::path::PathBuf;

    fn finding(id: &str, line: usize) -> Finding {
        Finding {
            rule: *RULES.iter().find(|rule| rule.id == id).expect("declared"),
            line,
        }
    }

    fn module(findings: Vec<Finding>) -> ModulePerformance {
        ModulePerformance {
            name: "user".to_string(),
            label: "modules/user".to_string(),
            dir: PathBuf::from("modules/user"),
            status: ScanStatus::Scored,
            symbols: vec![SymbolPerformance {
                kind: SymbolKind::Method,
                name: "UserService.syncAll".to_string(),
                file: "modules/user/src/user.service.ts".to_string(),
                line: 44,
                span: 12,
                score: 38.0,
                findings,
            }],
            files: 3,
            duration_ms: 8,
        }
    }

    #[test]
    fn the_title_names_the_module_its_score_and_how_many_hotspots_it_holds() {
        let title = build_issue_title(&module(vec![finding("perf.query-in-loop", 47)]), 90.0);

        assert!(title.contains("user"));
        assert!(title.contains("38"));
        assert!(title.contains("1 performance hotspot "));
    }

    #[test]
    fn the_description_lists_every_rule_a_hotspot_trips_with_its_lines() {
        let description = build_issue_description(
            &module(vec![
                finding("perf.query-in-loop", 47),
                finding("perf.await-in-loop", 47),
                finding("perf.await-in-loop", 52),
            ]),
            90.0,
        );

        assert!(description.contains("modules/user"));
        assert!(description.contains("`UserService.syncAll`"));
        assert!(description.contains("perf.query-in-loop"));
        assert!(description.contains("lines 47, 52"));
        assert!(description.contains("talos performance:check --modules=user"));
    }

    #[test]
    fn the_priority_follows_the_worst_rule_the_module_trips() {
        assert_eq!(
            priority(&module(vec![finding("perf.query-in-loop", 1)])),
            "Urgent"
        );
        assert_eq!(
            priority(&module(vec![finding("perf.await-in-loop", 1)])),
            "High"
        );
        assert_eq!(
            priority(&module(vec![finding("perf.long-body", 1)])),
            "Medium"
        );
        assert_eq!(priority(&module(Vec::new())), "Medium");
    }
}
