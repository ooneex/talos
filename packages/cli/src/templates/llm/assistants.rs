// Each coding assistant reads its agent/skill/rule configuration from a
// different set of paths and file formats. An adapter renders the shared
// templates into the native layout for one assistant; the scaffolder picks the
// adapter by config directory and writes whatever files it returns.
//
// Sources for each native format:
//   * Gemini    <https://geminicli.com/docs/cli/custom-commands/> (TOML commands)
//   * Cursor    <https://cursor.com/docs> — .cursor/commands (plain Markdown)
//   * Windsurf  <https://docs.windsurf.com/windsurf/cascade/workflows>
//   * Cline     <https://docs.cline.bot/customization/cline-rules>
//   * Junie     <https://junie.jetbrains.com/docs/guidelines-and-memory.html>
//   * Roo Code  <https://docs.roocode.com/features/custom-modes> + /slash-commands
//   * Continue  <https://docs.continue.dev/customize/deep-dives/prompts>
//   * Zed       <https://zed.dev/docs/ai/skills> (SKILL.md in .agents/skills)
//   * Copilot   <https://docs.github.com/en/copilot/reference/custom-agents-configuration>
//               (.github/agents/*.agent.md) + <https://code.visualstudio.com/docs/copilot/customization/prompt-files>
//               (.github/prompts/*.prompt.md)

use std::path::{Path, PathBuf};

use super::codex::{to_codex_agent, to_codex_skill};
use super::frontmatter::{
    merge_description, parse_template, toml_basic_string, yaml_double_quoted,
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
pub(super) fn slugify(name: &str) -> String {
    name.replace('.', "-")
}

/// The body of a template with its Claude front matter stripped.
pub(super) fn body(source: &str) -> String {
    parse_template(source).body
}

/// A `---` front-matter block from `key: value` pairs (values already escaped).
pub(super) fn front_matter(fields: &[(&str, String)]) -> String {
    let mut lines = vec!["---".to_string()];
    for (key, value) in fields {
        lines.push(format!("{key}: {value}"));
    }
    lines.push("---".to_string());
    lines.join("\n")
}

/// Render a template as Markdown with a fresh front matter block prepended.
pub(super) fn markdown_with_front_matter(source: &str, fields: &[(&str, String)]) -> String {
    format!("{}\n\n{}\n", front_matter(fields), body(source))
}

/// The shared root context file every assistant gets.
pub(super) fn agents_md_file(input: &ScaffoldInput) -> GeneratedFile {
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

#[path = "assistants/more.rs"]
mod more;

pub use more::{
    ASSISTANTS, continue_adapter, copilot_adapter, default_config_dirs, resolve_adapter,
    roo_adapter, zed_adapter,
};
