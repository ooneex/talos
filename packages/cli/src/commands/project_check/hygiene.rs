//! Hygiene check: conflict markers, focused/skipped tests and bare `TODO`s —
//! leftovers that should never reach a branch.

use std::fs;
use std::path::{Path, PathBuf};

use super::types::CheckId;
use super::{CheckOutcome, CheckStatus, EXCLUDED_DIRS, MAX_SCANNED_FILE_BYTES, SCANNED_EXTENSIONS};

// ---------------------------------------------------------------------------
// Hygiene — leftovers that should never reach a branch
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HygieneSeverity {
    Error,
    Warning,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HygieneFinding {
    pub file: String,
    pub line: usize,
    pub rule: &'static str,
    pub severity: HygieneSeverity,
    pub message: String,
}

/// Inspect a single file's content. Split out from the directory walk so the
/// rules can be unit-tested without touching the filesystem.
pub fn scan_source(path: &str, content: &str) -> Vec<HygieneFinding> {
    // The needles are assembled at runtime so this very file never matches.
    let conflict_start = "<".repeat(7);
    let conflict_end = ">".repeat(7);
    // Assembled for the same reason: this file describes the rule.
    let debug_macro = format!("{}!(", "dbg");
    let test_keywords = ["describe", "it", "test"];
    let extension = path.rsplit('.').next().unwrap_or_default();
    let is_source = matches!(extension, "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs");
    let is_rust = extension == "rs";
    let is_python = extension == "py";
    // Prose legitimately quotes markers such as `// TODO`, so documentation is
    // only scanned for conflict markers.
    let is_prose = matches!(extension, "md" | "mdx");

    let mut findings = Vec::new();
    for (index, line) in content.lines().enumerate() {
        let number = index + 1;
        let trimmed = line.trim_start();

        if let Some(finding) =
            conflict_finding(path, number, trimmed, &conflict_start, &conflict_end)
        {
            findings.push(finding);
            continue;
        }

        if is_source {
            findings.extend(js_test_findings(path, number, line, &test_keywords));
        }
        if is_rust {
            findings.extend(rust_hygiene_findings(
                path,
                number,
                trimmed,
                line,
                &debug_macro,
            ));
        }
        if is_python {
            findings.extend(python_hygiene_findings(path, number, trimmed, line));
        }
        if let Some(finding) = bare_todo_finding(
            path,
            number,
            &super::complexity::without_string_contents(line),
            is_prose,
        ) {
            findings.push(finding);
        }
    }
    findings
}

/// A merge-conflict marker (`<<<<<<<`/`>>>>>>>`) left at the start of a line.
fn conflict_finding(
    path: &str,
    number: usize,
    trimmed: &str,
    conflict_start: &str,
    conflict_end: &str,
) -> Option<HygieneFinding> {
    if trimmed.starts_with(conflict_start) || trimmed.starts_with(conflict_end) {
        Some(HygieneFinding {
            file: path.to_string(),
            line: number,
            rule: "hygiene.conflict-marker",
            severity: HygieneSeverity::Error,
            message: "Unresolved merge conflict marker".to_string(),
        })
    } else {
        None
    }
}

/// `describe`/`it`/`test` calls focused with `.only(` or disabled with
/// `.skip(` in a JS/TS source file.
fn js_test_findings(
    path: &str,
    number: usize,
    line: &str,
    test_keywords: &[&str],
) -> Vec<HygieneFinding> {
    let mut findings = Vec::new();
    for keyword in test_keywords {
        if line.contains(&format!("{keyword}.only(")) {
            findings.push(HygieneFinding {
                file: path.to_string(),
                line: number,
                rule: "hygiene.focused-test",
                severity: HygieneSeverity::Error,
                message: format!("`{keyword}.only` hides the rest of the suite"),
            });
        }
        if line.contains(&format!("{keyword}.skip(")) {
            findings.push(HygieneFinding {
                file: path.to_string(),
                line: number,
                rule: "hygiene.skipped-test",
                severity: HygieneSeverity::Warning,
                message: format!("`{keyword}.skip` silently disables a test"),
            });
        }
    }
    findings
}

/// `#[ignore]` and leftover `dbg!` calls in a Rust source file.
fn rust_hygiene_findings(
    path: &str,
    number: usize,
    trimmed: &str,
    line: &str,
    debug_macro: &str,
) -> Vec<HygieneFinding> {
    let mut findings = Vec::new();
    // `#[ignore]` is the Rust way of skipping a test, and a `dbg!` is a
    // print statement that survived a debugging session.
    if trimmed.starts_with("#[ignore") {
        findings.push(HygieneFinding {
            file: path.to_string(),
            line: number,
            rule: "hygiene.skipped-test",
            severity: HygieneSeverity::Warning,
            message: "`#[ignore]` silently disables a test".to_string(),
        });
    }
    if line.contains(debug_macro) && !trimmed.starts_with("//") {
        findings.push(HygieneFinding {
            file: path.to_string(),
            line: number,
            rule: "hygiene.debug-print",
            severity: HygieneSeverity::Warning,
            message: "`dbg!` left behind — remove it or use the logger".to_string(),
        });
    }
    findings
}

/// Skip markers and a leftover debugger call in a Python source file.
fn python_hygiene_findings(
    path: &str,
    number: usize,
    trimmed: &str,
    line: &str,
) -> Vec<HygieneFinding> {
    let mut findings = Vec::new();
    // `skip`/`skipif` markers and a debugger call that outlived the
    // session it was added for.
    if trimmed.starts_with("@pytest.mark.skip")
        || trimmed.starts_with("@unittest.skip")
        || trimmed.starts_with("pytest.skip(")
    {
        findings.push(HygieneFinding {
            file: path.to_string(),
            line: number,
            rule: "hygiene.skipped-test",
            severity: HygieneSeverity::Warning,
            message: "skip marker silently disables a test".to_string(),
        });
    }
    if trimmed.starts_with("breakpoint()") || line.contains("pdb.set_trace()") {
        findings.push(HygieneFinding {
            file: path.to_string(),
            line: number,
            rule: "hygiene.debug-print",
            severity: HygieneSeverity::Warning,
            message: "debugger call left behind — remove it".to_string(),
        });
    }
    findings
}

/// A bare `TODO`/`FIXME` marker with no issue id, outside prose files where
/// such markers are legitimately quoted rather than acted on.
fn bare_todo_finding(
    path: &str,
    number: usize,
    line: &str,
    is_prose: bool,
) -> Option<HygieneFinding> {
    if is_prose {
        return None;
    }
    let marker = bare_marker(line)?;
    Some(HygieneFinding {
        file: path.to_string(),
        line: number,
        rule: "hygiene.bare-todo",
        severity: HygieneSeverity::Warning,
        message: format!("Bare `{marker}` comment — track it as an issue instead"),
    })
}

/// A `TODO`/`FIXME`/`HACK`/`XXX` comment that references neither an issue id
/// nor a URL, which the conventions forbid.
pub fn bare_marker(line: &str) -> Option<&'static str> {
    let comment = line
        .find("//")
        .map(|index| index + 2)
        .or_else(|| line.find("/*").map(|index| index + 2))
        .or_else(|| line.find('#').map(|index| index + 1))?;
    let rest = line.get(comment..)?.trim_start();

    for marker in ["TODO", "FIXME", "HACK", "XXX"] {
        let Some(tail) = rest.strip_prefix(marker) else {
            continue;
        };
        let tail = tail.trim_start();
        if tail.starts_with('(') || tail.starts_with('[') || tail.contains("http") {
            return None;
        }
        return Some(match marker {
            "TODO" => "TODO",
            "FIXME" => "FIXME",
            "HACK" => "HACK",
            _ => "XXX",
        });
    }
    None
}

fn scan_hygiene(root: &Path) -> Vec<HygieneFinding> {
    let mut findings = Vec::new();
    walk_sources(root, root, 0, &mut findings);
    findings.sort_by(|left, right| left.file.cmp(&right.file).then(left.line.cmp(&right.line)));
    findings
}

fn walk_sources(root: &Path, dir: &Path, depth: usize, findings: &mut Vec<HygieneFinding>) {
    if depth > 8 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut paths: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
    paths.sort();

    for path in paths {
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if path.is_dir() {
            if name.starts_with('.') || EXCLUDED_DIRS.contains(&name) {
                continue;
            }
            walk_sources(root, &path, depth + 1, findings);
            continue;
        }

        let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("");
        if !SCANNED_EXTENSIONS.contains(&extension) {
            continue;
        }
        if fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0) > MAX_SCANNED_FILE_BYTES {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let relative = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();
        findings.extend(scan_source(&relative, &content));
    }
}

pub(super) fn check_hygiene(root: &Path) -> CheckOutcome {
    let findings = scan_hygiene(root);
    let errors = findings
        .iter()
        .filter(|finding| finding.severity == HygieneSeverity::Error)
        .count();
    let warnings = findings.len() - errors;

    let status = if errors > 0 {
        CheckStatus::Failed
    } else if warnings > 0 {
        CheckStatus::Warned
    } else {
        CheckStatus::Passed
    };

    if findings.is_empty() {
        return CheckOutcome::new(
            CheckId::Hygiene,
            CheckStatus::Passed,
            "no leftover marker, focused test or bare TODO",
        );
    }

    let details = findings
        .iter()
        .map(|finding| {
            format!(
                "{}:{}  {}  {}",
                finding.file, finding.line, finding.rule, finding.message
            )
        })
        .collect();

    CheckOutcome::new(
        CheckId::Hygiene,
        status,
        format!(
            "{errors} error{} · {warnings} warning{}",
            if errors == 1 { "" } else { "s" },
            if warnings == 1 { "" } else { "s" }
        ),
    )
    .with_details(details)
}
