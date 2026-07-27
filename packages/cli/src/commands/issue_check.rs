//! Strict validator for every issue YAML file in a Talos project.
//!
//! Issues are the contract shared by `issue:create`, `issue:pull`, `issue:push`,
//! `issue:convert` and the agent skills that plan, fix, review and merge them.
//! A single malformed file silently breaks that whole chain, so this command
//! reads each file defensively (never panicking on garbage input), reports the
//! exact rule that was violated, and exits non-zero when anything is broken.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use clap::Args;
use console::style;
use serde_json::json;
use serde_yaml::{Mapping, Value};

use crate::utils::{COMMIT_TYPES, current_dir, error, info, success};

/// Roots scanned for modules/packages owning an `issues/` directory.
const ISSUE_ROOTS: &[&str] = &["modules", "packages"];

/// Hard ceiling on an issue file. Anything bigger is not a hand-written issue
/// and is refused before it is loaded into memory.
const MAX_FILE_BYTES: u64 = 512 * 1024;

/// Top-level keys an issue file may declare. Anything else is a typo or a
/// convention drift and is reported as an error.
const KNOWN_FIELDS: &[&str] = &[
    "id",
    "module",
    "title",
    "state",
    "priority",
    "labels",
    "context",
    "goal",
    "dod",
    "testing",
    "dependencies",
    "branch",
    "pr",
    "comments",
    "description",
    "spec",
    "resources",
];

/// Workflow states, in lifecycle order. `Backlog`/`Canceled` only appear on
/// issues pulled from a tracker; the rest are produced by the skills.
const STATES: &[&str] = &[
    "Backlog",
    "Todo",
    "Planned",
    "In Progress",
    "In Review",
    "To Merge",
    "Done",
    "Canceled",
];

/// States whose issues must carry the full planned structure.
const PLANNED_STATES: &[&str] = &["Planned", "In Progress", "In Review", "To Merge", "Done"];

/// States reached only after the work has been implemented and reviewed.
const IMPLEMENTED_STATES: &[&str] = &["In Review", "To Merge", "Done"];

const PRIORITIES: &[&str] = &["No priority", "Urgent", "High", "Medium", "Low"];

/// Change-type labels — at least one is required and it must come first, since
/// `issue-fix` maps it to the branch (and therefore commit) type.
const CHANGE_TYPE_LABELS: &[&str] = &[
    "Feature",
    "Enhancement",
    "Bug",
    "Security",
    "Hotfix",
    "Performance",
    "Refactor",
    "Cleanup",
    "Architecture",
    "Testing",
    "Documentation",
    "Build",
    "Dependencies",
    "CI",
    "Style",
    "Improvement",
    "Chore",
    "Maintenance",
    "Revert",
];

/// Area labels describe *where* the work happens, never *what* it is.
const AREA_LABELS: &[&str] = &["Database", "API", "UI", "SPA", "Design", "Infrastructure"];

/// Modifier labels are neither a change type nor an area.
const MODIFIER_LABELS: &[&str] = &["Breaking Change"];

/// Change-type label to conventional-commit branch type, mirroring `issue-fix`.
const LABEL_BRANCH_TYPES: &[(&str, &str)] = &[
    ("Feature", "feat"),
    ("Enhancement", "feat"),
    ("Bug", "fix"),
    ("Security", "fix"),
    ("Hotfix", "fix"),
    ("Performance", "perf"),
    ("Refactor", "refactor"),
    ("Cleanup", "refactor"),
    ("Architecture", "refactor"),
    ("Testing", "test"),
    ("Documentation", "docs"),
    ("Build", "build"),
    ("Dependencies", "build"),
    ("CI", "ci"),
    ("Style", "style"),
    ("Improvement", "chore"),
    ("Chore", "chore"),
    ("Maintenance", "chore"),
    ("Revert", "revert"),
];

/// Section headings allowed inside `goal`, keyed by the module `type` they
/// belong to (`issue-plan` — Technical Structure by Module Type).
const GOAL_SECTIONS: &[&str] = &[
    "### Data Model",
    "### Front-End Structure",
    "### Design System Structure",
];

/// Implementation syntax that must live in `goal`, never in a `dod` item.
const IMPLEMENTATION_MARKERS: &[&str] = &[
    "@OneToMany",
    "@ManyToOne",
    "@ManyToMany",
    "@OneToOne",
    "@JoinColumn",
    "@JoinTable",
    "@Column",
    "@Entity",
    "@CreateDateColumn",
    "@UpdateDateColumn",
    "ENUM(",
];

#[derive(Args, Debug)]
pub struct IssueCheckArgs {
    /// Only check issues owned by these modules/packages (comma-separated).
    #[arg(long, value_delimiter = ',', num_args = 1..)]
    pub module: Vec<String>,

    /// Only check these issue ids (comma-separated).
    #[arg(long, value_delimiter = ',', num_args = 1..)]
    pub id: Vec<String>,

    /// Fail on warnings as well as errors.
    #[arg(long, default_value_t = false)]
    pub strict: bool,

    /// Print the diagnostics as JSON instead of a human report.
    #[arg(long, default_value_t = false)]
    pub json: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Severity {
    Warning,
    Error,
}

impl Severity {
    pub fn label(self) -> &'static str {
        match self {
            Severity::Error => "ERROR",
            Severity::Warning => "WARN",
        }
    }

    fn styled(self) -> String {
        match self {
            Severity::Error => style(" ERROR ").white().on_red().bold().to_string(),
            Severity::Warning => style(" WARN  ").black().on_yellow().bold().to_string(),
        }
    }
}

/// A single rule violation, always tied to the file that triggered it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Diagnostic {
    pub file: String,
    pub module: String,
    pub issue: String,
    pub severity: Severity,
    pub rule: &'static str,
    pub line: Option<usize>,
    pub message: String,
}

/// Outcome of a full run, kept free of process exits so it stays testable.
#[derive(Debug, Default)]
pub struct CheckReport {
    pub diagnostics: Vec<Diagnostic>,
    pub files: usize,
    pub modules: usize,
}

impl CheckReport {
    pub fn errors(&self) -> usize {
        self.count(Severity::Error)
    }

    pub fn warnings(&self) -> usize {
        self.count(Severity::Warning)
    }

    fn count(&self, severity: Severity) -> usize {
        self.diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.severity == severity)
            .count()
    }

    pub fn rules(&self) -> Vec<&'static str> {
        self.diagnostics
            .iter()
            .map(|diagnostic| diagnostic.rule)
            .collect()
    }
}

/// A discovered module/package that owns an `issues/` directory.
struct IssueOwner {
    name: String,
    dir: PathBuf,
    issues_dir: PathBuf,
}

/// One issue file, loaded defensively: `document` is `None` whenever the file
/// could not be turned into a YAML mapping, and checking stops there.
struct LoadedIssue {
    relative: String,
    module: String,
    stem: String,
    document: Option<Mapping>,
    id: Option<String>,
    dependencies: Vec<String>,
    fatal: Vec<Diagnostic>,
}

/// Collects diagnostics for a single file, carrying its identity so every
/// message can be attributed without repeating the path everywhere.
struct FileReport {
    file: String,
    module: String,
    issue: String,
    diagnostics: Vec<Diagnostic>,
}

impl FileReport {
    fn new(file: &str, module: &str, issue: &str) -> Self {
        Self {
            file: file.to_string(),
            module: module.to_string(),
            issue: issue.to_string(),
            diagnostics: Vec::new(),
        }
    }

    fn push(
        &mut self,
        severity: Severity,
        rule: &'static str,
        line: Option<usize>,
        message: impl Into<String>,
    ) {
        self.diagnostics.push(Diagnostic {
            file: self.file.clone(),
            module: self.module.clone(),
            issue: self.issue.clone(),
            severity,
            rule,
            line,
            message: message.into(),
        });
    }

    fn error(&mut self, rule: &'static str, message: impl Into<String>) {
        self.push(Severity::Error, rule, None, message);
    }

    fn error_at(&mut self, rule: &'static str, line: usize, message: impl Into<String>) {
        self.push(Severity::Error, rule, Some(line), message);
    }

    fn warn(&mut self, rule: &'static str, message: impl Into<String>) {
        self.push(Severity::Warning, rule, None, message);
    }

    fn warn_at(&mut self, rule: &'static str, line: usize, message: impl Into<String>) {
        self.push(Severity::Warning, rule, Some(line), message);
    }
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/// Find every module/package under `modules/` or `packages/` owning an
/// `issues/` directory, sorted by name for deterministic reports.
fn discover_owners(root: &Path) -> Vec<IssueOwner> {
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
fn relative_to(root: &Path, path: &Path) -> String {
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
fn load_issue(root: &Path, module: &str, path: &Path) -> LoadedIssue {
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

    let parsed = match serde_yaml::from_str::<Value>(&source) {
        Ok(value) => value,
        Err(err) => {
            let line = err.location().map(|location| location.line());
            report.push(
                Severity::Error,
                "issue.yaml.parse",
                line,
                format!("Invalid YAML: {err}"),
            );
            loaded.fatal = report.diagnostics;
            return loaded;
        }
    };

    let document = match parsed {
        Value::Mapping(mapping) => mapping,
        Value::Null => {
            report.error("issue.yaml.empty-document", "YAML document is empty");
            loaded.fatal = report.diagnostics;
            return loaded;
        }
        other => {
            report.error(
                "issue.yaml.not-a-mapping",
                format!("Issue must be a YAML mapping, found {}", value_kind(&other)),
            );
            loaded.fatal = report.diagnostics;
            return loaded;
        }
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

fn value_kind(value: &Value) -> &'static str {
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
fn field<'a>(document: &'a Mapping, key: &str) -> Option<&'a Value> {
    match document.get(Value::from(key)) {
        Some(Value::Null) | None => None,
        Some(value) => Some(value),
    }
}

fn as_str(value: &Value) -> Option<&str> {
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
struct Checkbox {
    indent: usize,
    checked: bool,
    uppercase: bool,
}

fn parse_checkbox(line: &str) -> Option<Checkbox> {
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
struct NumberedCheckbox {
    number: usize,
    checked: bool,
}

fn parse_numbered_checkbox(line: &str) -> Option<NumberedCheckbox> {
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
fn read_module_type(module_dir: &Path, name: &str) -> Option<String> {
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

fn quote_list(values: &[&str]) -> String {
    values
        .iter()
        .map(|value| format!("`{value}`"))
        .collect::<Vec<_>>()
        .join(", ")
}

// ---------------------------------------------------------------------------
// Field checks
// ---------------------------------------------------------------------------

/// Validate a required block-scalar field, returning its content when usable.
fn required_text<'a>(
    document: &'a Mapping,
    key: &'static str,
    rule: &'static str,
    required: bool,
    report: &mut FileReport,
) -> Option<&'a str> {
    match field(document, key) {
        None => {
            if required {
                report.error(
                    rule,
                    format!("`{key}` is required once the issue is planned"),
                );
            }
            None
        }
        Some(value) => match as_str(value) {
            Some(text) if !text.trim().is_empty() => Some(text),
            Some(_) => {
                report.error(rule, format!("`{key}` is empty"));
                None
            }
            None => {
                report.error(
                    rule,
                    format!("`{key}` must be a string, found {}", value_kind(value)),
                );
                None
            }
        },
    }
}

fn check_identity(document: &Mapping, issue: &LoadedIssue, report: &mut FileReport) {
    match field(document, "id") {
        None => report.error("issue.id.missing", "`id` is required"),
        Some(value) => match as_str(value) {
            None => report.error(
                "issue.id.type",
                format!("`id` must be a string, found {}", value_kind(value)),
            ),
            Some(id) => {
                if !is_valid_issue_id(id) {
                    report.error(
                        "issue.id.format",
                        format!(
                            "`id` \"{id}\" is not a valid identifier (expected `ABC-123456` or a tracker id such as `ENG-45`)"
                        ),
                    );
                }
                if id != issue.stem {
                    report.error(
                        "issue.id.filename-mismatch",
                        format!(
                            "`id` is \"{id}\" but the file is named \"{}.yml\"; they must match",
                            issue.stem
                        ),
                    );
                }
            }
        },
    }

    match field(document, "module") {
        None => report.error("issue.module.missing", "`module` is required"),
        Some(value) => match as_str(value) {
            None => report.error(
                "issue.module.type",
                format!("`module` must be a string, found {}", value_kind(value)),
            ),
            Some(module) if module != issue.module => report.error(
                "issue.module.mismatch",
                format!(
                    "`module` is \"{module}\" but the file lives in \"{}\"",
                    issue.module
                ),
            ),
            Some(_) => {}
        },
    }
}

fn check_title(document: &Mapping, report: &mut FileReport) {
    let Some(value) = field(document, "title") else {
        report.error("issue.title.missing", "`title` is required");
        return;
    };
    let Some(title) = as_str(value) else {
        report.error(
            "issue.title.type",
            format!("`title` must be a string, found {}", value_kind(value)),
        );
        return;
    };
    if title.trim().is_empty() {
        report.error("issue.title.empty", "`title` is empty");
        return;
    }
    if title.contains('\n') {
        report.error("issue.title.multiline", "`title` must be a single line");
    }
    if title != title.trim() {
        report.warn(
            "issue.title.whitespace",
            "`title` has leading or trailing whitespace",
        );
    }
    let trimmed = title.trim();
    if trimmed.chars().count() > 100 {
        report.warn(
            "issue.title.length",
            format!(
                "`title` is {} characters; keep it under 100",
                trimmed.chars().count()
            ),
        );
    }
    if trimmed.ends_with('.') {
        report.warn(
            "issue.title.punctuation",
            "`title` must not end with a period",
        );
    }
    if trimmed.starts_with(|c: char| c.is_lowercase()) {
        report.warn(
            "issue.title.capitalization",
            "`title` should start with a capital letter",
        );
    }
}

/// Validate `state` and return it when it is part of the known vocabulary.
fn check_state(document: &Mapping, report: &mut FileReport) -> Option<String> {
    let Some(value) = field(document, "state") else {
        report.error("issue.state.missing", "`state` is required");
        return None;
    };
    let Some(state) = as_str(value) else {
        report.error(
            "issue.state.type",
            format!("`state` must be a string, found {}", value_kind(value)),
        );
        return None;
    };
    if STATES.contains(&state) {
        return Some(state.to_string());
    }
    let hint = STATES
        .iter()
        .find(|known| known.eq_ignore_ascii_case(state))
        .map(|known| format!(" (did you mean `{known}`?)"))
        .unwrap_or_default();
    report.error(
        "issue.state.invalid",
        format!(
            "`state` \"{state}\" is not valid{hint}; expected one of {}",
            quote_list(STATES)
        ),
    );
    None
}

fn check_priority(document: &Mapping, report: &mut FileReport) {
    let Some(value) = field(document, "priority") else {
        report.error("issue.priority.missing", "`priority` is required");
        return;
    };
    let Some(priority) = as_str(value) else {
        report.error(
            "issue.priority.type",
            format!("`priority` must be a string, found {}", value_kind(value)),
        );
        return;
    };
    if PRIORITIES.contains(&priority) {
        return;
    }
    let hint = PRIORITIES
        .iter()
        .find(|known| known.eq_ignore_ascii_case(priority))
        .map(|known| format!(" (did you mean `{known}`?)"))
        .unwrap_or_default();
    report.error(
        "issue.priority.invalid",
        format!(
            "`priority` \"{priority}\" is not valid{hint}; expected one of {}",
            quote_list(PRIORITIES)
        ),
    );
}

/// Validate `labels` and return the change-type labels it declares.
fn check_labels(document: &Mapping, planned: bool, report: &mut FileReport) -> Vec<String> {
    let Some(value) = field(document, "labels") else {
        if planned {
            report.error(
                "issue.labels.missing",
                "`labels` is required once the issue is planned",
            );
        }
        return Vec::new();
    };

    let Some(entries) = value.as_sequence() else {
        report.error(
            "issue.labels.type",
            format!("`labels` must be a sequence, found {}", value_kind(value)),
        );
        return Vec::new();
    };

    if entries.is_empty() {
        if planned {
            report.error(
                "issue.labels.empty",
                "`labels` must contain at least one change-type label once planned",
            );
        }
        return Vec::new();
    }

    let mut labels: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for entry in entries {
        let Some(label) = as_str(entry) else {
            report.error(
                "issue.labels.type",
                format!("Every label must be a string, found {}", value_kind(entry)),
            );
            continue;
        };
        if label.trim().is_empty() {
            report.error("issue.labels.empty-entry", "Labels must not be empty");
            continue;
        }
        if !seen.insert(label.to_string()) {
            report.error(
                "issue.labels.duplicate",
                format!("Label \"{label}\" is listed more than once"),
            );
            continue;
        }
        let known = CHANGE_TYPE_LABELS.contains(&label)
            || AREA_LABELS.contains(&label)
            || MODIFIER_LABELS.contains(&label);
        if !known {
            let hint = CHANGE_TYPE_LABELS
                .iter()
                .chain(AREA_LABELS.iter())
                .chain(MODIFIER_LABELS.iter())
                .find(|known| known.eq_ignore_ascii_case(label))
                .map(|known| format!(" (did you mean `{known}`?)"))
                .unwrap_or_default();
            report.error(
                "issue.labels.unknown",
                format!("Label \"{label}\" is not in the label vocabulary{hint}"),
            );
            continue;
        }
        labels.push(label.to_string());
    }

    let change_types: Vec<String> = labels
        .iter()
        .filter(|label| CHANGE_TYPE_LABELS.contains(&label.as_str()))
        .cloned()
        .collect();

    if change_types.is_empty() {
        let message = format!(
            "`labels` needs at least one change-type label ({})",
            quote_list(CHANGE_TYPE_LABELS)
        );
        if planned {
            report.error("issue.labels.change-type-missing", message);
        } else {
            report.warn("issue.labels.change-type-missing", message);
        }
    } else if labels
        .first()
        .is_some_and(|first| !CHANGE_TYPE_LABELS.contains(&first.as_str()))
    {
        report.error(
            "issue.labels.change-type-first",
            format!(
                "The change-type label must be listed first, found \"{}\"",
                labels.first().map(String::as_str).unwrap_or_default()
            ),
        );
    }

    change_types
}

fn check_goal(goal: &str, module_type: &str, report: &mut FileReport) {
    for line in goal.lines() {
        let trimmed = line.trim_end();
        if let Some(heading) = trimmed.strip_prefix("### ") {
            let heading = format!("### {heading}");
            if !GOAL_SECTIONS.contains(&heading.as_str()) {
                report.warn(
                    "issue.goal.unknown-section",
                    format!(
                        "`goal` uses the section \"{heading}\"; expected one of {}",
                        quote_list(GOAL_SECTIONS)
                    ),
                );
                continue;
            }
            if let Some(expected) = expected_goal_section(module_type)
                && heading != expected
            {
                report.warn(
                    "issue.goal.section-mismatch",
                    format!(
                        "`goal` uses \"{heading}\" but a `{module_type}` module documents its structure under \"{expected}\""
                    ),
                );
            }
        } else if trimmed.starts_with("## ") && trimmed != "## Technical Notes" {
            report.warn(
                "issue.goal.unknown-section",
                format!("`goal` uses the section \"{trimmed}\"; expected \"## Technical Notes\""),
            );
        }
    }
}

fn check_dod(dod: &str, state: &str, report: &mut FileReport) {
    let mut boxes = 0usize;
    let mut unchecked = 0usize;
    let mut checked = 0usize;
    let implemented = IMPLEMENTED_STATES.contains(&state);

    for (index, line) in dod.lines().enumerate() {
        let line = line.trim_end();
        if line.trim().is_empty() {
            continue;
        }
        let number = index + 1;
        let Some(checkbox) = parse_checkbox(line) else {
            report.error_at(
                "issue.dod.format",
                number,
                format!(
                    "`dod` line must be a checkbox (`- [ ] …`), found \"{}\"",
                    line.trim()
                ),
            );
            continue;
        };
        boxes += 1;
        if checkbox.indent % 2 != 0 {
            report.error_at(
                "issue.dod.indentation",
                number,
                "`dod` sub-items must be indented by a multiple of two spaces",
            );
        }
        if checkbox.uppercase {
            report.warn_at(
                "issue.dod.checkbox-case",
                number,
                "Use a lowercase `- [x]` for a checked item",
            );
        }
        if checkbox.checked {
            checked += 1;
        } else {
            unchecked += 1;
        }
        for marker in IMPLEMENTATION_MARKERS {
            if line.contains(marker) {
                report.warn_at(
                    "issue.dod.implementation-detail",
                    number,
                    format!(
                        "`dod` items describe outcomes in plain English; move `{marker}` into the `goal` technical section"
                    ),
                );
                break;
            }
        }
        if let Some(name) = backticked_id_suffix(line) {
            report.warn_at(
                "issue.dod.id-suffix",
                number,
                format!("Use the entity name instead of `{name}` in a `dod` item"),
            );
        }
    }

    if boxes == 0 {
        report.error("issue.dod.empty", "`dod` contains no checkbox item");
        return;
    }
    if implemented && unchecked > 0 {
        report.error(
            "issue.dod.unchecked",
            format!(
                "State is `{state}` but {unchecked} of {boxes} `dod` item{} still unchecked",
                if unchecked == 1 { " is" } else { "s are" }
            ),
        );
    }
    if state == "Planned" && checked == boxes {
        report.warn(
            "issue.dod.premature-check",
            "Every `dod` item is checked while the issue is still `Planned`",
        );
    }
}

/// Find a `` `somethingId` `` reference, which `issue-plan` forbids in a `dod`.
fn backticked_id_suffix(line: &str) -> Option<String> {
    line.split('`').skip(1).step_by(2).find_map(|token| {
        let candidate = token.trim();
        (candidate.len() > 2
            && candidate.ends_with("Id")
            && candidate
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_'))
        .then(|| candidate.to_string())
    })
}

fn check_testing(testing: &str, state: &str, report: &mut FileReport) {
    let mut expected = 1usize;
    let mut unchecked = 0usize;
    let mut steps = 0usize;
    let implemented = IMPLEMENTED_STATES.contains(&state);

    for (index, line) in testing.lines().enumerate() {
        let line = line.trim_end();
        if line.trim().is_empty() {
            continue;
        }
        let number = index + 1;
        let Some(step) = parse_numbered_checkbox(line) else {
            // Indented text continues the previous step.
            if line.starts_with("   ") && steps > 0 {
                continue;
            }
            report.error_at(
                "issue.testing.format",
                number,
                format!(
                    "`testing` line must be a numbered checkbox (`1. [ ] …`), found \"{}\"",
                    line.trim()
                ),
            );
            continue;
        };
        if step.number != expected {
            report.error_at(
                "issue.testing.numbering",
                number,
                format!(
                    "`testing` steps must be numbered sequentially; expected {expected}, found {}",
                    step.number
                ),
            );
        }
        expected = step.number + 1;
        steps += 1;
        if !step.checked {
            unchecked += 1;
        }
    }

    if steps == 0 {
        report.error(
            "issue.testing.empty",
            "`testing` contains no verification step",
        );
        return;
    }
    if implemented && unchecked > 0 {
        report.error(
            "issue.testing.unchecked",
            format!(
                "State is `{state}` but {unchecked} of {steps} `testing` step{} still unchecked",
                if unchecked == 1 { " is" } else { "s are" }
            ),
        );
    }
}

fn check_branch(
    document: &Mapping,
    state: &str,
    id: &str,
    change_types: &[String],
    report: &mut FileReport,
) -> Option<String> {
    let Some(value) = field(document, "branch") else {
        if state == "In Review" || state == "To Merge" {
            report.error(
                "issue.branch.missing",
                format!("`branch` is required once the issue reaches `{state}`"),
            );
        } else if state == "Done" {
            report.warn(
                "issue.branch.missing",
                "`branch` is missing on a `Done` issue; keep it for traceability",
            );
        }
        return None;
    };

    let Some(branch) = as_str(value) else {
        report.error(
            "issue.branch.type",
            format!("`branch` must be a string, found {}", value_kind(value)),
        );
        return None;
    };

    let Some((branch_type, rest)) = branch.split_once('/') else {
        report.error(
            "issue.branch.format",
            format!("`branch` \"{branch}\" must follow `<type>/<ID>-<slug>`"),
        );
        return None;
    };

    if !COMMIT_TYPES.contains(&branch_type) {
        report.error(
            "issue.branch.type-invalid",
            format!(
                "`branch` type \"{branch_type}\" is not a conventional-commit type ({})",
                quote_list(COMMIT_TYPES)
            ),
        );
    } else if !change_types.is_empty() {
        let allowed: BTreeSet<&str> = change_types
            .iter()
            .filter_map(|label| {
                LABEL_BRANCH_TYPES
                    .iter()
                    .find(|(name, _)| *name == label.as_str())
                    .map(|(_, branch_type)| *branch_type)
            })
            .collect();
        if !allowed.is_empty() && !allowed.contains(branch_type) {
            report.warn(
                "issue.branch.type-mismatch",
                format!(
                    "`branch` type \"{branch_type}\" does not match the change-type label{} ({})",
                    if change_types.len() == 1 { "" } else { "s" },
                    quote_list(&allowed.into_iter().collect::<Vec<_>>())
                ),
            );
        }
    }

    match rest.strip_prefix(&format!("{id}-")) {
        None => report.error(
            "issue.branch.id-mismatch",
            format!("`branch` \"{branch}\" must be named `{branch_type}/{id}-<slug>`"),
        ),
        Some(slug) if !is_kebab_case(slug) => report.warn(
            "issue.branch.slug",
            format!("`branch` slug \"{slug}\" must be lower-case kebab-case"),
        ),
        Some(_) => {}
    }

    Some(branch.to_string())
}

fn check_pr(document: &Mapping, state: &str, report: &mut FileReport) {
    let Some(value) = field(document, "pr") else {
        match state {
            "To Merge" => report.error(
                "issue.pr.missing",
                "`pr` is required once the issue reaches `To Merge`",
            ),
            "In Review" | "Done" => report.warn(
                "issue.pr.missing",
                format!("`pr` is missing on an issue in state `{state}`; link the pull request"),
            ),
            _ => {}
        }
        return;
    };

    let Some(url) = as_str(value) else {
        report.error(
            "issue.pr.type",
            format!("`pr` must be a string, found {}", value_kind(value)),
        );
        return;
    };

    let looks_like_pr = url.starts_with("https://")
        && ["/pull/", "/merge_requests/", "/pull-requests/"]
            .iter()
            .any(|segment| {
                url.split_once(segment).is_some_and(|(_, number)| {
                    !number.is_empty() && number.chars().all(|c| c.is_ascii_digit())
                })
            });
    if !looks_like_pr {
        report.error(
            "issue.pr.format",
            format!("`pr` \"{url}\" must be a pull-request URL such as `https://github.com/<org>/<repo>/pull/123`"),
        );
    }
}

fn check_dependencies(
    document: &Mapping,
    id: &str,
    planned: bool,
    index: &HashMap<String, Vec<String>>,
    report: &mut FileReport,
) {
    let Some(value) = document.get(Value::from("dependencies")) else {
        if planned {
            report.warn(
                "issue.dependencies.missing",
                "`dependencies` should be declared explicitly (use `dependencies: []` when there are none)",
            );
        }
        return;
    };

    if value.is_null() {
        report.error(
            "issue.dependencies.type",
            "`dependencies` must be a sequence; use `[]` when there are none",
        );
        return;
    }

    let Some(entries) = value.as_sequence() else {
        report.error(
            "issue.dependencies.type",
            format!(
                "`dependencies` must be a sequence, found {}",
                value_kind(value)
            ),
        );
        return;
    };

    let mut seen: HashSet<&str> = HashSet::new();
    for entry in entries {
        let Some(dependency) = as_str(entry) else {
            report.error(
                "issue.dependencies.type",
                format!(
                    "Every dependency must be a string, found {}",
                    value_kind(entry)
                ),
            );
            continue;
        };
        if !is_valid_issue_id(dependency) {
            report.error(
                "issue.dependencies.format",
                format!("Dependency \"{dependency}\" is not a valid issue identifier"),
            );
            continue;
        }
        if dependency == id {
            report.error(
                "issue.dependencies.self",
                "An issue cannot depend on itself",
            );
            continue;
        }
        if !seen.insert(dependency) {
            report.error(
                "issue.dependencies.duplicate",
                format!("Dependency \"{dependency}\" is listed more than once"),
            );
            continue;
        }
        if !index.contains_key(dependency) {
            report.error(
                "issue.dependencies.unknown",
                format!("Dependency \"{dependency}\" does not match any issue in the project"),
            );
        }
    }
}

fn check_comments(document: &Mapping, report: &mut FileReport) {
    let Some(value) = field(document, "comments") else {
        return;
    };
    let Some(entries) = value.as_sequence() else {
        report.error(
            "issue.comments.type",
            format!("`comments` must be a sequence, found {}", value_kind(value)),
        );
        return;
    };
    for entry in entries {
        let Some(comment) = entry.as_mapping() else {
            report.error(
                "issue.comments.type",
                format!(
                    "Every comment must be a mapping, found {}",
                    value_kind(entry)
                ),
            );
            continue;
        };
        for key in comment.keys() {
            match key.as_str() {
                Some("author") | Some("message") => {}
                Some(other) => report.error(
                    "issue.comments.unknown-field",
                    format!("Unknown comment field `{other}`; expected `author` or `message`"),
                ),
                None => report.error(
                    "issue.comments.unknown-field",
                    "Comment keys must be strings",
                ),
            }
        }
        match field(comment, "message").map(|value| (as_str(value), value_kind(value))) {
            None => report.error("issue.comments.message", "Every comment needs a `message`"),
            Some((Some(message), _)) if message.trim().is_empty() => {
                report.error("issue.comments.message", "Comment `message` is empty");
            }
            Some((Some(_), _)) => {}
            Some((None, kind)) => report.error(
                "issue.comments.message",
                format!("Comment `message` must be a string, found {kind}"),
            ),
        }
        if let Some(author) = field(comment, "author")
            && as_str(author).is_none()
        {
            report.error(
                "issue.comments.author",
                format!(
                    "Comment `author` must be a string, found {}",
                    value_kind(author)
                ),
            );
        }
    }
}

fn check_spec(document: &Mapping, report: &mut FileReport) {
    let Some(value) = field(document, "spec") else {
        return;
    };
    let Some(spec) = value.as_mapping() else {
        report.error(
            "issue.spec.type",
            format!("`spec` must be a mapping, found {}", value_kind(value)),
        );
        return;
    };

    for key in spec.keys() {
        match key.as_str() {
            Some("name") | Some("entity") | Some("roles") | Some("permissions") => {}
            Some(other) => report.error(
                "issue.spec.unknown-field",
                format!(
                    "Unknown `spec` field `{other}`; expected `name`, `entity`, `roles` or `permissions`"
                ),
            ),
            None => report.error("issue.spec.unknown-field", "`spec` keys must be strings"),
        }
    }

    if let Some(name) = field(spec, "name") {
        match as_str(name) {
            None => report.error(
                "issue.spec.name",
                format!("`spec.name` must be a string, found {}", value_kind(name)),
            ),
            Some(name) => {
                let valid = name.split_once('.').is_some_and(|(entity, action)| {
                    !entity.is_empty()
                        && !action.is_empty()
                        && entity.chars().all(|c| c.is_ascii_alphanumeric())
                        && action.chars().all(|c| c.is_ascii_alphanumeric())
                });
                if !valid {
                    report.warn(
                        "issue.spec.name",
                        format!("`spec.name` \"{name}\" should use dot notation, e.g. `organization.create`"),
                    );
                }
            }
        }
    }

    if let Some(entity) = field(spec, "entity")
        && as_str(entity).is_none_or(|entity| entity.trim().is_empty())
    {
        report.error(
            "issue.spec.entity",
            "`spec.entity` must be a non-empty string",
        );
    }

    if let Some(roles) = field(spec, "roles") {
        match roles.as_sequence() {
            None => report.error(
                "issue.spec.roles",
                format!(
                    "`spec.roles` must be a sequence, found {}",
                    value_kind(roles)
                ),
            ),
            Some(entries) => {
                for entry in entries {
                    if as_str(entry).is_none_or(|role| role.trim().is_empty()) {
                        report.error(
                            "issue.spec.roles",
                            "Every `spec.roles` entry must be a non-empty string",
                        );
                    }
                }
            }
        }
    }

    if let Some(permissions) = field(spec, "permissions") {
        match permissions.as_sequence() {
            None => report.error(
                "issue.spec.permissions",
                format!(
                    "`spec.permissions` must be a sequence, found {}",
                    value_kind(permissions)
                ),
            ),
            Some(entries) => {
                for entry in entries {
                    let name = entry
                        .as_mapping()
                        .and_then(|permission| field(permission, "name"))
                        .and_then(as_str);
                    match name {
                        None => report.error(
                            "issue.spec.permissions",
                            "Every `spec.permissions` entry must be a mapping with a string `name`",
                        ),
                        Some(name) => {
                            let valid = name.split_once(':').is_some_and(|(entity, action)| {
                                !entity.is_empty() && !action.is_empty()
                            });
                            if !valid {
                                report.warn(
                                    "issue.spec.permissions",
                                    format!(
                                        "`spec.permissions` name \"{name}\" should use `entity:action` format"
                                    ),
                                );
                            }
                        }
                    }
                }
            }
        }
    }
}

fn check_resources(document: &Mapping, report: &mut FileReport) {
    let Some(value) = field(document, "resources") else {
        return;
    };
    let Some(resources) = value.as_mapping() else {
        report.error(
            "issue.resources.type",
            format!("`resources` must be a mapping, found {}", value_kind(value)),
        );
        return;
    };
    for (key, entry) in resources {
        let Some(name) = key.as_str() else {
            report.error("issue.resources.type", "`resources` keys must be strings");
            continue;
        };
        let valid = match entry {
            Value::String(_) => true,
            Value::Sequence(entries) => entries.iter().all(|entry| entry.as_str().is_some()),
            _ => false,
        };
        if !valid {
            report.error(
                "issue.resources.type",
                format!("`resources.{name}` must be a string or a sequence of strings"),
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Per-issue orchestration
// ---------------------------------------------------------------------------

/// Run every schema, state and formatting rule against one parsed issue.
fn check_issue(
    issue: &LoadedIssue,
    module_type: &str,
    index: &HashMap<String, Vec<String>>,
) -> Vec<Diagnostic> {
    let mut report = FileReport::new(&issue.relative, &issue.module, &issue.stem);
    let Some(document) = issue.document.as_ref() else {
        return report.diagnostics;
    };

    for key in document.keys() {
        match key.as_str() {
            Some(name) if KNOWN_FIELDS.contains(&name) => {}
            Some(name) => {
                let hint = KNOWN_FIELDS
                    .iter()
                    .find(|known| known.eq_ignore_ascii_case(name))
                    .map(|known| format!(" (did you mean `{known}`?)"))
                    .unwrap_or_default();
                report.error(
                    "issue.field.unknown",
                    format!("Unknown field `{name}`{hint}"),
                );
            }
            None => report.error("issue.field.unknown", "Top-level keys must be strings"),
        }
    }

    check_identity(document, issue, &mut report);
    check_title(document, &mut report);
    check_priority(document, &mut report);

    let state = check_state(document, &mut report);
    let state = state.as_deref().unwrap_or("Todo");
    let planned = PLANNED_STATES.contains(&state);
    let id = issue.id.clone().unwrap_or_else(|| issue.stem.clone());

    let change_types = check_labels(document, planned, &mut report);

    if let Some(description) = field(document, "description") {
        if as_str(description).is_none() {
            report.error(
                "issue.description.type",
                format!(
                    "`description` must be a string, found {}",
                    value_kind(description)
                ),
            );
        } else if planned {
            report.error(
                "issue.description.legacy",
                format!(
                    "`description` is only allowed before planning; a `{state}` issue must use `context`/`goal`/`dod`/`testing`"
                ),
            );
        } else if field(document, "goal").is_some() {
            report.warn(
                "issue.description.redundant",
                "Both `description` and `goal` are set; keep only the planned structure",
            );
        }
    } else if !planned && field(document, "goal").is_none() && state != "Canceled" {
        report.warn(
            "issue.todo.no-content",
            format!("A `{state}` issue with neither `description` nor `goal` has nothing to plan"),
        );
    }

    required_text(
        document,
        "context",
        "issue.context.missing",
        planned,
        &mut report,
    );

    if let Some(goal) = required_text(document, "goal", "issue.goal.missing", planned, &mut report)
    {
        check_goal(goal, module_type, &mut report);
    }
    if let Some(dod) = required_text(document, "dod", "issue.dod.missing", planned, &mut report) {
        check_dod(dod, state, &mut report);
    }
    if let Some(testing) = required_text(
        document,
        "testing",
        "issue.testing.missing",
        planned,
        &mut report,
    ) {
        check_testing(testing, state, &mut report);
    }

    check_dependencies(document, &id, planned, index, &mut report);
    check_branch(document, state, &id, &change_types, &mut report);
    check_pr(document, state, &mut report);
    check_comments(document, &mut report);
    check_spec(document, &mut report);
    check_resources(document, &mut report);

    report.diagnostics
}

// ---------------------------------------------------------------------------
// Cross-file guards
// ---------------------------------------------------------------------------

/// Report ids claimed by more than one file — they break every id-based lookup.
fn check_duplicate_ids(issues: &[LoadedIssue], selected: &HashSet<String>) -> Vec<Diagnostic> {
    let mut by_id: BTreeMap<&str, Vec<&LoadedIssue>> = BTreeMap::new();
    for issue in issues {
        if let Some(id) = issue.id.as_deref() {
            by_id.entry(id).or_default().push(issue);
        }
    }

    let mut diagnostics = Vec::new();
    for (id, owners) in by_id {
        if owners.len() < 2 {
            continue;
        }
        for issue in &owners {
            if !selected.contains(&issue.relative) {
                continue;
            }
            let others: Vec<&str> = owners
                .iter()
                .filter(|other| other.relative != issue.relative)
                .map(|other| other.relative.as_str())
                .collect();
            diagnostics.push(Diagnostic {
                file: issue.relative.clone(),
                module: issue.module.clone(),
                issue: issue.stem.clone(),
                severity: Severity::Error,
                rule: "issue.id.duplicate",
                line: None,
                message: format!("Id \"{id}\" is also used by {}", others.join(", ")),
            });
        }
    }
    diagnostics
}

/// Report two issues pointing at the same branch, which makes `issue-fix`
/// implement both on one branch and open conflicting pull requests.
fn check_duplicate_branches(issues: &[LoadedIssue], selected: &HashSet<String>) -> Vec<Diagnostic> {
    let mut by_branch: BTreeMap<String, Vec<&LoadedIssue>> = BTreeMap::new();
    for issue in issues {
        let Some(branch) = issue
            .document
            .as_ref()
            .and_then(|document| field(document, "branch"))
            .and_then(as_str)
        else {
            continue;
        };
        by_branch.entry(branch.to_string()).or_default().push(issue);
    }

    let mut diagnostics = Vec::new();
    for (branch, owners) in by_branch {
        if owners.len() < 2 {
            continue;
        }
        for issue in &owners {
            if !selected.contains(&issue.relative) {
                continue;
            }
            let others: Vec<&str> = owners
                .iter()
                .filter(|other| other.relative != issue.relative)
                .map(|other| other.relative.as_str())
                .collect();
            diagnostics.push(Diagnostic {
                file: issue.relative.clone(),
                module: issue.module.clone(),
                issue: issue.stem.clone(),
                severity: Severity::Warning,
                rule: "issue.branch.duplicate",
                line: None,
                message: format!(
                    "Branch \"{branch}\" is also claimed by {}",
                    others.join(", ")
                ),
            });
        }
    }
    diagnostics
}

/// Depth-first cycle detection over the dependency graph. A cycle deadlocks
/// `issue-fix`, which orders a batch by dependency before implementing it.
pub fn find_dependency_cycle(graph: &HashMap<String, Vec<String>>) -> Option<Vec<String>> {
    #[derive(Clone, Copy, PartialEq)]
    enum Mark {
        Visiting,
        Done,
    }

    fn visit(
        node: &str,
        graph: &HashMap<String, Vec<String>>,
        marks: &mut HashMap<String, Mark>,
        stack: &mut Vec<String>,
    ) -> Option<Vec<String>> {
        marks.insert(node.to_string(), Mark::Visiting);
        stack.push(node.to_string());

        for next in graph.get(node).into_iter().flatten() {
            match marks.get(next.as_str()) {
                Some(Mark::Done) => continue,
                Some(Mark::Visiting) => {
                    let start = stack.iter().position(|entry| entry == next).unwrap_or(0);
                    let mut cycle = stack[start..].to_vec();
                    cycle.push(next.clone());
                    return Some(cycle);
                }
                None => {
                    if !graph.contains_key(next.as_str()) {
                        continue;
                    }
                    if let Some(cycle) = visit(next, graph, marks, stack) {
                        return Some(cycle);
                    }
                }
            }
        }

        stack.pop();
        marks.insert(node.to_string(), Mark::Done);
        None
    }

    let mut marks: HashMap<String, Mark> = HashMap::new();
    let mut nodes: Vec<&String> = graph.keys().collect();
    nodes.sort();
    for node in nodes {
        if marks.contains_key(node.as_str()) {
            continue;
        }
        let mut stack = Vec::new();
        if let Some(cycle) = visit(node, graph, &mut marks, &mut stack) {
            return Some(cycle);
        }
    }
    None
}

fn check_dependency_cycles(issues: &[LoadedIssue], selected: &HashSet<String>) -> Vec<Diagnostic> {
    let mut graph: HashMap<String, Vec<String>> = HashMap::new();
    let mut owners: HashMap<String, &LoadedIssue> = HashMap::new();
    for issue in issues {
        let Some(id) = issue.id.as_deref() else {
            continue;
        };
        graph
            .entry(id.to_string())
            .or_default()
            .extend(issue.dependencies.iter().cloned());
        owners.entry(id.to_string()).or_insert(issue);
    }

    let mut diagnostics = Vec::new();
    let mut reported: HashSet<String> = HashSet::new();
    let mut remaining = graph.clone();

    while let Some(cycle) = find_dependency_cycle(&remaining) {
        let path = cycle.join(" → ");
        for id in &cycle {
            if !reported.insert(id.clone()) {
                continue;
            }
            remaining.remove(id);
            let Some(issue) = owners.get(id) else {
                continue;
            };
            if !selected.contains(&issue.relative) {
                continue;
            }
            diagnostics.push(Diagnostic {
                file: issue.relative.clone(),
                module: issue.module.clone(),
                issue: issue.stem.clone(),
                severity: Severity::Error,
                rule: "issue.dependencies.cycle",
                line: None,
                message: format!("Dependency cycle: {path}"),
            });
        }
    }
    diagnostics
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/// Everything a run needs, kept separate from the clap args so `execute` can be
/// driven directly from tests.
#[derive(Debug, Default)]
pub struct CheckOptions {
    pub modules: Vec<String>,
    pub ids: Vec<String>,
}

fn normalize(values: &[String]) -> Vec<String> {
    values
        .iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect()
}

/// Check every issue file under `root`, honouring the module/id filters. The
/// whole project is always loaded so cross-file rules stay correct even when
/// only a subset is reported on.
pub fn execute(root: &Path, options: &CheckOptions) -> CheckReport {
    let owners = discover_owners(root);
    let module_filter = normalize(&options.modules);
    let id_filter = normalize(&options.ids);

    let mut issues: Vec<LoadedIssue> = Vec::new();
    let mut stray: Vec<Diagnostic> = Vec::new();
    let mut module_types: HashMap<String, String> = HashMap::new();
    let mut checked_modules: BTreeSet<String> = BTreeSet::new();

    for owner in &owners {
        let selected_module = module_filter.is_empty() || module_filter.contains(&owner.name);
        module_types.insert(
            owner.name.clone(),
            read_module_type(&owner.dir, &owner.name).unwrap_or_else(|| "module".to_string()),
        );

        let Ok(entries) = fs::read_dir(&owner.issues_dir) else {
            stray.push(Diagnostic {
                file: relative_to(root, &owner.issues_dir),
                module: owner.name.clone(),
                issue: String::new(),
                severity: Severity::Error,
                rule: "issue.directory.unreadable",
                line: None,
                message: "Cannot read the issues directory".to_string(),
            });
            continue;
        };

        let mut paths: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
        paths.sort();

        for path in paths {
            let name = path
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_default();
            if name.starts_with('.') {
                continue;
            }
            if path.is_dir() {
                if selected_module {
                    stray.push(Diagnostic {
                        file: relative_to(root, &path),
                        module: owner.name.clone(),
                        issue: String::new(),
                        severity: Severity::Error,
                        rule: "issue.directory.nested",
                        line: None,
                        message: "Issue directories only hold `<ID>.yml` files".to_string(),
                    });
                }
                continue;
            }
            if path.extension().and_then(|ext| ext.to_str()) != Some("yml") {
                if selected_module {
                    stray.push(Diagnostic {
                        file: relative_to(root, &path),
                        module: owner.name.clone(),
                        issue: String::new(),
                        severity: Severity::Error,
                        rule: "issue.file.extension",
                        line: None,
                        message: format!("`{name}` is not an issue file; expected `<ID>.yml`"),
                    });
                }
                continue;
            }
            issues.push(load_issue(root, &owner.name, &path));
        }
    }

    let index: HashMap<String, Vec<String>> =
        issues.iter().fold(HashMap::new(), |mut index, issue| {
            if let Some(id) = issue.id.as_deref() {
                index
                    .entry(id.to_string())
                    .or_default()
                    .push(issue.relative.clone());
            }
            index
        });

    let selected: HashSet<String> = issues
        .iter()
        .filter(|issue| {
            (module_filter.is_empty() || module_filter.contains(&issue.module))
                && (id_filter.is_empty()
                    || id_filter.iter().any(|id| {
                        *id == issue.stem || issue.id.as_deref().is_some_and(|value| value == id)
                    }))
        })
        .map(|issue| issue.relative.clone())
        .collect();

    let mut diagnostics: Vec<Diagnostic> = stray;
    for issue in &issues {
        if !selected.contains(&issue.relative) {
            continue;
        }
        checked_modules.insert(issue.module.clone());
        diagnostics.extend(issue.fatal.iter().cloned());
        let module_type = module_types
            .get(&issue.module)
            .map(String::as_str)
            .unwrap_or("module");
        diagnostics.extend(check_issue(issue, module_type, &index));
    }

    diagnostics.extend(check_duplicate_ids(&issues, &selected));
    diagnostics.extend(check_duplicate_branches(&issues, &selected));
    diagnostics.extend(check_dependency_cycles(&issues, &selected));

    diagnostics.sort_by(|left, right| {
        left.file
            .cmp(&right.file)
            .then(left.line.cmp(&right.line))
            .then(right.severity.cmp(&left.severity))
            .then(left.rule.cmp(right.rule))
    });

    CheckReport {
        diagnostics,
        files: selected.len(),
        modules: checked_modules.len(),
    }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

fn print_report(report: &CheckReport) {
    println!(
        "{}{}",
        style("▸ Issue check").magenta().bold(),
        style(format!(
            "  {} issue{} · {} module{}",
            report.files,
            if report.files == 1 { "" } else { "s" },
            report.modules,
            if report.modules == 1 { "" } else { "s" }
        ))
        .dim()
    );

    let mut current_file: Option<&str> = None;
    for diagnostic in &report.diagnostics {
        if current_file != Some(diagnostic.file.as_str()) {
            println!();
            println!("{}", style(&diagnostic.file).bold().underlined());
            current_file = Some(diagnostic.file.as_str());
        }
        let location = diagnostic
            .line
            .map(|line| format!("{line}:"))
            .unwrap_or_default();
        println!(
            "  {} {}{}  {}",
            diagnostic.severity.styled(),
            style(&location).dim(),
            style(diagnostic.rule).cyan(),
            diagnostic.message
        );
    }

    println!();
    let errors = report.errors();
    let warnings = report.warnings();
    if errors == 0 && warnings == 0 {
        success(format!(
            "{} issue{} checked — no problems found",
            report.files,
            if report.files == 1 { "" } else { "s" }
        ));
        return;
    }

    let summary = format!(
        "{errors} error{} · {warnings} warning{}",
        if errors == 1 { "" } else { "s" },
        if warnings == 1 { "" } else { "s" }
    );
    if errors > 0 {
        // The summary goes to stderr; flush stdout so a piped report stays ordered.
        let _ = std::io::stdout().flush();
        error(summary);
    } else {
        println!("{} {}", style("⚠").yellow().bold(), style(summary).yellow());
    }
}

fn print_json(report: &CheckReport) {
    let payload = json!({
        "files": report.files,
        "modules": report.modules,
        "errors": report.errors(),
        "warnings": report.warnings(),
        "diagnostics": report
            .diagnostics
            .iter()
            .map(|diagnostic| json!({
                "file": diagnostic.file,
                "module": diagnostic.module,
                "issue": diagnostic.issue,
                "severity": diagnostic.severity.label(),
                "rule": diagnostic.rule,
                "line": diagnostic.line,
                "message": diagnostic.message,
            }))
            .collect::<Vec<_>>(),
    });
    match serde_json::to_string_pretty(&payload) {
        Ok(json) => println!("{json}"),
        Err(err) => error(format!("Failed to serialize the report: {err}")),
    }
}

pub fn run(args: &IssueCheckArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);

    let options = CheckOptions {
        modules: args.module.clone(),
        ids: args.id.clone(),
    };
    let report = execute(&cwd, &options);

    if report.files == 0 && report.diagnostics.is_empty() {
        if !args.module.is_empty() || !args.id.is_empty() {
            error("No issue matched the requested --module/--id filter");
            std::process::exit(1);
        }
        info("No issue files found");
        return;
    }

    if args.json {
        print_json(&report);
    } else {
        print_report(&report);
    }

    if report.errors() > 0 || (args.strict && report.warnings() > 0) {
        std::process::exit(1);
    }
}
