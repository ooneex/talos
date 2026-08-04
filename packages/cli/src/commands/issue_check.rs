// Strict validator for every issue YAML file in a Talos project.
//
// Issues are the contract shared by `issue:create`, `issue:pull`, `issue:push`,
// `issue:convert` and the agent skills that plan, fix, review and merge them.
// A single malformed file silently breaks that whole chain, so this command
// reads each file defensively (never panicking on garbage input), reports the
// exact rule that was violated, and exits non-zero when anything is broken.

use std::path::PathBuf;

use clap::Args;
use console::style;
use serde_yaml::Mapping;

/// Roots scanned for modules/packages owning an `issues/` directory.
pub(super) const ISSUE_ROOTS: &[&str] = &["modules", "packages"];

/// Hard ceiling on an issue file. Anything bigger is not a hand-written issue
/// and is refused before it is loaded into memory.
pub(super) const MAX_FILE_BYTES: u64 = 512 * 1024;

/// Top-level keys an issue file may declare. Anything else is a typo or a
/// convention drift and is reported as an error.
pub(super) const KNOWN_FIELDS: &[&str] = &[
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
pub(super) const STATES: &[&str] = &[
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
pub(super) const PLANNED_STATES: &[&str] =
    &["Planned", "In Progress", "In Review", "To Merge", "Done"];

/// States reached only after the work has been implemented and reviewed.
pub(super) const IMPLEMENTED_STATES: &[&str] = &["In Review", "To Merge", "Done"];

pub(super) const PRIORITIES: &[&str] = &["No priority", "Urgent", "High", "Medium", "Low"];

/// Change-type labels — at least one is required and it must come first, since
/// `issue-fix` maps it to the branch (and therefore commit) type.
pub(super) const CHANGE_TYPE_LABELS: &[&str] = &[
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
pub(super) const AREA_LABELS: &[&str] =
    &["Database", "API", "UI", "SPA", "Design", "Infrastructure"];

/// Modifier labels are neither a change type nor an area.
pub(super) const MODIFIER_LABELS: &[&str] = &["Breaking Change"];

/// Change-type label to conventional-commit branch type, mirroring `issue-fix`.
pub(super) const LABEL_BRANCH_TYPES: &[(&str, &str)] = &[
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
pub(super) const GOAL_SECTIONS: &[&str] = &[
    "### Data Model",
    "### Front-End Structure",
    "### Design System Structure",
];

/// Implementation syntax that must live in `goal`, never in a `dod` item.
pub(super) const IMPLEMENTATION_MARKERS: &[&str] = &[
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
pub(super) struct IssueOwner {
    pub(super) name: String,
    pub(super) dir: PathBuf,
    pub(super) issues_dir: PathBuf,
}

/// One issue file, loaded defensively: `document` is `None` whenever the file
/// could not be turned into a YAML mapping, and checking stops there.
pub(super) struct LoadedIssue {
    pub(super) relative: String,
    pub(super) module: String,
    pub(super) stem: String,
    pub(super) document: Option<Mapping>,
    pub(super) id: Option<String>,
    pub(super) dependencies: Vec<String>,
    pub(super) fatal: Vec<Diagnostic>,
}

/// Collects diagnostics for a single file, carrying its identity so every
/// message can be attributed without repeating the path everywhere.
pub(super) struct FileReport {
    pub(super) file: String,
    pub(super) module: String,
    pub(super) issue: String,
    pub(super) diagnostics: Vec<Diagnostic>,
}

impl FileReport {
    pub(super) fn new(file: &str, module: &str, issue: &str) -> Self {
        Self {
            file: file.to_string(),
            module: module.to_string(),
            issue: issue.to_string(),
            diagnostics: Vec::new(),
        }
    }

    pub(super) fn push(
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

    pub(super) fn error(&mut self, rule: &'static str, message: impl Into<String>) {
        self.push(Severity::Error, rule, None, message);
    }

    pub(super) fn error_at(&mut self, rule: &'static str, line: usize, message: impl Into<String>) {
        self.push(Severity::Error, rule, Some(line), message);
    }

    pub(super) fn warn(&mut self, rule: &'static str, message: impl Into<String>) {
        self.push(Severity::Warning, rule, None, message);
    }

    pub(super) fn warn_at(&mut self, rule: &'static str, line: usize, message: impl Into<String>) {
        self.push(Severity::Warning, rule, Some(line), message);
    }
}

pub(super) mod checks;
pub(super) mod execute;
pub(super) mod fields_a;
pub(super) mod fields_b;
pub(super) mod loading;

pub use checks::find_dependency_cycle;
pub use execute::{CheckOptions, execute, run};
pub use fields_a::backticked_id_suffix;
pub use loading::{
    expected_goal_section, is_kebab_case, is_valid_issue_id, parse_checkbox,
    parse_numbered_checkbox, quote_list, read_module_type, relative_to, value_kind,
};
