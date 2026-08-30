//! Compatibility adapters that turn shared Claude-flavoured agent/skill
//! templates into the formats Codex expects when a source tree does not yet
//! provide native `.codex` files:
//!
//!   * Codex agents → TOML files whose body becomes the `developer_instructions`
//!     string. See <https://developers.openai.com/codex/subagents>
//!   * Codex skills → `SKILL.md` files whose front matter is trimmed to the two
//!     fields Codex reads (`name`, `description`). See
//!     <https://developers.openai.com/codex/skills>
//!
//! Zed reuses `to_codex_skill` too — its skills follow the same `SKILL.md`
//! standard.

use super::frontmatter::{
    can_write_files, merge_description, parse_template, toml_basic_string, yaml_scalar,
};

/// Render a shared agent template as a Codex custom-agent TOML file. The Claude
/// front matter maps onto Codex's schema: `effort` → `model_reasoning_effort`,
/// the read/write tool set → `sandbox_mode`, and the markdown body → the
/// `developer_instructions` literal string. `model` is intentionally omitted so
/// spawned agents inherit the parent session's model.
pub fn to_codex_agent(source: &str) -> String {
    let parsed = parse_template(source);
    let name = parsed.data.get("name").map(String::as_str).unwrap_or("");

    let mut lines = vec![
        format!("name = {}", toml_basic_string(name)),
        format!(
            "description = {}",
            toml_basic_string(&merge_description(&parsed.data))
        ),
    ];

    if let Some(effort) = parsed.data.get("effort") {
        lines.push(format!(
            "model_reasoning_effort = {}",
            toml_basic_string(effort)
        ));
    }

    lines.push(format!(
        "sandbox_mode = {}",
        toml_basic_string(if can_write_files(&parsed.data) {
            "workspace-write"
        } else {
            "read-only"
        })
    ));
    // A TOML multi-line literal string (''' … ''') keeps the body verbatim — no
    // escaping of backslashes in embedded regexes/paths — and the leading
    // newline after the opening delimiter is trimmed by TOML.
    lines.push("developer_instructions = '''".to_string());
    lines.push(parsed.body);
    lines.push("'''".to_string());

    format!("{}\n", lines.join("\n"))
}

/// Render a shared skill template as a Codex `SKILL.md`. Codex only reads `name`
/// and `description` from the front matter (the "when to use" guidance is folded
/// into the description), so the Claude-only fields are dropped. The body is
/// preserved as-is.
pub fn to_codex_skill(source: &str) -> String {
    let parsed = parse_template(source);
    let name = parsed.data.get("name").map(String::as_str).unwrap_or("");

    let front_matter = [
        "---".to_string(),
        format!("name: {name}"),
        format!(
            "description: {}",
            yaml_scalar(&merge_description(&parsed.data))
        ),
        "---".to_string(),
    ]
    .join("\n");

    format!("{front_matter}\n\n{}\n", parsed.body)
}
