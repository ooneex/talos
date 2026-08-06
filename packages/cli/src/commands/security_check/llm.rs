// LLM configuration audit — the *instructions* a coding assistant executes.
//
// The dependency audit only knows about vulnerable packages. Agent, skill,
// rule, command and MCP files are just as executable: an assistant reads them
// as trusted instructions and acts on them with the developer's own shell,
// tokens and repository access. They arrive through the same untrusted supply
// chain as any dependency (skeletons, marketplaces, shared repositories, pull
// requests), so they are scanned for the risks of the OWASP LLM Top 10:
// injected instructions, hidden text, exfiltration, credential access, remote
// execution, destructive commands, permission bypasses and links that hide
// where the assistant is being sent.
//
// Which files belong to which assistant is derived from the provider registry
// in `templates::llm::assistants::ASSISTANTS`, so a newly supported assistant
// is audited automatically — bar the ones whose configuration lives in a shared
// directory, which are named path by path in `EXTRA_TARGETS`.

use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use regex::Regex;

use crate::commands::project_check::secrets;
use crate::templates::llm::assistants::ASSISTANTS;

pub const CRITICAL: &str = "CRITICAL";
pub const HIGH: &str = "HIGH";
pub const MODERATE: &str = "MODERATE";

/// Files larger than this are never instructions; skipping them keeps the scan
/// away from bundled reference assets.
const MAX_FILE_SIZE: u64 = 1024 * 1024;

/// How deep the scan descends inside an assistant directory.
const MAX_TARGET_DEPTH: usize = 8;

/// Extensions that hold assistant instructions. Extension-less files (`.rules`,
/// `.roomodes`, `.cursorrules`, `SKILL`) are always scanned.
const TEXT_EXTENSIONS: &[&str] = &[
    "md", "markdown", "mdx", "mdc", "txt", "toml", "json", "jsonc", "yaml", "yml", "xml", "rules",
    "prompt",
];

/// Extensions treated as machine-readable configuration, where permission and
/// MCP rules apply.
const CONFIG_EXTENSIONS: &[&str] = &["json", "jsonc", "toml", "yaml", "yml"];

/// Native layouts an adapter writes outside the assistant's own config
/// directory, plus the root context files assistants load automatically.
/// Paths are relative and may be a file or a directory.
const EXTRA_TARGETS: &[(&str, &str)] = &[
    ("Claude", "CLAUDE.md"),
    ("Claude", ".mcp.json"),
    ("Codex", "AGENTS.md"),
    ("Cursor", ".cursorrules"),
    ("Gemini", "GEMINI.md"),
    ("Windsurf", ".windsurfrules"),
    ("Cline", ".clinerules"),
    ("Roo Code", ".roomodes"),
    ("Zed", ".agents"),
    ("Zed", ".rules"),
    ("GitHub Copilot", ".github/copilot-instructions.md"),
    ("GitHub Copilot", ".github/agents"),
    ("GitHub Copilot", ".github/instructions"),
    ("GitHub Copilot", ".github/prompts"),
    ("VS Code", ".vscode/mcp.json"),
];

/// Registry directories that hold far more than assistant instructions. Copilot
/// reads a handful of paths inside `.github`, which is otherwise full of
/// workflows and issue templates, so those paths are named in `EXTRA_TARGETS`
/// and the directory itself is never walked whole.
const SHARED_DIRS: &[&str] = &[".github"];

#[path = "llm/rules.rs"]
mod rules;

use rules::{LLM01, LLM02, RULES, Rule};

/// Compile every rule once. A rule whose pattern fails to compile is dropped
/// rather than crashing the audit.
fn compiled() -> &'static [(&'static Rule, Vec<Regex>)] {
    static COMPILED: OnceLock<Vec<(&'static Rule, Vec<Regex>)>> = OnceLock::new();
    COMPILED
        .get_or_init(|| {
            RULES
                .iter()
                .map(|rule| {
                    let patterns = rule
                        .patterns
                        .iter()
                        .filter_map(|pattern| Regex::new(pattern).ok())
                        .collect();
                    (rule, patterns)
                })
                .collect()
        })
        .as_slice()
}

/// A markdown link with an absolute target, plus the shape of a label that is
/// unambiguously a link itself: a scheme, a `www.` host or a path. A bare
/// `Node.js` or a `1.1.2` release number is not a destination claim. Compiled
/// once; a failure disables the check rather than crashing the audit.
fn link_patterns() -> Option<&'static (Regex, Regex)> {
    static PATTERNS: OnceLock<Option<(Regex, Regex)>> = OnceLock::new();
    PATTERNS
        .get_or_init(|| {
            Some((
                Regex::new(r"\[([^\]\n]{1,200})\]\(\s*(https?://[^\s)]+)").ok()?,
                Regex::new(
                    r"(?i)^(https?://\S+|www\.[a-z0-9-]+(\.[a-z0-9-]+)+(/\S*)?|[a-z0-9-]+(\.[a-z0-9-]+)+/\S*)$",
                )
                .ok()?,
            ))
        })
        .as_ref()
}

/// Reduce a host to its registrable domain, so `docs.example.com` and
/// `example.com` are read as the same destination.
fn registrable(host: &str) -> String {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    let labels: Vec<&str> = host.split('.').collect();
    match labels.len() {
        0..=2 => host,
        length => labels[length - 2..].join("."),
    }
}

/// The registrable domain a URL points at, with any userinfo and port dropped.
fn host_of(url: &str) -> Option<String> {
    let authority = url.split_once("://").map_or(url, |(_, rest)| rest);
    let authority = authority.split(['/', '?', '#']).next()?;
    let authority = authority.rsplit('@').next()?;
    let host = authority.split(':').next()?;
    (!host.is_empty()).then(|| registrable(host))
}

/// Whether the line holds a markdown link whose visible label names one domain
/// while the target points at another. The reviewer reads the label, the agent
/// fetches the target.
fn is_cloaked_link(line: &str) -> bool {
    let Some((link, label_shape)) = link_patterns() else {
        return false;
    };
    link.captures_iter(line).any(|capture| {
        let (Some(label), Some(target)) = (capture.get(1), capture.get(2)) else {
            return false;
        };
        let label = label
            .as_str()
            .trim()
            .trim_matches(['`', '*', '<', '>'])
            .trim();
        if !label_shape.is_match(label) {
            return false;
        }
        match (host_of(label), host_of(target.as_str())) {
            (Some(claimed), Some(actual)) => claimed != actual,
            _ => false,
        }
    })
}

/// One rule triggered inside one file.
#[derive(Clone, Debug)]
pub struct RuleHit {
    pub id: &'static str,
    pub title: &'static str,
    pub severity: &'static str,
    pub remediation: String,
    pub reference: &'static str,
    pub line: usize,
    pub excerpt: String,
    pub occurrences: usize,
}

/// A rule hit located in an assistant's configuration file.
#[derive(Clone, Debug)]
pub struct LlmFinding {
    /// Display name of the assistant that reads the file.
    pub assistant: String,
    /// Path relative to the audited root.
    pub file: String,
    /// Directory the file belongs to, used to attribute it to a module.
    pub dir: PathBuf,
    pub hit: RuleHit,
}

/// Rank a severity label so findings can be ordered without the parent enum.
fn rank(severity: &str) -> u8 {
    match severity {
        CRITICAL => 4,
        HIGH => 3,
        MODERATE => 2,
        "LOW" => 1,
        _ => 0,
    }
}

/// Replace invisible or control characters with their code point so a hidden
/// payload is visible in the report, then clamp the length.
fn sanitize(line: &str) -> String {
    let mut out = String::new();
    for character in line.trim().chars() {
        if character == '\t' {
            out.push(' ');
        } else if character.is_control() || is_invisible(character) {
            out.push_str(&format!("<U+{:04X}>", character as u32));
        } else {
            out.push(character);
        }
        if out.chars().count() >= 120 {
            out.push('…');
            break;
        }
    }
    out
}

fn is_invisible(character: char) -> bool {
    matches!(character as u32,
        0x00ad | 0x200b..=0x200f | 0x202a..=0x202e | 0x2060..=0x2064 | 0x2066..=0x2069 | 0xfeff | 0xe0000..=0xe007f)
}

/// Scan one file's content. `config` enables the rules that only make sense in
/// machine-readable configuration (MCP servers, permission switches).
pub fn scan_content(content: &str, config: bool) -> Vec<RuleHit> {
    // A leading byte-order mark is a legitimate encoding artefact, not smuggling.
    let content = content.strip_prefix('\u{feff}').unwrap_or(content);
    let mut hits: BTreeMap<&'static str, RuleHit> = BTreeMap::new();

    for (number, line) in content.lines().enumerate() {
        for (rule, patterns) in compiled() {
            if rule.config_only && !config {
                continue;
            }
            if !patterns.iter().any(|pattern| pattern.is_match(line)) {
                continue;
            }
            hits.entry(rule.id)
                .and_modify(|hit| hit.occurrences += 1)
                .or_insert_with(|| RuleHit {
                    id: rule.id,
                    title: rule.title,
                    severity: rule.severity,
                    remediation: rule.remediation.to_string(),
                    reference: rule.reference,
                    line: number + 1,
                    excerpt: sanitize(line),
                    occurrences: 1,
                });
        }

        if is_cloaked_link(line) {
            hits.entry("TALOS-LLM-LINK-CLOAKING")
                .and_modify(|hit| hit.occurrences += 1)
                .or_insert_with(|| RuleHit {
                    id: "TALOS-LLM-LINK-CLOAKING",
                    title: "Markdown link whose label names a different host than its target",
                    severity: HIGH,
                    remediation:
                        "Make the label match the target, or drop the label and keep the bare URL, so the destination the agent opens is the one under review"
                            .to_string(),
                    reference: LLM01,
                    line: number + 1,
                    excerpt: sanitize(line),
                    occurrences: 1,
                });
        }
    }

    // A credential committed inside an agent file is handed straight to the
    // model and to every tool it calls.
    for finding in secrets::scan_content(content, false) {
        if !finding.confident {
            continue;
        }
        hits.entry("TALOS-LLM-SECRET").or_insert_with(|| RuleHit {
            id: "TALOS-LLM-SECRET",
            title: "Hardcoded credential in an assistant configuration file",
            severity: CRITICAL,
            remediation:
                "Move the value to the environment, rotate it, and reference it by name from the instructions"
                    .to_string(),
            reference: LLM02,
            line: finding.line,
            excerpt: format!("{} detected", finding.rule),
            occurrences: 1,
        });
    }

    let mut hits: Vec<RuleHit> = hits.into_values().collect();
    hits.sort_by(|left, right| {
        rank(right.severity)
            .cmp(&rank(left.severity))
            .then_with(|| left.line.cmp(&right.line))
            .then_with(|| left.id.cmp(right.id))
    });
    hits
}

/// Whether a file holds assistant instructions worth scanning.
fn is_instruction_file(path: &Path) -> bool {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some(extension) => TEXT_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str()),
        None => true,
    }
}

fn is_config_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| CONFIG_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Every assistant target: display name plus the relative path it owns.
fn targets() -> Vec<(&'static str, &'static str)> {
    let mut targets: Vec<(&'static str, &'static str)> = ASSISTANTS
        .iter()
        .filter(|(_, dir, _)| !SHARED_DIRS.contains(dir))
        .map(|(name, dir, _)| (*name, *dir))
        .collect();
    targets.extend(EXTRA_TARGETS.iter().copied());
    targets
}

/// Collect every instruction file below `path` (or `path` itself when it is a
/// file), depth-limited and skipping the usual build output.
fn collect_files(path: &Path, depth: usize, files: &mut Vec<PathBuf>) {
    if path.is_file() {
        if is_instruction_file(path)
            && fs::metadata(path)
                .map(|meta| meta.len() <= MAX_FILE_SIZE)
                .unwrap_or(false)
        {
            files.push(path.to_path_buf());
        }
        return;
    }
    if depth >= MAX_TARGET_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(path) else {
        return;
    };
    let mut children: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
    children.sort();
    for child in children {
        let name = child
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_string();
        if child.is_dir() && super::EXCLUDED_DIRS.contains(&name.as_str()) {
            continue;
        }
        collect_files(&child, depth + 1, files);
    }
}

/// Every finding one already-read file produces for one assistant/target
/// pair.
fn scan_file(
    root: &Path,
    file: &Path,
    assistant: &'static str,
    directory: &Path,
) -> Vec<LlmFinding> {
    let Ok(content) = fs::read_to_string(file) else {
        return Vec::new();
    };
    let label = file
        .strip_prefix(root)
        .unwrap_or(file)
        .to_string_lossy()
        .replace('\\', "/");
    scan_content(&content, is_config_file(file))
        .into_iter()
        .map(|hit| LlmFinding {
            assistant: assistant.to_string(),
            file: label.clone(),
            dir: directory.to_path_buf(),
            hit,
        })
        .collect()
}

/// Walk the workspace and scan every assistant configuration it finds. Returns
/// the findings plus the number of scanned files.
pub fn collect(root: &Path) -> (Vec<LlmFinding>, usize) {
    let mut findings = Vec::new();
    let mut scanned = 0usize;
    let mut visited: HashSet<PathBuf> = HashSet::new();
    let mut directories = vec![root.to_path_buf()];
    walk_directories(root, 0, &mut directories);
    let targets = targets();

    for directory in &directories {
        for &(assistant, target) in &targets {
            let path = directory.join(target);
            if !path.exists() {
                continue;
            }
            let mut files = Vec::new();
            collect_files(&path, 0, &mut files);
            for file in files {
                if !visited.insert(file.clone()) {
                    continue;
                }
                scanned += 1;
                findings.extend(scan_file(root, &file, assistant, directory));
            }
        }
    }

    findings.sort_by(|left, right| {
        rank(right.hit.severity)
            .cmp(&rank(left.hit.severity))
            .then_with(|| left.file.cmp(&right.file))
            .then_with(|| left.hit.id.cmp(right.hit.id))
    });
    (findings, scanned)
}

/// Collect the directories that may hold an assistant configuration: the root
/// and every nested module or package.
fn walk_directories(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    if depth >= super::MAX_DEPTH {
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
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if name.starts_with('.') || super::EXCLUDED_DIRS.contains(&name) {
            continue;
        }
        out.push(path.clone());
        walk_directories(&path, depth + 1, out);
    }
}
