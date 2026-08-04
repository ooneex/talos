// Adapters for Roo Code, Continue, and Zed, plus the assistant registry and
// resolver — split out of the parent module to keep it under the file-size
// budget.

use std::path::{Path, PathBuf};

use super::super::codex::to_codex_skill;
use super::super::frontmatter::{
    can_write_files, merge_description, parse_template, to_title_case, yaml_block_scalar,
    yaml_double_quoted,
};
use super::{
    AssistantAdapter, GeneratedFile, ScaffoldInput, agents_md_file, body, cline_adapter,
    codex_adapter, cursor_adapter, default_adapter, front_matter, gemini_adapter, junie_adapter,
    markdown_with_front_matter, slugify, windsurf_adapter,
};

fn roomodes(agents: &[(String, String)]) -> String {
    let mut lines = vec!["customModes:".to_string()];

    for (name, source) in agents {
        let parsed = parse_template(source);
        let groups = if can_write_files(&parsed.data) {
            "[read, edit, command]"
        } else {
            "[read]"
        };

        lines.push(format!("  - slug: {name}"));
        lines.push(format!(
            "    name: {}",
            yaml_double_quoted(&to_title_case(name))
        ));
        lines.push(format!(
            "    roleDefinition: {}",
            yaml_double_quoted(
                parsed
                    .data
                    .get("description")
                    .map(String::as_str)
                    .unwrap_or("")
            )
        ));

        if let Some(when_to_use) = parsed.data.get("when_to_use") {
            lines.push(format!(
                "    whenToUse: {}",
                yaml_double_quoted(when_to_use)
            ));
        }

        lines.push(format!("    groups: {groups}"));
        lines.push(format!(
            "    customInstructions: {}",
            yaml_block_scalar(&parsed.body, 6)
        ));
    }

    format!("{}\n", lines.join("\n"))
}

/// Roo Code: agents become custom modes in `.roomodes`, skills become slash
/// commands under `.roo/commands`, and the AGENTS.md guidance becomes a workspace
/// rule under `.roo/rules`.
pub fn roo_adapter(input: &ScaffoldInput, _config_dir: &str) -> Vec<GeneratedFile> {
    let mut files = vec![
        agents_md_file(input),
        GeneratedFile {
            path: Path::new(".roo").join("rules").join("00-talos.md"),
            content: input.agents_md.clone(),
        },
        GeneratedFile {
            path: PathBuf::from(".roomodes"),
            content: roomodes(&input.agents),
        },
    ];

    for (name, skill) in &input.skills {
        files.push(GeneratedFile {
            path: Path::new(".roo")
                .join("commands")
                .join(format!("{}.md", slugify(name))),
            content: format!("{}\n", body(&skill.source)),
        });
    }

    files
}

/// Continue: an always-applied rule carrying the AGENTS.md guidance plus invokable
/// prompt files (slash commands) under `.continue/prompts`. Agents become
/// invokable prompts too.
pub fn continue_adapter(input: &ScaffoldInput, _config_dir: &str) -> Vec<GeneratedFile> {
    let mut files = vec![
        agents_md_file(input),
        GeneratedFile {
            path: Path::new(".continue").join("rules").join("00-talos.md"),
            content: format!(
                "{}\n\n{}",
                front_matter(&[
                    ("name", yaml_double_quoted("Talos")),
                    ("alwaysApply", "true".to_string()),
                ]),
                input.agents_md
            ),
        },
    ];

    let prompt = |name: &str, source: &str| -> GeneratedFile {
        let parsed = parse_template(source);
        GeneratedFile {
            path: Path::new(".continue")
                .join("prompts")
                .join(format!("{name}.md")),
            content: markdown_with_front_matter(
                source,
                &[
                    ("name", yaml_double_quoted(&to_title_case(name))),
                    (
                        "description",
                        yaml_double_quoted(&merge_description(&parsed.data)),
                    ),
                    ("invokable", "true".to_string()),
                ],
            ),
        }
    };

    for (name, skill) in &input.skills {
        files.push(prompt(&slugify(name), &skill.source));
    }

    for (name, content) in &input.agents {
        files.push(prompt(name, content));
    }

    files
}

/// Zed: a `.rules` project file plus skills under `.agents/skills` following the
/// same `SKILL.md` standard as Codex. Agents are rendered as skills too.
pub fn zed_adapter(input: &ScaffoldInput, _config_dir: &str) -> Vec<GeneratedFile> {
    let mut files = vec![
        agents_md_file(input),
        GeneratedFile {
            path: PathBuf::from(".rules"),
            content: input.agents_md.clone(),
        },
    ];

    for (name, skill) in &input.skills {
        let slug = slugify(name);
        files.push(GeneratedFile {
            path: Path::new(".agents")
                .join("skills")
                .join(&slug)
                .join("SKILL.md"),
            content: to_codex_skill(&skill.source),
        });

        for (ref_name, ref_content) in &skill.references {
            files.push(GeneratedFile {
                path: Path::new(".agents")
                    .join("skills")
                    .join(&slug)
                    .join("references")
                    .join(ref_name),
                content: ref_content.clone(),
            });
        }
    }

    for (name, content) in &input.agents {
        files.push(GeneratedFile {
            path: Path::new(".agents")
                .join("skills")
                .join(name)
                .join("SKILL.md"),
            content: to_codex_skill(content),
        });
    }

    files
}

/// Every assistant the scaffolder can target: display name, config directory,
/// and whether it is enabled by default.
pub const ASSISTANTS: [(&str, &str, bool); 10] = [
    ("Claude", ".claude", true),
    ("Codex", ".codex", true),
    ("Cursor", ".cursor", false),
    ("Gemini", ".gemini", false),
    ("Windsurf", ".windsurf", false),
    ("Cline", ".cline", false),
    ("JetBrains Junie", ".junie", false),
    ("Roo Code", ".roo", false),
    ("Continue", ".continue", false),
    ("Zed", ".zed", false),
];

/// The config directories enabled by default (Claude and Codex).
pub fn default_config_dirs() -> Vec<String> {
    ASSISTANTS
        .iter()
        .filter(|(_, _, enabled)| *enabled)
        .map(|(_, dir, _)| (*dir).to_string())
        .collect()
}

/// Resolve the adapter for a config directory, falling back to the Claude-style
/// layout for `.claude` and any assistant without a dedicated adapter.
pub fn resolve_adapter(config_dir: &str) -> AssistantAdapter {
    match config_dir {
        ".codex" => codex_adapter,
        ".gemini" => gemini_adapter,
        ".cursor" => cursor_adapter,
        ".windsurf" => windsurf_adapter,
        ".cline" => cline_adapter,
        ".junie" => junie_adapter,
        ".roo" => roo_adapter,
        ".continue" => continue_adapter,
        ".zed" => zed_adapter,
        _ => default_adapter,
    }
}
