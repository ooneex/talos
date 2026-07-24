//! Shared helpers for turning the Claude-flavoured agent/skill Markdown into the
//! various formats every other assistant expects. The prose bodies are
//! assistant-agnostic Talos guidance, so each adapter renders its own wrapper
//! around the same canonical content.

use std::collections::BTreeMap;
use std::sync::LazyLock;

use regex::Regex;

/// Flat `key: value` front matter (no nested YAML in these templates).
pub type FrontMatter = BTreeMap<String, String>;

pub struct ParsedTemplate {
    pub data: FrontMatter,
    pub body: String,
}

static FRONT_MATTER_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)^---\n(.*?)\n---\n?").expect("valid front matter regex"));

static WRITE_TOOL_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b(?:Write|Edit)\b").expect("valid write tool regex"));

static YAML_NEEDS_QUOTING_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r##":\s|\s#|^[\s!"#%&*,>?@\[\]{|}'`-]|\s$"##).expect("valid yaml quoting regex")
});

/// Split a Markdown template into its `---`-delimited front matter and body. The
/// front matter is a flat `key: value` list, so a line-by-line parse is enough.
/// The body is trimmed of leading newlines and trailing whitespace.
pub fn parse_template(source: &str) -> ParsedTemplate {
    if let Some(captures) = FRONT_MATTER_RE.captures(source) {
        let whole = captures.get(0).expect("group 0 always present");
        let front = captures.get(1).map(|m| m.as_str()).unwrap_or("");

        let mut data = FrontMatter::new();
        for line in front.split('\n') {
            let Some(separator) = line.find(':') else {
                continue;
            };
            let key = line[..separator].trim();
            let value = line[separator + 1..].trim();
            if !key.is_empty() {
                data.insert(key.to_string(), value.to_string());
            }
        }

        let body = source[whole.end()..]
            .trim_start_matches('\n')
            .trim_end()
            .to_string();

        return ParsedTemplate { data, body };
    }

    ParsedTemplate {
        data: FrontMatter::new(),
        body: source.trim().to_string(),
    }
}

/// Fold the Claude `description` and `when_to_use` fields into one sentence.
pub fn merge_description(data: &FrontMatter) -> String {
    [data.get("description"), data.get("when_to_use")]
        .into_iter()
        .flatten()
        .map(String::as_str)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// Whether an agent's Claude tool set lets it modify files.
pub fn can_write_files(data: &FrontMatter) -> bool {
    data.get("tools")
        .is_some_and(|tools| WRITE_TOOL_RE.is_match(tools))
}

/// Turn a hyphenated template name into a Title Case display name, e.g.
/// `api-issue-fixer` → `Api Issue Fixer`.
pub fn to_title_case(name: &str) -> String {
    name.split(['-', '.'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Escape a value for a TOML basic (double-quoted) string.
pub fn toml_basic_string(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

/// Escape a value for a YAML double-quoted scalar.
pub fn yaml_double_quoted(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

/// Render a value as a YAML scalar, double-quoting it only when a plain scalar
/// would be misparsed. Keeps the common case unquoted.
pub fn yaml_scalar(value: &str) -> String {
    if YAML_NEEDS_QUOTING_RE.is_match(value) {
        yaml_double_quoted(value)
    } else {
        value.to_string()
    }
}

/// Render a multi-line string as a YAML literal block scalar (`|-`) whose lines
/// are indented by `indent` spaces. Blank lines are emitted empty.
pub fn yaml_block_scalar(body: &str, indent: usize) -> String {
    let pad = " ".repeat(indent);
    let lines = body
        .split('\n')
        .map(|line| {
            if line.is_empty() {
                String::new()
            } else {
                format!("{pad}{line}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!("|-\n{lines}")
}
