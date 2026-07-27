//! LLM configuration audit — the *instructions* a coding assistant executes.
//!
//! The dependency audit only knows about vulnerable packages. Agent, skill,
//! rule, command and MCP files are just as executable: an assistant reads them
//! as trusted instructions and acts on them with the developer's own shell,
//! tokens and repository access. They arrive through the same untrusted supply
//! chain as any dependency (skeletons, marketplaces, shared repositories, pull
//! requests), so they are scanned for the risks of the OWASP LLM Top 10:
//! injected instructions, hidden text, exfiltration, credential access, remote
//! execution, destructive commands and permission bypasses.
//!
//! Which files belong to which assistant is derived from the provider registry
//! in `templates::llm::assistants::ASSISTANTS`, so a newly supported assistant
//! is audited automatically.

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

/// A detection rule. Every pattern is matched line by line, case-insensitively.
struct Rule {
    id: &'static str,
    title: &'static str,
    severity: &'static str,
    remediation: &'static str,
    reference: &'static str,
    /// Restrict the rule to machine-readable configuration files, where the
    /// pattern cannot be prose describing a command.
    config_only: bool,
    patterns: &'static [&'static str],
}

const LLM01: &str = "https://genai.owasp.org/llmrisk/llm01-prompt-injection/";
const LLM02: &str = "https://genai.owasp.org/llmrisk/llm02-sensitive-information-disclosure/";
const LLM03: &str = "https://genai.owasp.org/llmrisk/llm03-supply-chain/";
const LLM05: &str = "https://genai.owasp.org/llmrisk/llm05-improper-output-handling/";
const LLM06: &str = "https://genai.owasp.org/llmrisk/llm06-excessive-agency/";

const RULES: &[Rule] = &[
    Rule {
        id: "TALOS-LLM-INJECTION",
        title: "Injected instruction overriding the assistant's own rules",
        severity: HIGH,
        remediation: "Delete the override. Instruction files must never tell the assistant to ignore its system prompt, guardrails or the user's rules",
        reference: LLM01,
        config_only: false,
        patterns: &[
            r"(?i)\b(ignore|disregard|forget|discard)\s+(any\s+|all\s+)?(of\s+)?(the\s+|your\s+|these\s+|those\s+)?(previous|prior|preceding|above|earlier|former|initial|original|system)\s+(and\s+\w+\s+)?(instruction|prompt|rule|directive|guideline|message|context)",
            r"(?i)\b(override|overrule|replace|supersede)\s+(the\s+|your\s+|any\s+)?(system\s+|previous\s+|existing\s+)?(prompt|instructions|rules|guardrails|policies|constraints)",
            r"(?i)\b(bypass|disable|turn\s+off|switch\s+off|circumvent|suspend)\s+(all\s+|any\s+|the\s+|your\s+)?(safety|security|guard\s?rails?|restrictions?|limitations?|policies|filters|protections|approval)",
            r"(?i)\byou\s+are\s+now\s+(a\s+|an\s+|in\s+)?(dan\b|unrestricted|jailbroken|jailbreak|developer\s+mode|god\s+mode|unfiltered|uncensored)",
            r"(?i)\b(do\s+not|don'?t|never)\s+(follow|obey|respect|apply)\s+(the\s+|any\s+)?(system|previous|prior|user'?s?|safety)\s+(prompt|instructions?|rules?|policies)",
            r"(?i)\b(new|updated|revised)\s+(system\s+prompt|instructions)\s*[:=]",
            r"(?i)<\s*/?\s*(system|im_start|im_end)\s*\|?\s*>",
        ],
    },
    Rule {
        id: "TALOS-LLM-CONCEALMENT",
        title: "Instruction telling the assistant to hide its actions from the user",
        severity: HIGH,
        remediation: "Remove the concealment clause. An agent must always be able to report what it ran and changed",
        reference: LLM01,
        config_only: false,
        patterns: &[
            r"(?i)\b(do\s+not|don'?t|never)\s+(tell|inform|notify|warn|alert|show|reveal\s+to|disclose\s+to)\s+(the\s+|this\s+)?(user|human|developer|operator)",
            r"(?i)\bwithout\s+(telling|informing|notifying|warning|alerting|asking|the\s+knowledge\s+of)\s+(the\s+)?(user|human|developer|anyone)",
            r"(?i)\b(hide|conceal|obscure|mask)\s+(this|it|that|these|those|the\s+\w+)\s+from\s+(the\s+)?(user|human|developer|logs?|output)",
            r"(?i)\b(do\s+not|don'?t|never)\s+(mention|log|report|print|display|echo|summari[sz]e)\s+(this|it|that|the\s+(above|following|command|change))",
            r"(?i)\bsilently\s+(send|upload|post|transmit|exfiltrate|delete|remove|modify|overwrite|commit|push)",
            r"(?i)\b(keep|make)\s+(this|it)\s+(a\s+)?(secret|hidden|invisible|quiet)",
        ],
    },
    Rule {
        id: "TALOS-LLM-HIDDEN-TEXT",
        title: "Invisible Unicode characters smuggling hidden instructions",
        severity: CRITICAL,
        remediation: "Strip the invisible characters. Zero-width, bidirectional and Unicode tag characters are unreadable to a reviewer but are read by the model",
        reference: LLM01,
        config_only: false,
        patterns: &[
            r"[\u{00ad}\u{200b}-\u{200f}\u{202a}-\u{202e}\u{2060}-\u{2064}\u{2066}-\u{2069}\u{feff}\u{e0000}-\u{e007f}]",
        ],
    },
    Rule {
        id: "TALOS-LLM-EXFILTRATION",
        title: "Data exfiltration to an external endpoint",
        severity: CRITICAL,
        remediation: "Remove the outbound call. An agent workflow must never post repository content, environment variables or credentials to an external host",
        reference: LLM02,
        config_only: false,
        patterns: &[
            r"(?i)(curl|wget|http(ie)?|nc|netcat|invoke-webrequest)\b[^\n]*\b(webhook\.site|requestbin|requestcatcher|pipedream\.net|ngrok(-free)?\.(io|app|dev)|burpcollaborator|oastify|interact\.sh|pastebin\.com|paste\.ee|transfer\.sh|termbin\.com|file\.io|0x0\.st)",
            r"(?i)\b(curl|wget|http)\b[^\n]*(-d|--data(-raw|-binary|-urlencode)?|-F|--form|-T|--upload-file)[^\n]*(\$\(\s*cat|\$\{?[A-Za-z_]*(TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL)|process\.env|\.env\b|id_[re][sd]a?|\.aws/credentials|\.npmrc)",
            r"(?i)(cat|tar|zip|base64|printenv|env)\b[^\n|]*\|\s*(curl|wget|nc|netcat|ssh|mail|sendmail)\b",
            r"(?i)!\[[^\]]*\]\(\s*https?://[^)\s]*(\$\{|\$\(|\{\{|%7B)",
            r"(?i)\b(send|post|upload|transmit|forward|leak|share|report)\b[^\n]{0,40}(\.env\b|\b(secrets?|credentials?|api\s?keys?|access\s+tokens?|tokens?|passwords?|environment\s+variables?|env\s+vars?|source\s+code|repository\s+contents?)\b)[^\n]{0,40}\b(to|into)\b\s+(https?://|[a-z0-9-]+\.[a-z]{2,}\b|my\s+(server|endpoint|webhook|bot))",
            r"(?i)\bdns\s*(exfil|tunnel)|\.(oast|dnslog)\b",
        ],
    },
    Rule {
        id: "TALOS-LLM-CREDENTIAL-ACCESS",
        title: "Instruction reading developer credentials",
        severity: HIGH,
        remediation: "Drop the credential read. Secrets belong in the environment and must never be opened, printed or embedded in a prompt",
        reference: LLM02,
        config_only: false,
        patterns: &[
            r"(?i)(~|\$HOME|/home/[a-z0-9_-]+|/users/[a-z0-9_-]+)/\.(ssh/id_|aws/credentials|npmrc|docker/config\.json|kube/config|git-credentials|netrc|gnupg)",
            r"(?i)\b(cat|less|more|head|tail|type|xxd|strings|open)\b[^\n]*\b(id_rsa|id_ed25519|id_ecdsa|\.pem\b|\.p12\b|credentials\.json|service-account\.json)",
            r"(?i)\b(cat|less|more|head|tail|type|source|export)\b[^\n]*\.env(\.[a-z0-9]+)?\s*(\||>|>>|&&|;)\s*(curl|wget|nc|mail|echo|cat)",
            r"(?i)\b(printenv|env)\b\s*(\||>|>>)|\becho\s+\$\{?[A-Za-z_]*(TOKEN|SECRET|PASSWORD|API_?KEY|CREDENTIAL)",
            r"(?i)\bsecurity\s+(find-generic-password|find-internet-password|dump-keychain)|\bgh\s+auth\s+token\b|\baws\s+sts\s+get-session-token\b",
        ],
    },
    Rule {
        id: "TALOS-LLM-REMOTE-EXEC",
        title: "Downloaded content piped straight into a shell",
        severity: CRITICAL,
        remediation: "Pin and vendor the script, or install through the package manager. Never let an agent execute code fetched at run time",
        reference: LLM05,
        config_only: false,
        patterns: &[
            r"(?i)\b(curl|wget|fetch)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|k|fi|da)?sh\b",
            r"(?i)\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(python[0-9.]*|perl|ruby|node|bun|deno)\b",
            r"(?i)\b(eval|exec|source)\s*\(?\s*[`$]\(?\s*(curl|wget)\b",
            r"(?i)\b(ba|z)?sh\s+<\(\s*(curl|wget)\b",
            r"(?i)\biex\s*\(\s*(new-object\s+net\.webclient|iwr|invoke-webrequest)",
            r"(?i)\bpowershell\b[^\n]*-(enc(odedcommand)?|e)\s+[A-Za-z0-9+/]{20,}",
        ],
    },
    Rule {
        id: "TALOS-LLM-OBFUSCATION",
        title: "Obfuscated payload hidden in the instructions",
        severity: HIGH,
        remediation: "Replace the encoded blob with the plain command it decodes to, so the instruction can be reviewed",
        reference: LLM05,
        config_only: false,
        patterns: &[
            r"(?i)\bbase64\s+(-{1,2}[dD]|--decode)\b[^\n]*\|\s*(sudo\s+)?(ba|z)?sh\b",
            r"(?i)\becho\s+[A-Za-z0-9+/]{40,}={0,2}\s*\|\s*base64",
            r#"(?i)\b(atob|Buffer\.from)\s*\(\s*["'][A-Za-z0-9+/]{40,}={0,2}["']"#,
            r"(?i)(\\x[0-9a-f]{2}){12,}",
            r"(?i)\b(rot13|reverse|decode)\s+(this|the\s+following)\s+(and|then)\s+(run|execute|eval)",
        ],
    },
    Rule {
        id: "TALOS-LLM-DESTRUCTIVE",
        title: "Destructive command in an agent instruction",
        severity: HIGH,
        remediation: "Scope the command to the project directory and keep it behind an explicit confirmation",
        reference: LLM06,
        config_only: false,
        patterns: &[
            r"(?i)\brm\s+(-[a-z]*\s+)*-[a-z]*[rf][a-z]*\s+(-[a-z]+\s+)*(/\s|/$|/\*|~|\$HOME|\*\s*$|\.\.)",
            r"(?i)\bsudo\s+rm\b|\brm\s+-rf\s+--no-preserve-root",
            r"(?i)\b(mkfs(\.[a-z0-9]+)?|fdisk|diskutil\s+erase)\b|\bdd\s+if=/dev/(zero|u?random)\s+of=/dev/",
            r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:",
            r"(?i)\bchmod\s+(-R\s+)?777\s+(/|~|\$HOME)",
            r"(?i)\bgit\s+push\b[^\n]*(--force\b|\s-f\b)|\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f[a-z]*d)\b",
            // Case-sensitive: SQL keywords, so prose such as "Drop database then
            // migrate" describing a CLI flag is not a destructive statement.
            r"\bDROP\s+(DATABASE|SCHEMA)\b|\bTRUNCATE\s+TABLE\b",
            r"(?i)\b(history\s+-c|shred\s+-|unset\s+HISTFILE)\b",
        ],
    },
    Rule {
        id: "TALOS-LLM-PERMISSION-BYPASS",
        title: "Approval or sandbox bypass",
        severity: HIGH,
        remediation: "Remove the bypass and grant the narrowest tool list the workflow needs, so every dangerous action stays behind an approval",
        reference: LLM06,
        config_only: false,
        patterns: &[
            r"(?i)--dangerously-skip-permissions|--dangerously-bypass-approvals-and-sandbox|--yolo\b|--no-sandbox\b|--full-auto\b|--auto-approve\b",
            r#"(?i)"?(bypassPermissions|autoApprove|alwaysAllow|skipPermissions|disableSandbox|autoRun|yolo)"?\s*[:=]\s*("?true"?|"?always"?|\[)"#,
            r#"(?i)"?(approval[_-]?policy|approvalMode|permission[_-]?mode|defaultMode)"?\s*[:=]\s*"?(never|none|auto|full[_-]?auto|bypassPermissions|acceptEdits)"?"#,
            r#"(?i)"?sandbox(_mode)?"?\s*[:=]\s*"?(danger-full-access|off|none|disabled)"?"#,
            r#"(?i)(allowed[_-]?tools|tools|permissions)\s*[:=]\s*\[?\s*["']?(\*|all|any)["']?\s*[,\]]?"#,
            r#"(?i)(Bash|Shell|Execute|Run)\s*\(\s*["']?\*"#,
            r"(?i)\bgit\s+(commit|push)\b[^\n]*--no-verify\b",
        ],
    },
    Rule {
        id: "TALOS-LLM-REMOTE-INSTRUCTIONS",
        title: "Instructions pulled from an untrusted remote source",
        severity: MODERATE,
        remediation: "Vendor the guidance into the repository, where it is reviewed and versioned, instead of fetching it at run time",
        reference: LLM03,
        config_only: false,
        patterns: &[
            r"(?i)\b(fetch|download|curl|wget|retrieve|load|read|open|browse)\b[^\n]{0,80}https?://[^\s)]+[^\n]{0,60}\b(and\s+)?(follow|execute|run|apply|obey|comply\s+with|do)\s+(the\s+|its\s+|any\s+)?(instruction|step|command|task|prompt)",
            r"(?i)\b(follow|obey|apply|execute)\s+(the\s+)?(instruction|step|command|prompt)s?\s+(at|from|in|found\s+at)\s+https?://",
            r"(?i)@https?://",
        ],
    },
    Rule {
        id: "TALOS-LLM-MCP-UNPINNED",
        title: "MCP server started from an unpinned or remote command",
        severity: MODERATE,
        remediation: "Pin the MCP server to an exact version (and ideally an integrity hash) so a hijacked release cannot reach the assistant",
        reference: LLM03,
        config_only: true,
        patterns: &[
            r#"(?i)"(command|args)"\s*:\s*(\[[^\]]*)?"?(npx|bunx|uvx|pipx)\b[^"\]]*(@latest|@\*)?"#,
            r#"(?i)"command"\s*:\s*"(curl|wget|bash|sh|zsh|powershell|cmd)"#,
            r#"(?i)"(url|serverUrl|endpoint)"\s*:\s*"http://"#,
        ],
    },
];

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
                let Ok(content) = fs::read_to_string(&file) else {
                    continue;
                };
                let label = file
                    .strip_prefix(root)
                    .unwrap_or(&file)
                    .to_string_lossy()
                    .replace('\\', "/");
                for hit in scan_content(&content, is_config_file(&file)) {
                    findings.push(LlmFinding {
                        assistant: assistant.to_string(),
                        file: label.clone(),
                        dir: directory.clone(),
                        hit,
                    });
                }
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
