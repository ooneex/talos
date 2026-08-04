//! Accessibility check: Biome's `a11y` lint rules run over every UI module's
//! `src/`, classified against the rules the project has disabled so a
//! project-wide exemption is reported once rather than per violation.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;

use crate::utils::{resolve_biome_command, strip_jsonc};

use super::modules;
use super::types::CheckId;
use super::{CheckOutcome, CheckStatus, ProjectCheckArgs, UI_MODULE_TYPES, cap_details, split_csv};

// ---------------------------------------------------------------------------
// Accessibility — a11y lint of every UI module
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct A11yDiagnostic {
    pub rule: String,
    pub severity: String,
    pub file: String,
    pub line: usize,
    pub message: String,
}

/// A11y diagnostics split by whether the project enforces the rule or not.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct A11yReport {
    pub modules: Vec<String>,
    pub errors: Vec<A11yDiagnostic>,
    pub warnings: Vec<A11yDiagnostic>,
    /// Violations of a11y rules the project turned off in its Biome config.
    pub ignored: BTreeMap<String, usize>,
}

impl A11yReport {
    pub fn violations(&self) -> usize {
        self.errors.len() + self.warnings.len()
    }
}

/// Split Biome's a11y diagnostics into enforced errors, enforced warnings and
/// findings for rules the project explicitly disabled.
pub fn classify_a11y(diagnostics: &[A11yDiagnostic], disabled: &BTreeSet<String>) -> A11yReport {
    let mut report = A11yReport::default();
    for diagnostic in diagnostics {
        if disabled.contains(&diagnostic.rule) {
            *report.ignored.entry(diagnostic.rule.clone()).or_insert(0) += 1;
            continue;
        }
        match diagnostic.severity.as_str() {
            "error" | "fatal" => report.errors.push(diagnostic.clone()),
            _ => report.warnings.push(diagnostic.clone()),
        }
    }
    report
}

/// Parse the `--reporter=json` payload Biome writes, keeping a11y rules only.
pub fn parse_biome_a11y(payload: &str) -> Option<Vec<A11yDiagnostic>> {
    let start = payload.find('{')?;
    let value: Value = serde_json::from_str(payload.get(start..)?).ok()?;
    let diagnostics = value.get("diagnostics")?.as_array()?;

    Some(
        diagnostics
            .iter()
            .filter_map(|diagnostic| {
                let category = diagnostic.get("category")?.as_str()?;
                let rule = category.strip_prefix("lint/a11y/")?;
                let location = diagnostic.get("location");
                Some(A11yDiagnostic {
                    rule: rule.to_string(),
                    severity: diagnostic
                        .get("severity")
                        .and_then(Value::as_str)
                        .unwrap_or("error")
                        .to_string(),
                    file: location
                        .and_then(|location| location.get("path"))
                        .and_then(json_path_to_string)
                        .unwrap_or_default(),
                    line: location
                        .and_then(|location| location.get("start"))
                        .and_then(|start| start.get("line"))
                        .and_then(Value::as_u64)
                        .unwrap_or(0) as usize,
                    message: diagnostic
                        .get("message")
                        .and_then(json_message_to_string)
                        .unwrap_or_default(),
                })
            })
            .collect(),
    )
}

/// Biome writes the path either as a plain string or as `{ "file": "…" }`.
pub fn json_path_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(path) => Some(path.clone()),
        Value::Object(map) => map
            .values()
            .find_map(Value::as_str)
            .map(str::to_string)
            .or_else(|| Some(String::new())),
        _ => None,
    }
}

/// Messages are either a string or an array of `{ "content": "…" }` chunks.
pub fn json_message_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(message) => Some(message.clone()),
        Value::Array(chunks) => {
            let joined: String = chunks
                .iter()
                .filter_map(|chunk| match chunk {
                    Value::String(text) => Some(text.clone()),
                    Value::Object(map) => map.get("content").and_then(json_message_to_string),
                    _ => None,
                })
                .collect();
            Some(joined)
        }
        _ => None,
    }
}

/// Read the a11y rules the project switched off in `biome.jsonc`/`biome.json`.
pub fn disabled_a11y_rules(root: &Path) -> BTreeSet<String> {
    let mut disabled = BTreeSet::new();
    for name in ["biome.jsonc", "biome.json"] {
        let Ok(raw) = fs::read_to_string(root.join(name)) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&strip_jsonc(&raw)) else {
            continue;
        };
        let Some(rules) = value
            .get("linter")
            .and_then(|linter| linter.get("rules"))
            .and_then(|rules| rules.get("a11y"))
            .and_then(Value::as_object)
        else {
            continue;
        };
        for (rule, setting) in rules {
            let level = match setting {
                Value::String(level) => Some(level.as_str()),
                Value::Object(map) => map.get("level").and_then(Value::as_str),
                _ => None,
            };
            if level == Some("off") {
                disabled.insert(rule.clone());
            }
        }
    }
    disabled
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UiModule {
    pub name: String,
    pub dir: PathBuf,
}

/// Every module whose declared type renders a user interface.
pub fn discover_ui_modules(root: &Path) -> Vec<UiModule> {
    let mut modules = Vec::new();
    for group in ["modules", "packages"] {
        let Ok(entries) = fs::read_dir(root.join(group)) else {
            continue;
        };
        let mut dirs: Vec<PathBuf> = entries
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| path.is_dir())
            .collect();
        dirs.sort();

        for dir in dirs {
            let Some(name) = dir.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if !dir.join("src").is_dir() {
                continue;
            }
            let is_ui = match read_module_type(&dir, name) {
                Some(module_type) => UI_MODULE_TYPES.contains(&module_type.as_str()),
                None => false,
            };
            if is_ui {
                modules.push(UiModule {
                    name: name.to_string(),
                    dir,
                });
            }
        }
    }
    modules
}

fn read_module_type(dir: &Path, name: &str) -> Option<String> {
    modules::read_module_type(dir, name)
}

pub(super) fn check_accessibility(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let wanted: Vec<String> = split_csv(args.modules.as_deref())
        .into_iter()
        .chain(split_csv(args.packages.as_deref()))
        .collect();

    let mut modules = discover_ui_modules(root);
    if !wanted.is_empty() {
        modules.retain(|module| wanted.contains(&module.name));
    }

    if modules.is_empty() {
        return CheckOutcome::new(
            CheckId::Accessibility,
            CheckStatus::Skipped,
            "no UI module found (design, spa, admin or storybook)",
        );
    }

    let mut command = {
        let parts = resolve_biome_command(root);
        let mut command = Command::new(&parts[0]);
        command.args(&parts[1..]);
        command
    };
    command
        .arg("lint")
        .arg("--only=a11y")
        .arg("--reporter=json")
        .arg("--max-diagnostics=1000")
        .current_dir(root);
    for module in &modules {
        command.arg(
            module
                .dir
                .join("src")
                .strip_prefix(root)
                .unwrap_or(&module.dir)
                .to_string_lossy()
                .to_string(),
        );
    }

    let output = match command.output() {
        Ok(output) => output,
        Err(err) => {
            return CheckOutcome::new(
                CheckId::Accessibility,
                CheckStatus::Failed,
                "could not run the accessibility linter",
            )
            .with_details(vec![format!("biome could not be started: {err}")])
            .with_hint("Install the workspace dependencies with `bun install`");
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let Some(diagnostics) = parse_biome_a11y(&stdout) else {
        return CheckOutcome::new(
            CheckId::Accessibility,
            CheckStatus::Failed,
            "could not read the accessibility report",
        )
        .with_details(vec![
            String::from_utf8_lossy(&output.stderr)
                .lines()
                .last()
                .unwrap_or("biome returned an unreadable report")
                .to_string(),
        ]);
    };

    let mut report = classify_a11y(&diagnostics, &disabled_a11y_rules(root));
    report.modules = modules.iter().map(|module| module.name.clone()).collect();
    build_a11y_outcome(&report)
}

pub fn build_a11y_outcome(report: &A11yReport) -> CheckOutcome {
    let scope = format!(
        "{} UI module{}",
        report.modules.len(),
        if report.modules.len() == 1 { "" } else { "s" }
    );

    let status = if !report.errors.is_empty() {
        CheckStatus::Failed
    } else if !report.warnings.is_empty() {
        CheckStatus::Warned
    } else {
        CheckStatus::Passed
    };

    let summary = if report.violations() == 0 {
        format!("{scope} · no violation")
    } else {
        format!(
            "{scope} · {} error{} · {} warning{}",
            report.errors.len(),
            if report.errors.len() == 1 { "" } else { "s" },
            report.warnings.len(),
            if report.warnings.len() == 1 { "" } else { "s" }
        )
    };

    let mut details: Vec<String> = report
        .errors
        .iter()
        .chain(report.warnings.iter())
        .map(|diagnostic| {
            format!(
                "{}:{}  a11y/{}  {}",
                diagnostic.file, diagnostic.line, diagnostic.rule, diagnostic.message
            )
        })
        .collect();
    details = cap_details(details);

    if !report.ignored.is_empty() {
        let mut ignored: Vec<(&String, &usize)> = report.ignored.iter().collect();
        ignored.sort_by(|left, right| right.1.cmp(left.1).then(left.0.cmp(right.0)));
        let listed: Vec<String> = ignored
            .iter()
            .take(3)
            .map(|(rule, count)| format!("{rule} ({count})"))
            .collect();
        details.push(format!(
            "not enforced — disabled in biome config: {}",
            listed.join(", ")
        ));
    }

    let mut outcome =
        CheckOutcome::new(CheckId::Accessibility, status, summary).with_details(details);
    if status != CheckStatus::Passed {
        outcome =
            outcome.with_hint("Fix with `bunx biome check --write` or the `optimize-ui` skill");
    }
    outcome
}
