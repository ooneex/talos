//! Discovering issue owners, reading a file's raw source defensively, and
//! parsing/loading a single issue YAML into a [`super::LoadedIssue`].

use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::Path;

use serde_yaml::{Mapping, Value};

use super::{FileReport, ISSUE_ROOTS, IssueOwner, LoadedIssue, MAX_FILE_BYTES, Severity};

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/// Find every module/package under `modules/` or `packages/` owning an
/// `issues/` directory, sorted by name for deterministic reports.
pub(super) fn discover_owners(root: &Path) -> Vec<IssueOwner> {
    let mut owners: BTreeMap<String, IssueOwner> = BTreeMap::new();

    for group in ISSUE_ROOTS {
        let Ok(entries) = fs::read_dir(root.join(group)) else {
            continue;
        };
        for entry in entries.flatten() {
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let issues_dir = dir.join("issues");
            if !issues_dir.is_dir() {
                continue;
            }
            owners.entry(name.clone()).or_insert(IssueOwner {
                name,
                dir,
                issues_dir,
            });
        }
    }

    owners.into_values().collect()
}

/// Render a path relative to the project root, falling back to the full path.
pub fn relative_to(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

// ---------------------------------------------------------------------------
// File-level guards
// ---------------------------------------------------------------------------

/// Read an issue file, refusing anything that is not a small UTF-8 text file.
/// The returned diagnostics are fatal: parsing must not be attempted after one.
fn read_source(path: &Path, report: &mut FileReport) -> Option<String> {
    match fs::metadata(path) {
        Ok(metadata) if metadata.len() > MAX_FILE_BYTES => {
            report.error(
                "issue.file.too-large",
                format!(
                    "File is {} bytes, above the {MAX_FILE_BYTES} byte limit for an issue",
                    metadata.len()
                ),
            );
            return None;
        }
        Ok(_) => {}
        Err(err) => {
            report.error("issue.file.unreadable", format!("Cannot stat file: {err}"));
            return None;
        }
    }

    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(err) => {
            report.error("issue.file.unreadable", format!("Cannot read file: {err}"));
            return None;
        }
    };

    let bytes = match bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        Some(stripped) => {
            report.error(
                "issue.file.bom",
                "File starts with a UTF-8 BOM; save it without a byte-order mark",
            );
            stripped.to_vec()
        }
        None => bytes,
    };

    match String::from_utf8(bytes) {
        Ok(source) => Some(source),
        Err(err) => {
            report.error(
                "issue.file.encoding",
                format!("File is not valid UTF-8: {err}"),
            );
            None
        }
    }
}

/// Report byte-level problems that either break the YAML parser or silently
/// corrupt block scalars. Returns `false` when the file cannot be parsed at all.
fn check_source_text(source: &str, report: &mut FileReport) -> bool {
    if source.trim().is_empty() {
        report.error("issue.file.empty", "File is empty");
        return false;
    }

    if source.contains("\r\n") {
        report.warn(
            "issue.file.crlf",
            "File uses CRLF line endings; issues must use LF",
        );
    } else if source.contains('\r') {
        report.error(
            "issue.file.carriage-return",
            "File contains a lone carriage return",
        );
    }

    if !source.ends_with('\n') {
        report.warn(
            "issue.file.trailing-newline",
            "File has no trailing newline",
        );
    }

    let mut trailing_space_lines: Vec<usize> = Vec::new();
    let mut parseable = true;

    for (index, line) in source.lines().enumerate() {
        let number = index + 1;
        let indent: String = line.chars().take_while(|c| c.is_whitespace()).collect();
        if indent.contains('\t') {
            report.error_at(
                "issue.file.tab-indentation",
                number,
                "Line is indented with a tab; YAML forbids tabs in indentation",
            );
            parseable = false;
        }
        if let Some(bad) = line
            .chars()
            .find(|c| c.is_control() && *c != '\t' && *c != '\r')
        {
            report.error_at(
                "issue.file.control-character",
                number,
                format!("Line contains the control character U+{:04X}", bad as u32),
            );
            parseable = false;
        }
        let stripped = line.trim_end_matches(['\r']);
        if !stripped.is_empty() && stripped.len() != stripped.trim_end().len() {
            trailing_space_lines.push(number);
        }
    }

    if let Some(first) = trailing_space_lines.first() {
        report.warn_at(
            "issue.file.trailing-whitespace",
            *first,
            format!(
                "{} line{} end with trailing whitespace",
                trailing_space_lines.len(),
                if trailing_space_lines.len() == 1 {
                    ""
                } else {
                    "s"
                }
            ),
        );
    }

    parseable
}

/// Detect repeated top-level keys. `serde_yaml` keeps the last occurrence
/// silently, so a duplicated `state:` would quietly discard the first value.
fn check_duplicate_keys(source: &str, report: &mut FileReport) {
    let mut seen: HashMap<String, usize> = HashMap::new();

    for (index, line) in source.lines().enumerate() {
        if line.starts_with([' ', '\t', '#', '-']) || line.trim().is_empty() {
            continue;
        }
        let Some((key, _)) = line.split_once(':') else {
            continue;
        };
        if key.is_empty()
            || !key
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        {
            continue;
        }
        let number = index + 1;
        if let Some(first) = seen.insert(key.to_string(), number) {
            report.error_at(
                "issue.yaml.duplicate-key",
                number,
                format!("Key `{key}` is already defined on line {first}"),
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/// Load one issue file, running every file-level guard before parsing. The
/// resulting `document` is only populated when the file is a YAML mapping.
pub(super) fn load_issue(root: &Path, module: &str, path: &Path) -> LoadedIssue {
    let relative = relative_to(root, path);
    let stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut report = FileReport::new(&relative, module, &stem);

    let mut loaded = LoadedIssue {
        relative: relative.clone(),
        module: module.to_string(),
        stem: stem.clone(),
        document: None,
        id: None,
        dependencies: Vec::new(),
        fatal: Vec::new(),
    };

    let Some(source) = read_source(path, &mut report) else {
        loaded.fatal = report.diagnostics;
        return loaded;
    };

    if !check_source_text(&source, &mut report) {
        loaded.fatal = report.diagnostics;
        return loaded;
    }

    check_duplicate_keys(&source, &mut report);

    let Some(document) = parse_issue_document(&source, &mut report) else {
        loaded.fatal = report.diagnostics;
        return loaded;
    };

    loaded.id = document
        .get(Value::from("id"))
        .and_then(as_str)
        .map(str::to_string);
    loaded.dependencies = document
        .get(Value::from("dependencies"))
        .and_then(Value::as_sequence)
        .map(|entries| {
            entries
                .iter()
                .filter_map(as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    loaded.document = Some(document);
    loaded.fatal = report.diagnostics;
    loaded
}

/// Parses `source` as YAML and requires it to be a mapping, reporting a
/// diagnostic and returning `None` for a parse error, an empty document, or
/// any other YAML shape.
fn parse_issue_document(source: &str, report: &mut FileReport) -> Option<Mapping> {
    let parsed = match serde_yaml::from_str::<Value>(source) {
        Ok(value) => value,
        Err(err) => {
            let line = err.location().map(|location| location.line());
            report.push(
                Severity::Error,
                "issue.yaml.parse",
                line,
                format!("Invalid YAML: {err}"),
            );
            return None;
        }
    };

    match parsed {
        Value::Mapping(mapping) => Some(mapping),
        Value::Null => {
            report.error("issue.yaml.empty-document", "YAML document is empty");
            None
        }
        other => {
            report.error(
                "issue.yaml.not-a-mapping",
                format!("Issue must be a YAML mapping, found {}", value_kind(&other)),
            );
            None
        }
    }
}

pub fn value_kind(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "a boolean",
        Value::Number(_) => "a number",
        Value::String(_) => "a string",
        Value::Sequence(_) => "a sequence",
        Value::Mapping(_) => "a mapping",
        Value::Tagged(_) => "a tagged value",
    }
}

/// Read a value, treating an explicit `null` as an absent field so scaffolded
/// issues (`description: null`) are not mistaken for populated ones.
pub(super) fn field<'a>(document: &'a Mapping, key: &str) -> Option<&'a Value> {
    match document.get(Value::from(key)) {
        Some(Value::Null) | None => None,
        Some(value) => Some(value),
    }
}

pub(super) fn as_str(value: &Value) -> Option<&str> {
    value.as_str()
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

/// Tracker identifier (`ABC-123456`, `ENG-45`) or a bare GitHub issue number.
pub fn is_valid_issue_id(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }
    if value.chars().all(|c| c.is_ascii_digit()) {
        return value.len() <= 9;
    }
    let Some((prefix, number)) = value.split_once('-') else {
        return false;
    };
    let prefix_ok = (2..=10).contains(&prefix.len())
        && prefix.starts_with(|c: char| c.is_ascii_uppercase())
        && prefix
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit());
    let number_ok = (1..=6).contains(&number.len()) && number.chars().all(|c| c.is_ascii_digit());
    prefix_ok && number_ok
}

pub fn is_kebab_case(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('-')
        && !value.ends_with('-')
        && !value.contains("--")
        && value
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// A parsed `- [ ]` / `- [x]` checkbox line from a `dod` block.
#[derive(Debug)]
pub struct Checkbox {
    pub indent: usize,
    pub checked: bool,
    pub uppercase: bool,
}

pub fn parse_checkbox(line: &str) -> Option<Checkbox> {
    let indent = line.len() - line.trim_start_matches(' ').len();
    let rest = &line[indent..];
    let rest = rest.strip_prefix("- [")?;
    let (marker, rest) = rest.split_at(rest.char_indices().nth(1).map_or(0, |(index, _)| index));
    let checked = match marker {
        " " => false,
        "x" | "X" => true,
        _ => return None,
    };
    let text = rest.strip_prefix("] ")?;
    if text.trim().is_empty() {
        return None;
    }
    Some(Checkbox {
        indent,
        checked,
        uppercase: marker == "X",
    })
}

/// A parsed `1. [ ]` numbered checkbox line from a `testing` block.
#[derive(Debug)]
pub struct NumberedCheckbox {
    pub number: usize,
    pub checked: bool,
}

pub fn parse_numbered_checkbox(line: &str) -> Option<NumberedCheckbox> {
    if line.starts_with(' ') {
        return None;
    }
    let digits: String = line.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        return None;
    }
    let rest = line[digits.len()..].strip_prefix(". [")?;
    let (marker, rest) = rest.split_at(rest.char_indices().nth(1).map_or(0, |(index, _)| index));
    let checked = match marker {
        " " => false,
        "x" | "X" => true,
        _ => return None,
    };
    let text = rest.strip_prefix("] ")?;
    if text.trim().is_empty() {
        return None;
    }
    Some(NumberedCheckbox {
        number: digits.parse().ok()?,
        checked,
    })
}

/// Read the `type` of a module from its `<name>.yml` descriptor.
pub fn read_module_type(module_dir: &Path, name: &str) -> Option<String> {
    let content = fs::read_to_string(module_dir.join(format!("{name}.yml"))).ok()?;
    if let Ok(Value::Mapping(mapping)) = serde_yaml::from_str::<Value>(&content)
        && let Some(value) = mapping.get(Value::from("type")).and_then(as_str)
    {
        return Some(value.trim().to_string());
    }
    content.lines().find_map(|line| {
        let value = line.trim().strip_prefix("type:")?;
        let value = value.split('#').next().unwrap_or(value);
        Some(value.trim().trim_matches(['"', '\'']).to_string())
    })
}

/// The `goal` subsection a module type is expected to use.
pub fn expected_goal_section(module_type: &str) -> Option<&'static str> {
    match module_type {
        "module" | "api" | "microservice" => Some("### Data Model"),
        "spa" | "admin" | "storybook" => Some("### Front-End Structure"),
        "design" => Some("### Design System Structure"),
        _ => None,
    }
}

pub fn quote_list(values: &[&str]) -> String {
    values
        .iter()
        .map(|value| format!("`{value}`"))
        .collect::<Vec<_>>()
        .join(", ")
}
