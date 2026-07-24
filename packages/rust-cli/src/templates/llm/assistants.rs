//! Each coding assistant reads its agent/skill/rule configuration from a
//! different set of paths and file formats. An adapter renders the shared
//! templates into the native layout for one assistant; the scaffolder picks the
//! adapter by config directory and writes whatever files it returns.
//!
//! Sources for each native format:
//!   * Gemini    <https://geminicli.com/docs/cli/custom-commands/> (TOML commands)
//!   * Cursor    <https://cursor.com/docs> — .cursor/commands (plain Markdown)
//!   * Windsurf  <https://docs.windsurf.com/windsurf/cascade/workflows>
//!   * Cline     <https://docs.cline.bot/customization/cline-rules>
//!   * Junie     <https://junie.jetbrains.com/docs/guidelines-and-memory.html>
//!   * Roo Code  <https://docs.roocode.com/features/custom-modes> + /slash-commands
//!   * Continue  <https://docs.continue.dev/customize/deep-dives/prompts>
//!   * Zed       <https://zed.dev/docs/ai/skills> (SKILL.md in .agents/skills)

use std::path::{Path, PathBuf};

use super::codex::{to_codex_agent, to_codex_skill};
use super::frontmatter::{
    can_write_files, merge_description, parse_template, to_title_case, toml_basic_string,
    yaml_block_scalar, yaml_double_quoted,
};

/// A file to be written, with a path relative to the project root.
pub struct GeneratedFile {
    pub path: PathBuf,
    pub content: String,
}

/// A skill: its `SKILL.md` source plus any reference docs, kept in a stable
/// order to match the deterministic layout the loader produces.
pub struct SkillInput {
    pub source: String,
    pub references: Vec<(String, String)>,
}

/// The shared inputs every adapter renders. `agents` and `skills` are ordered
/// so the generated files are deterministic.
pub struct ScaffoldInput {
    pub agents_md: String,
    pub agents: Vec<(String, String)>,
    pub skills: Vec<(String, SkillInput)>,
}

/// An adapter renders the shared input into one assistant's native layout.
pub type AssistantAdapter = fn(&ScaffoldInput, &str) -> Vec<GeneratedFile>;

/// Skill names use dots (e.g. `talos.packages`); most assistants want a
/// filesystem-friendly hyphenated slug for the file/folder name.
fn slugify(name: &str) -> String {
    name.replace('.', "-")
}

/// The body of a template with its Claude front matter stripped.
fn body(source: &str) -> String {
    parse_template(source).body
}

/// A `---` front-matter block from `key: value` pairs (values already escaped).
fn front_matter(fields: &[(&str, String)]) -> String {
    let mut lines = vec!["---".to_string()];
    for (key, value) in fields {
        lines.push(format!("{key}: {value}"));
    }
    lines.push("---".to_string());
    lines.join("\n")
}

/// Render a template as Markdown with a fresh front matter block prepended.
fn markdown_with_front_matter(source: &str, fields: &[(&str, String)]) -> String {
    format!("{}\n\n{}\n", front_matter(fields), body(source))
}

/// The shared root context file every assistant gets.
fn agents_md_file(input: &ScaffoldInput) -> GeneratedFile {
    GeneratedFile {
        path: PathBuf::from("AGENTS.md"),
        content: input.agents_md.clone(),
    }
}

/// Claude and any assistant without a dedicated adapter: AGENTS.md at the root,
/// agent Markdown files under `<dir>/agents`, and `SKILL.md` folders (plus their
/// reference docs) under `<dir>/skills`.
pub fn default_adapter(input: &ScaffoldInput, config_dir: &str) -> Vec<GeneratedFile> {
    let mut files = vec![agents_md_file(input)];
    let base = Path::new(config_dir);

    for (name, content) in &input.agents {
        files.push(GeneratedFile {
            path: base.join("agents").join(format!("{name}.md")),
            content: content.clone(),
        });
    }

    for (name, skill) in &input.skills {
        let slug = slugify(name);
        files.push(GeneratedFile {
            path: base.join("skills").join(&slug).join("SKILL.md"),
            content: skill.source.clone(),
        });

        for (ref_name, ref_content) in &skill.references {
            files.push(GeneratedFile {
                path: base
                    .join("skills")
                    .join(&slug)
                    .join("references")
                    .join(ref_name),
                content: ref_content.clone(),
            });
        }
    }

    files
}

/// Codex: TOML custom agents under `.codex/agents` and trimmed `SKILL.md` folders
/// under `.codex/skills`.
pub fn codex_adapter(input: &ScaffoldInput, _config_dir: &str) -> Vec<GeneratedFile> {
    let mut files = vec![agents_md_file(input)];

    for (name, content) in &input.agents {
        files.push(GeneratedFile {
            path: Path::new(".codex")
                .join("agents")
                .join(format!("{name}.toml")),
            content: to_codex_agent(content),
        });
    }

    for (name, skill) in &input.skills {
        let slug = slugify(name);
        files.push(GeneratedFile {
            path: Path::new(".codex")
                .join("skills")
                .join(&slug)
                .join("SKILL.md"),
            content: to_codex_skill(&skill.source),
        });

        for (ref_name, ref_content) in &skill.references {
            files.push(GeneratedFile {
                path: Path::new(".codex")
                    .join("skills")
                    .join(&slug)
                    .join("references")
                    .join(ref_name),
                content: ref_content.clone(),
            });
        }
    }

    files
}

/// Render a template as a Gemini TOML command: a one-line description plus the
/// body as the `prompt` literal string.
fn gemini_command(source: &str) -> String {
    let parsed = parse_template(source);

    format!(
        "description = {}\nprompt = '''\n{}\n'''\n",
        toml_basic_string(&merge_description(&parsed.data)),
        parsed.body
    )
}

/// Gemini CLI: `GEMINI.md` context plus TOML commands. Dotted skill names become
/// namespaced commands via sub-directories; agents live under an `agents/`
/// namespace.
pub fn gemini_adapter(input: &ScaffoldInput, _config_dir: &str) -> Vec<GeneratedFile> {
    let mut files = vec![
        agents_md_file(input),
        GeneratedFile {
            path: PathBuf::from("GEMINI.md"),
            content: input.agents_md.clone(),
        },
    ];

    for (name, skill) in &input.skills {
        let command_path = format!("{}.toml", name.replace('.', "/"));
        files.push(GeneratedFile {
            path: Path::new(".gemini").join("commands").join(command_path),
            content: gemini_command(&skill.source),
        });
    }

    for (name, content) in &input.agents {
        files.push(GeneratedFile {
            path: Path::new(".gemini")
                .join("commands")
                .join("agents")
                .join(format!("{name}.toml")),
            content: gemini_command(content),
        });
    }

    files
}

/// Cursor: AGENTS.md context plus plain-Markdown slash commands under
/// `.cursor/commands` — Cursor commands do not support front matter, so only the
/// body is written. Agents become commands too.
pub fn cursor_adapter(input: &ScaffoldInput, _config_dir: &str) -> Vec<GeneratedFile> {
    let mut files = vec![agents_md_file(input)];

    for (name, skill) in &input.skills {
        files.push(GeneratedFile {
            path: Path::new(".cursor")
                .join("commands")
                .join(format!("{}.md", slugify(name))),
            content: format!("{}\n", body(&skill.source)),
        });
    }

    for (name, content) in &input.agents {
        files.push(GeneratedFile {
            path: Path::new(".cursor")
                .join("commands")
                .join(format!("{name}.md")),
            content: format!("{}\n", body(content)),
        });
    }

    files
}

/// Windsurf: an always-on rule carrying the AGENTS.md guidance plus slash-command
/// workflows under `.windsurf/workflows`. Agents become workflows too.
pub fn windsurf_adapter(input: &ScaffoldInput, _config_dir: &str) -> Vec<GeneratedFile> {
    let mut files = vec![
        agents_md_file(input),
        GeneratedFile {
            path: Path::new(".windsurf").join("rules").join("talos.md"),
            content: format!(
                "{}\n\n{}",
                front_matter(&[("trigger", "always_on".to_string())]),
                input.agents_md
            ),
        },
    ];

    let workflow = |name: &str, source: &str| -> GeneratedFile {
        let parsed = parse_template(source);
        GeneratedFile {
            path: Path::new(".windsurf")
                .join("workflows")
                .join(format!("{name}.md")),
            content: markdown_with_front_matter(
                source,
                &[(
                    "description",
                    yaml_double_quoted(&merge_description(&parsed.data)),
                )],
            ),
        }
    };

    for (name, skill) in &input.skills {
        files.push(workflow(&slugify(name), &skill.source));
    }

    for (name, content) in &input.agents {
        files.push(workflow(name, content));
    }

    files
}

/// Cline reads every Markdown file under `.clinerules/` as a rule and every file
/// under `.clinerules/workflows/` as an invokable workflow. Skills and agents
/// become workflows; the AGENTS.md guidance becomes a top-level rule.
pub fn cline_adapter(input: &ScaffoldInput, _config_dir: &str) -> Vec<GeneratedFile> {
    let mut files = vec![
        agents_md_file(input),
        GeneratedFile {
            path: Path::new(".clinerules").join("00-talos.md"),
            content: input.agents_md.clone(),
        },
    ];

    for (name, skill) in &input.skills {
        files.push(GeneratedFile {
            path: Path::new(".clinerules")
                .join("workflows")
                .join(format!("{}.md", slugify(name))),
            content: format!("{}\n", body(&skill.source)),
        });
    }

    for (name, content) in &input.agents {
        files.push(GeneratedFile {
            path: Path::new(".clinerules")
                .join("workflows")
                .join(format!("{name}.md")),
            content: format!("{}\n", body(content)),
        });
    }

    files
}

/// Junie reads a single `.junie/guidelines.md`. It has no command/subagent file
/// format, so skills and agents are written as reference docs Junie can open on
/// demand.
pub fn junie_adapter(input: &ScaffoldInput, _config_dir: &str) -> Vec<GeneratedFile> {
    let mut files = vec![
        agents_md_file(input),
        GeneratedFile {
            path: Path::new(".junie").join("guidelines.md"),
            content: input.agents_md.clone(),
        },
    ];

    for (name, skill) in &input.skills {
        files.push(GeneratedFile {
            path: Path::new(".junie")
                .join("skills")
                .join(format!("{}.md", slugify(name))),
            content: format!("{}\n", body(&skill.source)),
        });
    }

    for (name, content) in &input.agents {
        files.push(GeneratedFile {
            path: Path::new(".junie")
                .join("agents")
                .join(format!("{name}.md")),
            content: format!("{}\n", body(content)),
        });
    }

    files
}

/// Render all agents into a single `.roomodes` YAML document as custom modes.
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
